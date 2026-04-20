import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { ScrapeResult } from "../scrape/route";

interface ProcessInput {
  tournamentId: string;
  speakers: { name: string; totalPoints: number; scores: number[] }[];
  teams: { name: string; speakers: string[] }[];
  results: ScrapeResult["results"] & {
    rooms: { name?: string; placements: string[]; isOutround?: boolean }[];
  };
  warnings?: string[];
  breakCount?: string | number;
  dryRun?: boolean;                          // Preview: hesapla ama kaydetme
  overrideBreaks?: Record<string, boolean>;  // speakerId → true/false
}

interface SpeakerState {
  id: string;
  name: string;
  elo: number;
  matchCount: number;         // K-Faktörü için: sadece salon (oda) sayısı
  eloChange: number;
  totalTournaments: number;
  careerAvgSpeak: number;
  speakAvg: number;
  milestones: string[];
  // Kariyer geneli kümülatif break sayacı
  careerBreakCount: number;
  brBonusTotal: number;
  // Pairwise sayaçlar (win_rate kaynağı)
  pairwiseWins: number;
  pairwiseLosses: number;
  pairwiseTies: number;
  // Prelim-only SP (Avg SP kaynağı)
  prelimSpeakTotal: number;
  prelimRoundCount: number;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function getKFactor(matchCount: number): number {
  if (matchCount <= 20) return 60;   // Yerleştirme
  if (matchCount <= 100) return 50;  // Gelişim
  return 40;                          // Veteran
}

export async function POST(req: NextRequest) {
  try {
    const body: ProcessInput = await req.json();
    const { tournamentId, speakers: scraped, teams, results, dryRun = false } = body;

    if (!Array.isArray(scraped) || !Array.isArray(teams) || !results || !Array.isArray(results.rooms)) {
      throw new Error("Gelen verilerde eksik veya hatalı dizi (array) mevcut.");
    }

    console.log(`Processing ${tournamentId} [dryRun=${dryRun}]: ${scraped.length} speakers, ${teams.length} teams, ${results.rooms.length} rooms`);

    // 0. Alias mapping
    const aliasMap: Record<string, string> = {};
    try {
      const { data: aliasData } = await supabase.from("speaker_aliases").select("*");
      if (aliasData) {
        for (const a of aliasData) aliasMap[a.source_name.toLowerCase()] = a.target_name;
      }
    } catch(e) { console.log("Alias table not found or empty."); }

    // Normalize name to Title Case with Turkish locale: "kuzey kalyoncu" → "Kuzey Kalyoncu"
    function toTitleCase(name: string): string {
      return name
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1).toLocaleLowerCase("tr-TR"))
        .join(" ");
    }

    // Apply Title Case first, then alias mapping
    for (const sp of scraped) {
      sp.name = toTitleCase(sp.name);
      const lower = sp.name.toLowerCase();
      if (aliasMap[lower]) sp.name = aliasMap[lower];
    }
    for (const team of teams) {
      for (let i = 0; i < team.speakers.length; i++) {
        team.speakers[i] = toTitleCase(team.speakers[i]);
        const lower = team.speakers[i].toLowerCase();
        if (aliasMap[lower]) team.speakers[i] = aliasMap[lower];
      }
    }

    // 1. Detect available DB columns
    let hasMatchCountCol = false;
    try { const { error } = await supabase.from("speakers").select("match_count").limit(1); if (!error) hasMatchCountCol = true; } catch(e) {}

    let hasMilestonesCol = false;
    try { const { error } = await supabase.from("speakers").select("milestones").limit(1); if (!error) hasMilestonesCol = true; } catch(e) {}

    let hasCareerBreakCol = false;
    try { const { error } = await supabase.from("speakers").select("career_break_count").limit(1); if (!error) hasCareerBreakCol = true; } catch(e) {}

    let hasBrCountCol = false;
    try { const { error } = await supabase.from("speakers").select("br_count").limit(1); if (!error) hasBrCountCol = true; } catch(e) {}

