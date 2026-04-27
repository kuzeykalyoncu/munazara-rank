import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { ParsedSpeaker, ParsedTeam } from "../parse-tab/route";

interface ProcessManualInput {
  tournamentId?: string;
  tournamentName?: string;
  speakers: ParsedSpeaker[];
  teams: ParsedTeam[];          // each team has rankScores[] per round (0-3)
  finalists: string[];          // team names of the 4 finalists
  champion: string;             // winning team name
  bestSpeaker: string;          // speaker name
  numRounds: number;
  dryRun?: boolean;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function getKFactor(matchCount: number): number {
  if (matchCount <= 20) return 60;
  if (matchCount <= 100) return 50;
  return 40;
}

function toTitleCase(name: string): string {
  return name.trim().split(/\s+/)
    .map(w => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1).toLocaleLowerCase("tr-TR"))
    .join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const body: ProcessManualInput = await req.json();
    const { tournamentId, tournamentName, speakers: rawSpeakers, teams: rawTeams, finalists, champion, bestSpeaker, numRounds, dryRun = false } = body;

    if (!rawSpeakers || !rawTeams) {
      return NextResponse.json({ error: "Eksik veri." }, { status: 400 });
    }

    let tId = tournamentId;
    if (!dryRun) {
      if (!tId && tournamentName) {
        const { data, error } = await supabase.from("tournaments").insert({
          name: tournamentName,
          base_url: "manual",
          status: "pending"
        }).select("id").single();
        if (error) throw new Error("Turnuva oluşturulamadı: " + error.message);
        tId = data.id;
      }
      if (!tId) return NextResponse.json({ error: "Turnuva ID veya Adı eksik" }, { status: 400 });
    }

    // 0. Alias mapping
    const aliasMap: Record<string, string> = {};
    try {
      const { data } = await supabase.from("speaker_aliases").select("*");
      if (data) for (const a of data) aliasMap[a.source_name.toLowerCase()] = a.target_name;
    } catch {}

    function normalizeName(n: string) {
      const tc = toTitleCase(n);
      return aliasMap[tc.toLowerCase()] || tc;
    }

    // Normalize names
    const speakers = rawSpeakers.map(sp => ({ ...sp, name: normalizeName(sp.name) }));
    const teams = rawTeams.map(t => ({
      ...t,
      teamName: t.teamName.trim(),
      speakers: t.speakers.map(normalizeName),
    }));

    // 1. Detect DB columns
    let hasMatchCountCol = false;
    let hasCareerBreakCol = false;
    let hasBrCountCol = false;
    try { const { error } = await supabase.from("speakers").select("match_count").limit(1); if (!error) hasMatchCountCol = true; } catch {}
    try { const { error } = await supabase.from("speakers").select("career_break_count").limit(1); if (!error) hasCareerBreakCol = true; } catch {}
    try { const { error } = await supabase.from("speakers").select("br_count").limit(1); if (!error) hasBrCountCol = true; } catch {}

    // 2. Load / create speaker states
    interface SpState {
      id: string; name: string; elo: number; matchCount: number;
      eloChange: number; totalTournaments: number; careerAvgSpeak: number;
      careerBreakCount: number; brBonusTotal: number;
      pairwiseWins: number; pairwiseLosses: number; pairwiseTies: number;
      prelimSpeakTotal: number; prelimRoundCount: number;
    }
    const speakerMap: Record<string, SpState> = {};

    const allSpNames = new Set<string>();
    for (const t of teams) for (const sp of t.speakers) allSpNames.add(sp);
    for (const sp of speakers) allSpNames.add(sp.name);