    // 2. Load / create speaker states
    const speakerMap: Record<string, SpeakerState> = {};
    for (const sp of scraped) {
      let cols = ["id", "elo", "total_tournaments", "career_avg_speak"];
      if (hasMatchCountCol) cols.push("match_count");
      if (hasMilestonesCol) cols.push("milestones");
      if (hasCareerBreakCol) cols.push("career_break_count");
      if (hasBrCountCol) cols.push("br_count", "br_bonus_total");
      const selectQ = cols.join(", ");

      const { data } = await supabase.from("speakers").select(selectQ).eq("name", sp.name).single();
      const existing: any = data;

      if (existing) {
        speakerMap[sp.name] = {
          id: existing.id,
          name: sp.name,
          elo: existing.elo ?? 1000,
          matchCount: hasMatchCountCol ? (existing.match_count || 0) : ((existing.total_tournaments || 0) * 5),
          eloChange: 0,
          totalTournaments: existing.total_tournaments || 0,
          careerAvgSpeak: existing.career_avg_speak || 0,
          speakAvg: 0,
          milestones: existing.milestones || [],
          // Cümülatif: DB'deki mevcut değerden başla
          careerBreakCount: hasCareerBreakCol ? (existing.career_break_count || 0) : (hasBrCountCol ? (existing.br_count || 0) : 0),
          brBonusTotal: hasBrCountCol ? (existing.br_bonus_total || 0) : 0,
          pairwiseWins: 0, pairwiseLosses: 0, pairwiseTies: 0,
          prelimSpeakTotal: 0, prelimRoundCount: 0,
        };
      } else {
        const insertObj: any = { name: sp.name, elo: 1000, total_tournaments: 0, career_avg_speak: 0 };
        if (hasMatchCountCol) insertObj.match_count = 0;

        const { data: created } = await supabase.from("speakers").insert(insertObj).select(selectQ).single();
        const c: any = created;
        if (c) {
          speakerMap[sp.name] = {
            id: c.id, name: sp.name, elo: 1000, matchCount: 0, eloChange: 0,
            totalTournaments: 0, careerAvgSpeak: 0, speakAvg: 0, milestones: [],
            careerBreakCount: 0, brBonusTotal: 0,
            pairwiseWins: 0, pairwiseLosses: 0, pairwiseTies: 0,
            prelimSpeakTotal: 0, prelimRoundCount: 0,
          };
        }
      }
    }

    // 3. Partner / team maps
    const partnerMap: Record<string, string> = {};
    const teamToSpeakers: Record<string, string[]> = {};
    const speakerTeamMap: Record<string, string> = {};
    for (const team of teams) {
      teamToSpeakers[team.name.toLowerCase()] = team.speakers;
      for (const sp of team.speakers) speakerTeamMap[sp] = team.name.toLowerCase();
      if (team.speakers.length >= 2) {
        partnerMap[team.speakers[0]] = team.speakers[1];
        partnerMap[team.speakers[1]] = team.speakers[0];
      }
    }

    // 4. Room loop — Elo calculation + round log + H2H
    const h2hRecords: any[] = [];
    const roundLogInserts: any[] = [];
    const speakerPrelimIdx: Record<string, number> = {};

    for (const room of results.rooms) {
      const teamStates: { name: string; elo: number; speakers: SpeakerState[] }[] = [];
      for (const tName of room.placements) {
        const spNames = teamToSpeakers[tName.toLowerCase()] || [];
        const sps = spNames.map(n => speakerMap[n]).filter(Boolean);
        if (sps.length === 0) {
          console.warn(`[Room eşleşme hatası] Takım "${tName}" için konuşmacı bulunamadı. teamToSpeakers anahtarları: ${Object.keys(teamToSpeakers).join(", ")}`);
          continue;
        }
        teamStates.push({ name: tName, elo: sps.reduce((s, x) => s + x.elo, 0) / sps.length, speakers: sps });
      }
      if (teamStates.length < 2) continue;

      const rName = room.name?.toLowerCase() || "";
      // Outround type detection
      const isFullFinal = room.isOutround &&
        rName.includes("final") && !rName.includes("yarı") && !rName.includes("semi") &&
        !rName.includes("çeyrek") && !rName.includes("quarter") && !rName.includes("octo") && !rName.includes("sekiz");
      // Quarter / Semi: 4 teams where top 2 advance, bottom 2 eliminated
      const isQSFinal = room.isOutround && !isFullFinal && teamStates.length === 4;
      // 2-team knockout (very rare in BP, but handle it)
      const isTwoTeamKO = room.isOutround && teamStates.length === 2;

      const teamRawDeltas = new Map<string, number>();

      // Pairwise matchup scoring
      for (let i = 0; i < teamStates.length; i++) {
        for (let j = i + 1; j < teamStates.length; j++) {
          const tA = teamStates[i];
          const tB = teamStates[j];
          let SA = 0.5, SB = 0.5;

          let skipEloDelta = false;

          if (isFullFinal) {
            // BP Final: sadece 1. sıra (şampiyon) herkesi yener.
            if (i === 0) { SA = 1; SB = 0; }        // tA şampiyon → kazanır
            else if (j === 0) { SA = 0; SB = 1; }   // tB şampiyon → kazanır
            else {
              SA = 0.5; SB = 0.5;
              skipEloDelta = true; // finalist vs finalist → ELO delta atla (sadece H2H berabere)
            }
          } else if (isQSFinal) {
            // Top 2 (indices 0,1) advance; bottom 2 (indices 2,3) eliminated
            const aAdvances = i < 2;
            const bAdvances = j < 2;
            if (aAdvances && bAdvances) {
              SA = 0.5; SB = 0.5;
              skipEloDelta = true; // ilerleyen vs ilerleyen → ELO delta atla (ikisi de kazandı)
            } else if (!aAdvances && !bAdvances) { SA = 0.5; SB = 0.5; } // elenen vs elenen → berabere
            else if (aAdvances && !bAdvances) { SA = 1; SB = 0; }        // A ilerledi, B elendi → A kazandı
            else { SA = 0; SB = 1; }                                     // B ilerledi, A elendi → B kazandı
          } else if (isTwoTeamKO) {
            SA = 1; SB = 0;
          } else if (room.isOutround) {
            SA = 1; SB = 0;
          } else {
            SA = 1; SB = 0;
          }

          if (!skipEloDelta) {
            teamRawDeltas.set(tA.name, (teamRawDeltas.get(tA.name) || 0) + (SA - expectedScore(tA.elo, tB.elo)));
            teamRawDeltas.set(tB.name, (teamRawDeltas.get(tB.name) || 0) + (SB - expectedScore(tB.elo, tA.elo)));
          }

          // 6-Way H2H — isFullFinal için SA/SB zaten doğru, direkt kullan
          for (const spA of tA.speakers) {
            for (const spB of tB.speakers) {
              if (SA > SB) {
                spA.pairwiseWins++; spB.pairwiseLosses++;
                h2hRecords.push({ winner_id: spA.id, loser_id: spB.id, tournament_id: tournamentId, round_name: room.name, round_count: 1, is_tie: false });
              } else if (SA < SB) {
                spB.pairwiseWins++; spA.pairwiseLosses++;
                h2hRecords.push({ winner_id: spB.id, loser_id: spA.id, tournament_id: tournamentId, round_name: room.name, round_count: 1, is_tie: false });
              } else {
                spA.pairwiseTies++; spB.pairwiseTies++;
                h2hRecords.push({ winner_id: spA.id, loser_id: spB.id, tournament_id: tournamentId, round_name: room.name, round_count: 1, is_tie: true });
              }
            }
          }
        }
      }

      // Distribute deltas + build round log per speaker
      // Pre-compute team elo averages (before this room's changes) for audit
      const teamEloSnapshot: Record<string, number> = {};
      for (const ts of teamStates) teamEloSnapshot[ts.name] = ts.elo;

      for (let ti = 0; ti < teamStates.length; ti++) {
        const t = teamStates[ti];
        const placement = ti + 1;
        const rawDelta = teamRawDeltas.get(t.name) || 0;
        const isOutroundFlag = room.isOutround || false;
        const roundLabel = room.name || (isOutroundFlag ? "Outround" : "Tur");
        const teamEloBefore = teamEloSnapshot[t.name];
        // rawDelta = SA - EA, so SA = rawDelta + EA
        // We don't store matchup-level EA easily, but we can estimate team-level EA
        // by averaging EA against all other teams (as processed in pairwise loop)
        const otherTeams = teamStates.filter((_, idx) => idx !== ti);
        const avgOtherElo = otherTeams.length > 0
          ? otherTeams.reduce((s, ot) => s + teamEloSnapshot[ot.name], 0) / otherTeams.length
          : teamEloBefore;
        const estExpected = 1 / (1 + Math.pow(10, (avgOtherElo - teamEloBefore) / 400));
        const estActual = Math.max(0, Math.min(1, rawDelta / Math.max(teamStates.length - 1, 1) + estExpected));

        if (t.speakers.length === 1) {
          const s = t.speakers[0];
          s.matchCount += 1;
          const personalK = getKFactor(s.matchCount - 1);
          const change = personalK * rawDelta * 2;
          const eloBefore = s.elo;
          s.elo += change;
          s.eloChange += change;

          let ownSp: number | null = null;
          if (!isOutroundFlag) {
            const idx = speakerPrelimIdx[s.name] || 0;
            const orig = scraped.find(x => x.name === s.name);
            ownSp = orig?.scores[idx] || 0;
            s.prelimSpeakTotal += ownSp;
            s.prelimRoundCount += 1;
            speakerPrelimIdx[s.name] = idx + 1;
          }

          roundLogInserts.push({
            speaker_id: s.id, tournament_id: tournamentId,
            round_name: roundLabel, is_outround: isOutroundFlag,
            placement, partner_name: null, partner_sp: null, own_sp: ownSp, sp_diff: null,
            distribution_mode: isOutroundFlag ? "outround" : "tek-konusmaci",
            team_raw_delta: rawDelta, elo_change: change,
            elo_before: Math.round(eloBefore * 100) / 100,
            elo_after: Math.round(s.elo * 100) / 100,
            k_factor: personalK,
            team_elo_before: Math.round(teamEloBefore * 100) / 100,
            expected_score: Math.round(estExpected * 10000) / 10000,
            actual_score: Math.round(estActual * 10000) / 10000,
          });

        } else if (t.speakers.length >= 2) {
          const s1 = t.speakers[0];
          const s2 = t.speakers[1];
          const k1 = getKFactor(s1.matchCount);
          const k2 = getKFactor(s2.matchCount);

          s1.matchCount += 1;
          s2.matchCount += 1;

          let sp1 = 0, sp2 = 0;
          // Read SP if available (outrounds may have SP entered manually in admin UI)
          const r1Idx = speakerPrelimIdx[s1.name] || 0;
          const r2Idx = speakerPrelimIdx[s2.name] || 0;
          if (!isOutroundFlag) {
            sp1 = scraped.find(x => x.name === s1.name)?.scores[r1Idx] || 0;
            sp2 = scraped.find(x => x.name === s2.name)?.scores[r2Idx] || 0;
            s1.prelimSpeakTotal += sp1; s1.prelimRoundCount += 1;
            s2.prelimSpeakTotal += sp2; s2.prelimRoundCount += 1;
            speakerPrelimIdx[s1.name] = r1Idx + 1;
            speakerPrelimIdx[s2.name] = r2Idx + 1;
          }
          // For outrounds: sp1=0, sp2=0 → spDiff=0 → gelisim/kayip mode runs naturally

          const sumElo = s1.elo + s2.elo;
          const spDiff = Math.abs(sp1 - sp2);
          let mult1 = 0.5, mult2 = 0.5;
          let distributionMode = "gelisim";

          if (!isOutroundFlag && sp1 === 0 && sp2 > 0) {
            // S1 gelmedi, S2 tek başına yarıştı (Iron)
            mult1 = 0.0;
            mult2 = 1.0;
            distributionMode = "iron";
          } else if (!isOutroundFlag && sp2 === 0 && sp1 > 0) {
            // S2 gelmedi, S1 tek başına yarıştı (Iron)
            mult1 = 1.0;
            mult2 = 0.0;
            distributionMode = "iron";
          } else if (rawDelta > 0) {
            // KAZANIM
            if (spDiff === 0 || isOutroundFlag) {
              // Gelişim Ödülü: SP tam eşit veya outround → ters oranlı ELO (düşük elo'luya büyük pay)
              mult1 = sumElo > 0 ? (s2.elo / sumElo) : 0.5;
              mult2 = 1.0 - mult1;
              distributionMode = isOutroundFlag ? "outround-gelisim" : "gelisim";
            } else {
              // Performans Ödülü: SP farkı doğrudan dağılımı belirler (sensitivity=20, cap 10%-90%)
              // diff=1 → 55/45 | diff=2 → 60/40 | diff=5 → 75/25 | diff≥8 → 90/10
              const signed = sp1 - sp2; // pozitif: s1 daha iyi
              mult1 = Math.max(0.1, Math.min(0.9, 0.5 + signed / 20));
              mult2 = 1.0 - mult1;
              distributionMode = "performans";
            }
          } else if (rawDelta < 0) {
            // KAYIP: SP farkı doğrudan dağılımı belirler (ters yön — iyi SP daha az kaybeder)
            if (!isOutroundFlag && (sp1 + sp2) > 0) {
              const signed = sp1 - sp2; // pozitif: s1 daha iyi → s1 daha az kaybetmeli
              mult1 = Math.max(0.1, Math.min(0.9, 0.5 - signed / 20));
              mult2 = 1.0 - mult1;
            } else {
              // Outround veya SP yok → ELO-bazlı (yüksek elo'lu büyük ceza)
              mult1 = sumElo > 0 ? (s1.elo / sumElo) : 0.5;
              mult2 = 1.0 - mult1;
            }
            distributionMode = isOutroundFlag ? "outround-kayip" : "kayip";
          } else {
            distributionMode = isOutroundFlag ? "outround-berabere" : "berabere";
          }

          const share1 = k1 * rawDelta * mult1 * 2;
          const share2 = k2 * rawDelta * mult2 * 2;
          const elo_before_s1 = s1.elo;
          const elo_before_s2 = s2.elo;

          s1.elo += share1; s2.elo += share2;
          s1.eloChange += share1; s2.eloChange += share2;

          roundLogInserts.push({
            speaker_id: s1.id, tournament_id: tournamentId,
            round_name: roundLabel, is_outround: isOutroundFlag,
            placement, partner_name: s2.name,
            partner_sp: sp2 > 0 ? sp2 : null,
            own_sp: sp1 > 0 ? sp1 : null,
            sp_diff: spDiff > 0 ? spDiff : null,
            distribution_mode: distributionMode,
            team_raw_delta: rawDelta, elo_change: share1,
            elo_before: Math.round(elo_before_s1 * 100) / 100,
            elo_after: Math.round(s1.elo * 100) / 100,
            k_factor: k1,
            team_elo_before: Math.round(teamEloBefore * 100) / 100,
            expected_score: Math.round(estExpected * 10000) / 10000,
            actual_score: Math.round(estActual * 10000) / 10000,
          });
          roundLogInserts.push({
            speaker_id: s2.id, tournament_id: tournamentId,
            round_name: roundLabel, is_outround: isOutroundFlag,
            placement, partner_name: s1.name,
            partner_sp: sp1 > 0 ? sp1 : null,
            own_sp: sp2 > 0 ? sp2 : null,
            sp_diff: spDiff > 0 ? spDiff : null,
            distribution_mode: distributionMode,
            team_raw_delta: rawDelta, elo_change: share2,
            elo_before: Math.round(elo_before_s2 * 100) / 100,
            elo_after: Math.round(s2.elo * 100) / 100,
            k_factor: k2,
            team_elo_before: Math.round(teamEloBefore * 100) / 100,
            expected_score: Math.round(estExpected * 10000) / 10000,
            actual_score: Math.round(estActual * 10000) / 10000,
          });

        }
      }

      // Milestones
      if (room.isOutround) {
        let stageName = "Outround";
        if (rName.includes("final") && !rName.includes("yarı") && !rName.includes("çeyrek") && !rName.includes("octo")) stageName = "Finalist";
        else if (rName.includes("yarı") || rName.includes("semi")) stageName = "Yarı Finalist";
        else if (rName.includes("çeyrek") || rName.includes("quarter")) stageName = "Çeyrek Finalist";
        else if (rName.includes("octo") || rName.includes("sekiz")) stageName = "Octofinalist";
        for (const tA of teamStates) {
          for (const s of tA.speakers) {
            const ms = `${tournamentId} - ${stageName}`;
            if (!s.milestones.includes(ms)) s.milestones.push(ms);
          }
        }
      }
    }