    for (const spName of allSpNames) {
      let cols = ["id", "elo", "total_tournaments", "career_avg_speak"];
      if (hasMatchCountCol) cols.push("match_count");
      if (hasCareerBreakCol) cols.push("career_break_count");
      if (hasBrCountCol) cols.push("br_count", "br_bonus_total");
      const selectQ = cols.join(", ");

      const { data } = await supabase.from("speakers").select(selectQ).eq("name", spName).single();
      if (data) {
        const d = data as any;
        speakerMap[spName] = {
          id: d.id, name: spName, elo: d.elo ?? 1000, matchCount: hasMatchCountCol ? (d.match_count || 0) : ((d.total_tournaments || 0) * 5),
          eloChange: 0, totalTournaments: d.total_tournaments || 0, careerAvgSpeak: d.career_avg_speak || 0,
          careerBreakCount: hasCareerBreakCol ? (d.career_break_count || 0) : (hasBrCountCol ? (d.br_count || 0) : 0),
          brBonusTotal: hasBrCountCol ? (d.br_bonus_total || 0) : 0,
          pairwiseWins: 0, pairwiseLosses: 0, pairwiseTies: 0,
          prelimSpeakTotal: 0, prelimRoundCount: 0,
        };
      } else {
        const insertObj: any = { name: spName, elo: 1000, total_tournaments: 0, career_avg_speak: 0 };
        if (hasMatchCountCol) insertObj.match_count = 0;
        const { data: created } = await supabase.from("speakers").insert(insertObj).select(cols.join(", ")).single();
        const c = created as any;
        if (c) {
          speakerMap[spName] = {
            id: c.id, name: spName, elo: 1000, matchCount: 0, eloChange: 0,
            totalTournaments: 0, careerAvgSpeak: 0, careerBreakCount: 0, brBonusTotal: 0,
            pairwiseWins: 0, pairwiseLosses: 0, pairwiseTies: 0,
            prelimSpeakTotal: 0, prelimRoundCount: 0,
          };
        }
      }
    }

    // Speaker name → per-round scores lookup
    const spScoresMap: Record<string, number[]> = {};
    for (const sp of speakers) spScoresMap[sp.name] = sp.scores;

    // Speaker name → team name lookup
    const spToTeam: Record<string, string> = {};
    for (const t of teams) for (const sp of t.speakers) spToTeam[sp] = t.teamName;

    // Average tournament ELO (used as baseline opponent)
    const avgTournamentElo = () => {
      const vals = Object.values(speakerMap).map(s => s.elo);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 1000;
    };

    const historyInserts: any[] = [];
    const roundLogInserts: any[] = [];
    const h2hRecords: any[] = [];

    // Calculate tournament average SP
    let totalSp = 0;
    let countSp = 0;
    for (const team of teams) {
      for (const spName of team.speakers) {
        const scores = spScoresMap[spName] || [];
        for (const score of scores) {
          if (score > 0) {
            totalSp += score;
            countSp++;
          }
        }
      }
    }
    const tournamentAvgSp = countSp > 0 ? totalSp / countSp : 72;