    // Dynamic Break Count Override
    if (body.breakCount && !isNaN(Number(body.breakCount)) && Number(body.breakCount) > 0) {
      results.breaks = teams.slice(0, Number(body.breakCount)).map(t => t.name.toLowerCase());
    }

    // 5. Break Application (cumulative career_break_count)
    const breakSet = new Set(results.breaks.map(n => n.toLowerCase()));
    const finalSet = new Set(results.finalists.map(n => n.toLowerCase()));
    const championSet = new Set(results.champions.map(n => n.toLowerCase()));
    const bestSpeakerSet = new Set(results.bestSpeakers.map(n => n.toLowerCase()));
    const overrideBreaks = body.overrideBreaks || {};
    const BREAK_BONUS = 5;

    for (const spName of Object.keys(speakerMap)) {
      const speaker = speakerMap[spName];
      const teamName = speakerTeamMap[spName] || "";
      const didBreak = speaker.id in overrideBreaks
        ? overrideBreaks[speaker.id]
        : [...breakSet].some(b => teamName.includes(b) || b.includes(teamName));

      if (didBreak) {
        speaker.elo += BREAK_BONUS;
        speaker.eloChange += BREAK_BONUS;
        speaker.careerBreakCount += 1;       // Kümülatif: DB değerine +1 eklenir
        speaker.brBonusTotal += BREAK_BONUS;
      }
    }