    // 3. Process prelim rounds
    for (let r = 0; r < numRounds; r++) {
      const avgElo = avgTournamentElo();

      for (const team of teams) {
        const rank = team.rankScores[r]; // 0-3
        const spkScore = team.speakerScores[r]; // combined team speaker score

        // If both score is 0 AND rank is 0 → team didn't play this round (iron/absent)
        const teamDidntPlay = spkScore === 0 && rank === 0;
        if (teamDidntPlay) continue;

        // Actual performance as fraction of wins in 3-opponent room
        const wins = rank;           // 3→3 wins, 2→2, 1→1, 0→0
        const numMatchups = 3;       // BP: 4 teams, 3 pairwise matchups each
        const expPerMatchup = expectedScore(
          team.speakers.map(n => speakerMap[n]?.elo ?? 1000).reduce((a, b) => a + b, 0) / Math.max(team.speakers.length, 1),
          avgElo
        );
        const rawDelta = wins - numMatchups * expPerMatchup;

        // Get per-speaker SP for this round
        const sp1Name = team.speakers[0];
        const sp2Name = team.speakers[1];
        const sp1Data = speakerMap[sp1Name];
        const sp2Data = speakerMap[sp2Name];

        const sp1Score = sp1Data ? (spScoresMap[sp1Name]?.[r] ?? 0) : 0;
        const sp2Score = sp2Data ? (spScoresMap[sp2Name]?.[r] ?? 0) : 0;

        // Iron check: if one speaker's score is 0 and the other played, skip the absent one
        const s1Played = sp1Score > 0 || sp2Score === 0;
        const s2Played = sp2Score > 0 || sp1Score === 0;

        // SP-based distribution
        const spDiff = Math.abs(sp1Score - sp2Score);
        let mult1 = 0.5, mult2 = 0.5;

        if (!s1Played) { mult1 = 0.0; mult2 = 1.0; }
        else if (!s2Played) { mult1 = 1.0; mult2 = 0.0; }
        else if (rawDelta > 0 && spDiff > 0) {
          const signed = sp1Score - sp2Score;
          mult1 = Math.max(0.1, Math.min(0.9, 0.5 + signed / 20));
          mult2 = 1.0 - mult1;
        } else if (rawDelta < 0 && (sp1Score + sp2Score) > 0) {
          const signed = sp1Score - sp2Score;
          mult1 = Math.max(0.1, Math.min(0.9, 0.5 - signed / 20));
          mult2 = 1.0 - mult1;
        } else {
          // ELO-based distribution
          const sumElo = (sp1Data?.elo ?? 1000) + (sp2Data?.elo ?? 1000);
          mult1 = sumElo > 0 ? ((sp2Data?.elo ?? 1000) / sumElo) : 0.5;
          mult2 = 1.0 - mult1;
        }

        [sp1Data, sp2Data].filter(Boolean).forEach((sp, idx) => {
          const mult = idx === 0 ? mult1 : mult2;
          const spScore = idx === 0 ? sp1Score : sp2Score;
          const played = idx === 0 ? s1Played : s2Played;
          if (!sp) return;

          const k = getKFactor(sp.matchCount);
          sp.matchCount += 1;
          const change_base = k * rawDelta * mult * 2;
          
          let spFactor = 1.0;
          if (played && spScore > 0) {
             const deltaSp = spScore - tournamentAvgSp;
             spFactor = Math.max(0.6, Math.min(1.4, 1 + (deltaSp * 0.1)));
          }

          const change = change_base > 0 ? change_base * spFactor : (change_base < 0 ? change_base / spFactor : 0);

          const eloBefore = sp.elo;
          sp.elo += change;
          sp.eloChange += change;

          if (played) {
            sp.prelimSpeakTotal += spScore;
            sp.prelimRoundCount += 1;
          }

          roundLogInserts.push({
            speaker_id: sp.id, tournament_id: tId,
            round_name: `Tur ${r + 1}`, is_outround: false,
            placement: 4 - rank, // rank 3 → 1st place, rank 0 → 4th place
            own_sp: played ? spScore : null,
            partner_name: idx === 0 ? sp2Name : sp1Name,
            partner_sp: null, sp_diff: null,
            distribution_mode: !played ? "iron" : spDiff === 0 ? "gelisim" : "performans",
            team_raw_delta: rawDelta,
            elo_change: Math.round(change * 10) / 10,
            elo_before: Math.round(eloBefore * 100) / 100,
            elo_after: Math.round(sp.elo * 100) / 100,
            k_factor: k,
            team_elo_before: (sp1Data?.elo ?? 1000 + (sp2Data?.elo ?? 1000)) / 2,
            expected_score: Math.round(expPerMatchup * 10000) / 10000,
            actual_score: Math.round((wins / numMatchups) * 10000) / 10000,
          });
        });
      }
    }

    // 4. Break bonus (+5 ELO per speaker on a breaking team)
    // All teams = break unless they're in the bottom teams (heuristic: top teams break)
    // Finalists are known → their speakers get break bonus
    const breakSet = new Set(finalists.map(f => f.toLowerCase()));
    const BREAK_BONUS = 5;

    for (const team of teams) {
      const isBreak = [...breakSet].some(b => team.teamName.toLowerCase().includes(b) || b.includes(team.teamName.toLowerCase()));
      if (isBreak) {
        for (const spName of team.speakers) {
          const sp = speakerMap[spName];
          if (!sp) continue;
          sp.elo += BREAK_BONUS;
          sp.eloChange += BREAK_BONUS;
          sp.careerBreakCount += 1;
          sp.brBonusTotal += BREAK_BONUS;
        }
      }
    }

    // 5. Final H2H — pairwise between finalists
    // Champion beats all, others are ties between each other (isFullFinal logic)
    const finalTeams = teams.filter(t => finalists.some(f => t.teamName.toLowerCase().includes(f.toLowerCase()) || f.toLowerCase().includes(t.teamName.toLowerCase())));
    const championTeam = finalTeams.find(t => t.teamName.toLowerCase().includes(champion.toLowerCase()) || champion.toLowerCase().includes(t.teamName.toLowerCase()));

    const FINAL_K = 60;
    for (let i = 0; i < finalTeams.length; i++) {
      for (let j = i + 1; j < finalTeams.length; j++) {
        const tA = finalTeams[i];
        const tB = finalTeams[j];
        const aIsChamp = tA === championTeam;
        const bIsChamp = tB === championTeam;

        let SA = 0.5, SB = 0.5;
        let isT = true;
        if (aIsChamp) { SA = 1; SB = 0; isT = false; }
        else if (bIsChamp) { SA = 0; SB = 1; isT = false; }
        // else: both non-champion finalists → tie

        const avgEloA = tA.speakers.map(n => speakerMap[n]?.elo ?? 1000).reduce((a, b) => a + b, 0) / Math.max(tA.speakers.length, 1);
        const avgEloB = tB.speakers.map(n => speakerMap[n]?.elo ?? 1000).reduce((a, b) => a + b, 0) / Math.max(tB.speakers.length, 1);

        const rawDeltaA = SA - expectedScore(avgEloA, avgEloB);
        const rawDeltaB = SB - expectedScore(avgEloB, avgEloA);

        for (const spNameA of tA.speakers) {
          const spA = speakerMap[spNameA];
          if (!spA) continue;
          spA.matchCount += 1;
          const changeA = FINAL_K * rawDeltaA / Math.max(tA.speakers.length, 1) * 2;
          spA.elo += changeA;
          spA.eloChange += changeA;

          for (const spNameB of tB.speakers) {
            const spB = speakerMap[spNameB];
            if (!spB) continue;
            if (SA > SB) {
              spA.pairwiseWins++; spB.pairwiseLosses++;
              h2hRecords.push({ winner_id: spA.id, loser_id: spB.id, tournament_id: tId, round_name: "Final", round_count: 1, is_tie: false });
            } else if (SA < SB) {
              spB.pairwiseWins++; spA.pairwiseLosses++;
              h2hRecords.push({ winner_id: spB.id, loser_id: spA.id, tournament_id: tId, round_name: "Final", round_count: 1, is_tie: false });
            } else {
              spA.pairwiseTies++; spB.pairwiseTies++;
              h2hRecords.push({ winner_id: spA.id, loser_id: spB.id, tournament_id: tId, round_name: "Final", round_count: 1, is_tie: true });
            }
          }
        }

        for (const spNameB of tB.speakers) {
          const spB = speakerMap[spNameB];
          if (!spB) continue;
          spB.matchCount += 1;
          const changeB = FINAL_K * rawDeltaB / Math.max(tB.speakers.length, 1) * 2;
          spB.elo += changeB;
          spB.eloChange += changeB;
        }
      }
    }

    // 6. Best Speaker bonus
    const BEST_SPEAKER_BONUS = 15;
    if (bestSpeaker) {
      const bestSpeakerNorm = normalizeName(bestSpeaker);
      const sp = Object.values(speakerMap).find(s => normalizeName(s.name) === bestSpeakerNorm);
      if (sp) {
        sp.elo += BEST_SPEAKER_BONUS;
        sp.eloChange += BEST_SPEAKER_BONUS;
        sp.brBonusTotal += BEST_SPEAKER_BONUS;
      }
    }

    // 7. Dry run → return preview
    if (dryRun) {
      const previewSpeakers = Object.values(speakerMap).map(sp => ({
        name: sp.name,
        speakerId: sp.id,
        eloChange: Math.round(sp.eloChange * 10) / 10,
        eloAfter: Math.round(sp.elo),
        didBreak: finalTeams.some(t => t.speakers.includes(sp.name)),
        didFinal: finalTeams.some(t => t.speakers.includes(sp.name)),
        didChamp: championTeam?.speakers.includes(sp.name) ?? false,
        didBestSpeaker: sp.name === normalizeName(bestSpeaker),
        prelimSpeakAvg: sp.prelimRoundCount > 0 ? Math.round(sp.prelimSpeakTotal / sp.prelimRoundCount * 10) / 10 : 0,
        rounds: roundLogInserts.filter(r => r.speaker_id === sp.id).map(r => ({
          roundName: r.round_name,
          placement: r.placement,
          ownSp: r.own_sp,
          partnerName: r.partner_name,
          eloChange: r.elo_change,
          isOutround: r.is_outround,
        })),
      }));
      return NextResponse.json({ dryRun: true, speakers: previewSpeakers });
    }