    // === DRY RUN: Preview döndür, DB'ye yazma ===
    if (dryRun) {
      const previewSpeakers = scraped.map(sp => {
        const spData = speakerMap[sp.name];
        if (!spData) return null;
        const teamName = speakerTeamMap[sp.name] || "";
        const didBreak = spData.id in overrideBreaks
          ? overrideBreaks[spData.id]
          : [...breakSet].some(b => teamName.includes(b) || b.includes(teamName));
        const prelimSpeakAvg = spData.prelimRoundCount > 0
          ? spData.prelimSpeakTotal / spData.prelimRoundCount : 0;
        const spRounds = roundLogInserts.filter(r => r.speaker_id === spData.id);

        return {
          name: sp.name,
          speakerId: spData.id,
          eloChange: Math.round(spData.eloChange * 10) / 10,
          eloAfter: Math.round(spData.elo),
          didBreak,
          prelimSpeakAvg: Math.round(prelimSpeakAvg * 10) / 10,
          rounds: spRounds.map(r => ({
            roundName: r.round_name,
            placement: r.placement,
            ownSp: r.own_sp,
            partnerSp: r.partner_sp,
            partnerName: r.partner_name,
            spDiff: r.sp_diff,
            distributionMode: r.distribution_mode,
            eloChange: Math.round(r.elo_change * 10) / 10,
            isOutround: r.is_outround,
          })),
        };
      }).filter(Boolean);

      return NextResponse.json({ dryRun: true, speakers: previewSpeakers });
    }

    // === FINALIZE: DB'ye yaz ===
    const statsInserts: any[] = [];
    const historyInserts: any[] = [];
    const speakerUpdates: any[] = [];
    const finalEloChanges: Record<string, number> = {};

    for (const sp of scraped) {
      const spData = speakerMap[sp.name];
      if (!spData) continue;

      const partnerName = partnerMap[sp.name];
      const partnerId = partnerName ? speakerMap[partnerName]?.id : null;
      const nameLower = sp.name.toLowerCase();
      const spTeamLower = speakerTeamMap[sp.name] || "";

      const didBreak = spData.id in overrideBreaks
        ? overrideBreaks[spData.id]
        : [...breakSet].some(b => spTeamLower.includes(b) || b.includes(spTeamLower) || nameLower.includes(b));
      const didFinal = [...finalSet].some(f => spTeamLower.includes(f) || f.includes(spTeamLower) || nameLower.includes(f));
      const didChamp = [...championSet].some(c => spTeamLower.includes(c) || c.includes(spTeamLower) || nameLower.includes(c));

      const prelimSpeakAvg = spData.prelimRoundCount > 0
        ? spData.prelimSpeakTotal / spData.prelimRoundCount : 0;

      finalEloChanges[sp.name] = Math.round(spData.eloChange);

      // break_status / final_status / champion_status: sadece true ise yaz, false ise atla
      // Boylece bir onceki yuksek dogru deger yeniden isleme sirasinda false'a overwrite edilmez
      const statsEntry: Record<string, any> = {
        tournament_id: tournamentId, speaker_id: spData.id,
        speak_avg: Math.round(prelimSpeakAvg * 100) / 100,
        partner_id: partnerId || null,
        best_speaker_status: [...bestSpeakerSet].some(b => nameLower.includes(b) || b.includes(nameLower.split(" ")[0])),
        elo_change: finalEloChanges[sp.name], carry_bonus: 0,
      };
      if (didBreak)  statsEntry.break_status   = true;
      if (didFinal)  statsEntry.final_status   = true;
      if (didChamp)  statsEntry.champion_status = true;
      statsInserts.push(statsEntry);

      historyInserts.push({
        speaker_id: spData.id, tournament_id: tournamentId,
        elo_before: Math.round(spData.elo - spData.eloChange),
        elo_after: Math.round(spData.elo),
      });

      const newTotalTournaments = spData.totalTournaments + 1;
      const newCareerAvg = prelimSpeakAvg > 0
        ? ((spData.careerAvgSpeak * spData.totalTournaments) + prelimSpeakAvg) / newTotalTournaments
        : spData.careerAvgSpeak;
      const totalPairwise = spData.pairwiseWins + spData.pairwiseLosses + spData.pairwiseTies;
      const newWinRate = totalPairwise > 0
        ? ((spData.pairwiseWins + spData.pairwiseTies * 0.5) / totalPairwise) * 100 : 0;

      const spUpdateObj: any = {
        id: spData.id,
        elo: Math.round(spData.elo),
        total_tournaments: newTotalTournaments,
        career_avg_speak: Math.round(newCareerAvg * 100) / 100,
        win_rate: Math.round(newWinRate * 100) / 100,
      };
      if (hasMatchCountCol) spUpdateObj.match_count = spData.matchCount;
      if (hasBrCountCol) { spUpdateObj.br_count = didBreak ? 1 : 0; spUpdateObj.br_bonus_total = spData.brBonusTotal; }
      if (hasCareerBreakCol) spUpdateObj.career_break_count = spData.careerBreakCount;

      speakerUpdates.push(spUpdateObj);
    }