    // 7. Write to DB
    const statsInserts: any[] = [];
    const speakerUpdates: any[] = [];
    const finalEloChanges: Record<string, number> = {};
    const bestSpeakerNorm = normalizeName(bestSpeaker);

    for (const sp of Object.values(speakerMap)) {
      finalEloChanges[sp.name] = Math.round(sp.eloChange);
      const isBreak = finalTeams.some(t => t.speakers.includes(sp.name));
      const isFinal = isBreak;
      const isChamp = championTeam?.speakers.includes(sp.name) ?? false;
      const isBestSpeaker = sp.name === bestSpeakerNorm;

      const statsEntry: any = {
        tournament_id: tId, speaker_id: sp.id,
        speak_avg: sp.prelimRoundCount > 0 ? Math.round(sp.prelimSpeakTotal / sp.prelimRoundCount * 100) / 100 : 0,
        partner_id: null, elo_change: finalEloChanges[sp.name], carry_bonus: 0,
        best_speaker_status: isBestSpeaker,
      };
      if (isBreak) statsEntry.break_status = true;
      if (isFinal) statsEntry.final_status = true;
      if (isChamp) statsEntry.champion_status = true;
      statsInserts.push(statsEntry);

      historyInserts.push({
        speaker_id: sp.id, tournament_id: tId,
        elo_before: Math.round(sp.elo - sp.eloChange),
        elo_after: Math.round(sp.elo),
      });

      const newTotal = sp.totalTournaments + 1;
      const newAvgSpeak = sp.prelimRoundCount > 0
        ? ((sp.careerAvgSpeak * sp.totalTournaments) + (sp.prelimSpeakTotal / sp.prelimRoundCount)) / newTotal
        : sp.careerAvgSpeak;

      const update: any = {
        id: sp.id, elo: Math.round(sp.elo),
        total_tournaments: newTotal,
        career_avg_speak: Math.round(newAvgSpeak * 100) / 100,
      };
      if (hasMatchCountCol) update.match_count = sp.matchCount;
      if (hasBrCountCol) { update.br_count = isBreak ? 1 : 0; update.br_bonus_total = sp.brBonusTotal; }
      if (hasCareerBreakCol) update.career_break_count = sp.careerBreakCount;
      speakerUpdates.push(update);
    }

    const uniqueStats = Array.from(new Map(statsInserts.map(i => [i.speaker_id, i])).values());
    const uniqueHistory = Array.from(new Map(historyInserts.map(i => [i.speaker_id, i])).values());
    const uniqueUpdates = Array.from(new Map(speakerUpdates.map(i => [i.id, i])).values());

    if (uniqueStats.length > 0) {
      const { error } = await supabase.from("tournament_stats").upsert(uniqueStats, { onConflict: "tournament_id,speaker_id" });
      if (error) throw new Error("Stats error: " + error.message);
    }
    if (uniqueHistory.length > 0) {
      const { error } = await supabase.from("elo_history").insert(uniqueHistory);
      if (error) throw new Error("History error: " + error.message);
    }
    if (h2hRecords.length > 0) {
      await supabase.from("h2h_records").insert(h2hRecords);
    }
    if (roundLogInserts.length > 0) {
      await supabase.from("elo_round_log").insert(roundLogInserts);
    }
    for (const u of uniqueUpdates) {
      const { id, ...payload } = u;
      const { error } = await supabase.from("speakers").update(payload).eq("id", id);
      if (error) throw new Error(`Speaker update error (${id}): ` + error.message);
    }

    await supabase.from("tournaments").update({ status: "processed" }).eq("id", tId);

    // Save raw data for reprocess
    await supabase.from("tournaments").update({
      raw_data: { speakers: rawSpeakers, teams: rawTeams, finalists, champion, bestSpeaker, numRounds, isManual: true }
    }).eq("id", tId);

    return NextResponse.json({ success: true, processed: Object.keys(speakerMap).length, eloChanges: finalEloChanges });
  } catch (error: any) {
    console.error("process-manual error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