    const uniqueStats = Array.from(new Map(statsInserts.map(i => [i.speaker_id, i])).values());
    const uniqueHistory = Array.from(new Map(historyInserts.map(i => [i.speaker_id, i])).values());
    const uniqueSpeakerUpdates = Array.from(new Map(speakerUpdates.map(i => [i.id, i])).values());

    if (uniqueStats.length > 0) {
      const { error } = await supabase.from("tournament_stats").upsert(uniqueStats, { onConflict: "tournament_id,speaker_id" });
      if (error) throw new Error("Stats Insert Error: " + error.message);
    }
    if (uniqueHistory.length > 0) {
      const { error } = await supabase.from("elo_history").insert(uniqueHistory);
      if (error) throw new Error("History Insert Error: " + error.message);
    }
    if (h2hRecords.length > 0) {
      const { error } = await supabase.from("h2h_records").insert(h2hRecords);
      if (error) console.error("H2H error:", error);
    }
    if (roundLogInserts.length > 0) {
      const { error } = await supabase.from("elo_round_log").insert(roundLogInserts);
      if (error) console.error("Round log error:", error);
    }
    for (const spUpdate of uniqueSpeakerUpdates) {
      const { id, ...payload } = spUpdate;
      const { error } = await supabase.from("speakers").update(payload).eq("id", id);
      if (error) throw new Error(`Speaker update error (${id}): ` + error.message);
    }

    const { error: tError } = await supabase.from("tournaments").update({ status: "processed" }).eq("id", tournamentId);
    if (tError) throw new Error("Tournament update error: " + tError.message);

    // Ham veriyi kaydet — hesaplamaları sıfırlayınca bu veri kullanılarak yeniden analiz yapılabilir
    try {
      await supabase.from("tournaments").update({
        raw_data: {
          speakers: body.speakers,
          teams: body.teams,
          results: body.results,
          breakCount: body.breakCount ?? null,
          overrideBreaks: body.overrideBreaks ?? {},
        }
      }).eq("id", tournamentId);
    } catch (e) {
      // raw_data kolonu henüz eklenmemişse sessizce geç
      console.warn("raw_data kaydedilemedi (kolon yok olabilir):", e);
    }

    return NextResponse.json({ success: true, processed: scraped.length, eloChanges: finalEloChanges, carryBonuses: {} });
  } catch (error: any) {
    console.error("Process error:", error);
    return NextResponse.json({ error: "İşlem sırasında hata oluştu. " + (error?.message || String(error)) }, { status: 500 });
  }
}
