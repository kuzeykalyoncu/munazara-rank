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
}

interface SpeakerState {
  id: string;
  name: string;
  elo: number;
  matchCount: number;       // K-Faktörü için: sadece salon (oda) sayısı
  eloChange: number;
  totalTournaments: number;
  careerAvgSpeak: number;
  speakAvg: number;
  milestones: string[];
  // Break tracking
  brCount: number;
  brBonusTotal: number;
  // Pairwise win/loss/tie (win_rate kaynağı)
  pairwiseWins: number;
  pairwiseLosses: number;
  pairwiseTies: number;
  // Prelim-only SP (Avg SP kaynağı)
  prelimSpeakTotal: number;
  prelimRoundCount: number;
}

// Classic ELO expected score formula
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Dynamic K-factor based on match count
function getKFactor(matchCount: number): number {
  if (matchCount <= 20) return 100;
  if (matchCount <= 100) return 50;
  return 24;
}

export async function POST(req: NextRequest) {
  try {
    const body: ProcessInput = await req.json();
    const { tournamentId, speakers: scraped, teams, results } = body;

    if (!Array.isArray(scraped) || !Array.isArray(teams) || !results || !Array.isArray(results.rooms)) {
      throw new Error("Gelen verilerde eksik veya hatalı dizi (array) mevcut.");
    }

    console.log(`Processing tournament ${tournamentId}: ${scraped.length} speakers, ${teams.length} teams, ${results.rooms.length} rooms`);

    // 0. Fetch Aliases and Remap Data
    const aliasMap: Record<string, string> = {};
    try {
       const { data: aliasData } = await supabase.from("speaker_aliases").select("*");
       if (aliasData) {
         for (const a of aliasData) {
           aliasMap[a.source_name.toLowerCase()] = a.target_name;
         }
       }
    } catch(e) { console.log("Alias table not found or empty."); }

    for (const sp of scraped) {
       const lower = sp.name.toLowerCase();
       if (aliasMap[lower]) sp.name = aliasMap[lower];
    }
    
    for (const team of teams) {
       for (let i = 0; i < team.speakers.length; i++) {
         const lower = team.speakers[i].toLowerCase();
         if (aliasMap[lower]) team.speakers[i] = aliasMap[lower];
       }
    }

    // 1. Fetch current database state for speakers
    let hasMatchCountCol = false;
    try {
      const { error: testErr } = await supabase.from("speakers").select("match_count").limit(1);
      if (!testErr) hasMatchCountCol = true;
    } catch (e) {}

    let hasMilestonesCol = false;
    try {
      const { error: mErr } = await supabase.from("speakers").select("milestones").limit(1);
      if (!mErr) hasMilestonesCol = true;
    } catch(e) {}

    const speakerMap: Record<string, SpeakerState> = {};
    for (const sp of scraped) {
      let cols = ["id", "elo", "total_tournaments", "career_avg_speak"];
      if (hasMatchCountCol) cols.push("match_count");
      if (hasMilestonesCol) cols.push("milestones");
      const selectQ = cols.join(", ");
      
      const { data } = await supabase.from("speakers").select(selectQ).eq("name", sp.name).single();
      const existing: any = data;

      if (existing) {
        speakerMap[sp.name] = {
          id: existing.id,
          name: sp.name,
          elo: existing.elo !== undefined && existing.elo !== null ? existing.elo : 1000,
          matchCount: hasMatchCountCol ? (existing.match_count || 0) : ((existing.total_tournaments || 0) * 5),
          eloChange: 0,
          totalTournaments: existing.total_tournaments || 0,
          careerAvgSpeak: existing.career_avg_speak || 0,
          speakAvg: 0, // Will be recalculated from prelim rounds only
          milestones: existing.milestones || [],
          brCount: 0, brBonusTotal: 0,
          pairwiseWins: 0, pairwiseLosses: 0, pairwiseTies: 0,
          prelimSpeakTotal: 0, prelimRoundCount: 0,
        };
      } else {
        const insertObj: any = { name: sp.name, elo: 1000, total_tournaments: 0, career_avg_speak: 0 };
        if (hasMatchCountCol) insertObj.match_count = 0;
        
        const { data } = await supabase.from("speakers").insert(insertObj).select(selectQ).single();
        const created: any = data;
        if (created) {
          speakerMap[sp.name] = {
            id: created.id,
            name: sp.name,
            elo: 1000,
            matchCount: 0,
            eloChange: 0,
            totalTournaments: 0,
            careerAvgSpeak: 0,
            speakAvg: 0,
            milestones: [],
            brCount: 0, brBonusTotal: 0,
            pairwiseWins: 0, pairwiseLosses: 0, pairwiseTies: 0,
            prelimSpeakTotal: 0, prelimRoundCount: 0,
          };
        }
      }
    }

    // 2. Build partner map from teams
    const partnerMap: Record<string, string> = {};
    const teamToSpeakers: Record<string, string[]> = {};
    const speakerTeamMap: Record<string, string> = {};

    for (const team of teams) {
      teamToSpeakers[team.name.toLowerCase()] = team.speakers;
      for (const sp of team.speakers) {
        speakerTeamMap[sp] = team.name.toLowerCase();
      }
      if (team.speakers.length >= 2) {
        partnerMap[team.speakers[0]] = team.speakers[1];
        partnerMap[team.speakers[1]] = team.speakers[0];
      }
    }

    // 3. Process Rooms (Matchups + Elo Calculation iteratively)
    const h2hRecords: any[] = [];
    // speakerInroundCount tracks which score index to use for each speaker's prelim rounds
    const speakerPrelimIdx: Record<string, number> = {};
    
    for (const room of results.rooms) {
      const teamStates: { name: string, elo: number, speakers: SpeakerState[] }[] = [];
      
      // room.placements is ordered 1st to Nth.
      for (const tName of room.placements) {
        const spNames = teamToSpeakers[tName.toLowerCase()] || [];
        const sps = spNames.map(n => speakerMap[n]).filter(Boolean);
        if (sps.length === 0) continue;
        
        const eloAvg = sps.reduce((sum, s) => sum + s.elo, 0) / sps.length;
        teamStates.push({ name: tName, elo: eloAvg, speakers: sps });
      }

      if (teamStates.length < 2) continue; // Invalid room

      // Detect match mode: Standard / Outround / Final
      const rName = room.name?.toLowerCase() || "";
      const isFinal = room.isOutround && teamStates.length === 4 &&
        rName.includes("final") && !rName.includes("yarı") && !rName.includes("çeyrek") && !rName.includes("octo") && !rName.includes("semi") && !rName.includes("quarter");

      const teamRawDeltas = new Map<string, number>();

      // Pairwise matchups (1st beats 2nd, 3rd... 2nd beats 3rd...)
      for (let i = 0; i < teamStates.length; i++) {
        for (let j = i + 1; j < teamStates.length; j++) {
          const tA = teamStates[i]; // Higher placement
          const tB = teamStates[j]; // Lower placement
          
          let SA = 1;
          let SB = 0;

          if (isFinal && teamStates.length === 4) {
            // Final Mode: 1. takım herkesi yener, 2-3-4 arası berabere
            if (i === 0) {
              SA = 1; SB = 0; // Champion beats everyone
            } else {
              SA = 0.5; SB = 0.5; // 2,3,4 arası berabere
            }
          } else if (room.isOutround && teamStates.length === 4) {
            // Outround Mode: 1-2 arası berabere, 3-4 arası berabere, 1-2 > 3-4
            if (i < 2 && j < 2) {
              SA = 0.5; SB = 0.5;
            } else if (i >= 2 && j >= 2) {
              SA = 0.5; SB = 0.5;
            }
          }
          // else: Standard Mode (SA=1, SB=0) — default

          const EA = expectedScore(tA.elo, tB.elo);
          const EB = expectedScore(tB.elo, tA.elo);
          
          const rawDeltaA = (SA - EA);
          const rawDeltaB = (SB - EB);
          
          teamRawDeltas.set(tA.name, (teamRawDeltas.get(tA.name) || 0) + rawDeltaA);
          teamRawDeltas.set(tB.name, (teamRawDeltas.get(tB.name) || 0) + rawDeltaB);

          // ===== 6-Way Cross H2H: All speakers of tA vs all speakers of tB =====
          // NOTE: matchCount (K-factor) is NOT touched here — only pairwise stat counters.
          for (const spA of tA.speakers) {
            for (const spB of tB.speakers) {
              if (SA > SB) {
                // spA wins over spB
                spA.pairwiseWins++;
                spB.pairwiseLosses++;
                h2hRecords.push({
                  winner_id: spA.id, loser_id: spB.id,
                  tournament_id: tournamentId, round_name: room.name,
                  round_count: 1, is_tie: false
                });
              } else if (SA < SB) {
                // spB wins over spA
                spB.pairwiseWins++;
                spA.pairwiseLosses++;
                h2hRecords.push({
                  winner_id: spB.id, loser_id: spA.id,
                  tournament_id: tournamentId, round_name: room.name,
                  round_count: 1, is_tie: false
                });
              } else {
                // Tie (SA === SB === 0.5)
                spA.pairwiseTies++;
                spB.pairwiseTies++;
                h2hRecords.push({
                  winner_id: spA.id, loser_id: spB.id,
                  tournament_id: tournamentId, round_name: room.name,
                  round_count: 1, is_tie: true
                });
              }
            }
          }
        }
      }

      // Distribute Deltas and increment Match Count
      for (const t of teamStates) {
         const rawDelta = teamRawDeltas.get(t.name) || 0;
         
         if (t.speakers.length === 1) {
           const s = t.speakers[0];
           // matchCount = salon sayısı (K-faktörü için)
           s.matchCount += 1;
           const personalK = getKFactor(s.matchCount - 1); // K for this match
           const change = personalK * rawDelta * 2;
           s.elo += change;
           s.eloChange += change;

           // Prelim-only SP tracking (Fix #4)
           if (!room.isOutround) {
             const idx = speakerPrelimIdx[s.name] || 0;
             const orig = scraped.find(x => x.name === s.name);
             const score = orig?.scores[idx] || 0;
             s.prelimSpeakTotal += score;
             s.prelimRoundCount += 1;
             speakerPrelimIdx[s.name] = idx + 1;
           }
         } else if (t.speakers.length >= 2) {
           const s1 = t.speakers[0];
           const s2 = t.speakers[1];
           
           const k1 = getKFactor(s1.matchCount); // K before increment
           const k2 = getKFactor(s2.matchCount);
           
           // matchCount = salon sayısı (K-faktörü için) — H2H döngüsüyle ALAKASIZ
           s1.matchCount += 1;
           s2.matchCount += 1;
           
           let sp1 = 0;
           let sp2 = 0;
           // Prelim-only SP tracking (Fix #4)
           if (!room.isOutround) {
             const r1Idx = speakerPrelimIdx[s1.name] || 0;
             const r2Idx = speakerPrelimIdx[s2.name] || 0;
             const orig1 = scraped.find(x => x.name === s1.name);
             const orig2 = scraped.find(x => x.name === s2.name);
             
             sp1 = orig1?.scores[r1Idx] || 0;
             sp2 = orig2?.scores[r2Idx] || 0;

             s1.prelimSpeakTotal += sp1;
             s1.prelimRoundCount += 1;
             s2.prelimSpeakTotal += sp2;
             s2.prelimRoundCount += 1;
             speakerPrelimIdx[s1.name] = r1Idx + 1;
             speakerPrelimIdx[s2.name] = r2Idx + 1;
           }

           const sumElo = s1.elo + s2.elo; 
           const diff = Math.abs(sp1 - sp2);
           
           let mult1 = 0.5;
           let mult2 = 0.5;

           if (rawDelta > 0) {
              if (!room.isOutround && diff > 1) {
                // Durum 2: Fark 1'den büyükse - Performans Ödülü (Direct proportion)
                mult1 = sumElo > 0 ? (s1.elo / sumElo) : 0.5;
                mult2 = sumElo > 0 ? (s2.elo / sumElo) : 0.5;
              } else {
                // Durum 1: Fark 0 veya 1 ise veya Outround ise - Gelişim Ödülü (Inverse proportion)
                mult1 = sumElo > 0 ? (s2.elo / sumElo) : 0.5;
                mult2 = sumElo > 0 ? (s1.elo / sumElo) : 0.5;
              }
           } else if (rawDelta < 0) {
              // Kayıp Durumu: Taşıyamama Cezası (Direct proportion)
              mult1 = sumElo > 0 ? (s1.elo / sumElo) : 0.5;
              mult2 = sumElo > 0 ? (s2.elo / sumElo) : 0.5;
           }
           
           // A_Degisimi = K_A * (Gercek_Skor - E_Takim) * Performans_Carpani * 2
           const share1 = k1 * rawDelta * mult1 * 2;
           const share2 = k2 * rawDelta * mult2 * 2;
           
           s1.elo += share1;
           s2.elo += share2;
           s1.eloChange += share1;
           s2.eloChange += share2;
         }
      }

      // 3.5 Milestones (No extra Elo bonuses here per user request)
      if (room.isOutround) {
        let stageName = "Outround";
        if (rName.includes("final") && !rName.includes("yarı") && !rName.includes("çeyrek") && !rName.includes("octo")) {
          stageName = "Finalist";
        } else if (rName.includes("yarı") || rName.includes("semi")) {
          stageName = "Yarı Finalist";
        } else if (rName.includes("çeyrek") || rName.includes("quarter")) {
          stageName = "Çeyrek Finalist";
        } else if (rName.includes("octo") || rName.includes("sekiz")) {
          stageName = "Octofinalist";
        }

        for (let i = 0; i < teamStates.length; i++) {
          const tA = teamStates[i];
          for (const s of tA.speakers) {
            const ms = `${tournamentId} - ${stageName}`;
            if (!s.milestones.includes(ms)) s.milestones.push(ms);
          }
        }
      }

    }

    // Dynamic Break Override
    if (body.breakCount && !isNaN(Number(body.breakCount)) && Number(body.breakCount) > 0) {
      const overrideCount = Number(body.breakCount);
      const topTeams = teams.slice(0, overrideCount).map(t => t.name.toLowerCase());
      results.breaks = topTeams;
    }

    // 4. Tournament Break Application
    const breakSet = new Set(results.breaks.map((n) => n.toLowerCase()));
    const finalSet = new Set(results.finalists.map((n) => n.toLowerCase()));
    const championSet = new Set(results.champions.map((n) => n.toLowerCase()));
    const bestSpeakerSet = new Set(results.bestSpeakers.map((n) => n.toLowerCase()));

    const BREAK_BONUS = 5;
    for (const spName of Object.keys(speakerMap)) {
      const speaker = speakerMap[spName];
      const teamName = speakerTeamMap[spName] || "";
      const didBreak = [...breakSet].some((b) => teamName.includes(b) || b.includes(teamName));
      
      if (didBreak) {
        speaker.elo += BREAK_BONUS;
        speaker.eloChange += BREAK_BONUS;
        // Fix #1: Track break count and total bonus earned
        speaker.brCount += 1;
        speaker.brBonusTotal += BREAK_BONUS;
      }
    }

    // 5. Update DB: tournament_stats, elo_history, speakers
    const statsInserts = [];
    const historyInserts = [];
    const speakerUpdates = [];

    const finalEloChanges: Record<string, number> = {};

    for (const sp of scraped) {
      const spData = speakerMap[sp.name];
      if (!spData) continue;

      const partnerName = partnerMap[sp.name];
      const partnerId = partnerName ? speakerMap[partnerName]?.id : null;
      const nameLower = sp.name.toLowerCase();
      const spTeamLower = speakerTeamMap[sp.name] || "";

      const didBreak = [...breakSet].some((b) => spTeamLower.includes(b) || b.includes(spTeamLower) || nameLower.includes(b));
      const didFinal = [...finalSet].some((f) => spTeamLower.includes(f) || f.includes(spTeamLower) || nameLower.includes(f));
      const didChamp = [...championSet].some((c) => spTeamLower.includes(c) || c.includes(spTeamLower) || nameLower.includes(c));

      // Fix #4: Prelim-only Avg SP
      const prelimSpeakAvg = spData.prelimRoundCount > 0
        ? spData.prelimSpeakTotal / spData.prelimRoundCount
        : 0;

      finalEloChanges[sp.name] = Math.round(spData.eloChange);

      statsInserts.push({
        tournament_id: tournamentId,
        speaker_id: spData.id,
        speak_avg: Math.round(prelimSpeakAvg * 100) / 100, // Prelim-only
        partner_id: partnerId || null,
        break_status: didBreak,
        final_status: didFinal,
        champion_status: didChamp,
        best_speaker_status: [...bestSpeakerSet].some((b) => nameLower.includes(b) || b.includes(nameLower.split(" ")[0])),
        elo_change: finalEloChanges[sp.name],
        carry_bonus: 0,
      });

      historyInserts.push({
        speaker_id: spData.id,
        tournament_id: tournamentId,
        elo_before: Math.round(spData.elo - spData.eloChange),
        elo_after: Math.round(spData.elo),
      });

      const newTotalTournaments = spData.totalTournaments + 1;
      // Fix #4: Career avg SP from prelim-only
      const newCareerAvg = prelimSpeakAvg > 0
        ? ((spData.careerAvgSpeak * spData.totalTournaments) + prelimSpeakAvg) / newTotalTournaments
        : spData.careerAvgSpeak;

      // Fix #3: Pairwise Win Rate
      const totalPairwise = spData.pairwiseWins + spData.pairwiseLosses + spData.pairwiseTies;
      const newWinRate = totalPairwise > 0
        ? ((spData.pairwiseWins + spData.pairwiseTies * 0.5) / totalPairwise) * 100
        : 0;

      const spUpdateObj: any = {
        id: spData.id,
        elo: Math.round(spData.elo),
        total_tournaments: newTotalTournaments,
        career_avg_speak: Math.round(newCareerAvg * 100) / 100,
        win_rate: Math.round(newWinRate * 100) / 100,
      };
      if (hasMatchCountCol) spUpdateObj.match_count = spData.matchCount;

      // Fix #1: br_count and br_bonus_total (if columns exist)
      try {
        const { error: brTestErr } = await supabase.from("speakers").select("br_count").limit(1);
        if (!brTestErr) {
          spUpdateObj.br_count = spData.brCount;
          spUpdateObj.br_bonus_total = spData.brBonusTotal;
        }
      } catch(e) {}

      speakerUpdates.push(spUpdateObj);
    }

    const uniqueStats = Array.from(new Map(statsInserts.map(item => [item.speaker_id, item])).values());
    const uniqueHistory = Array.from(new Map(historyInserts.map(item => [item.speaker_id, item])).values());
    const uniqueSpeakerUpdates = Array.from(new Map(speakerUpdates.map(item => [item.id, item])).values());

    if (uniqueStats.length > 0) {
      const { error: statsError } = await supabase.from("tournament_stats").upsert(uniqueStats, { onConflict: 'tournament_id,speaker_id' });
      if (statsError) throw new Error("Stats Insert Error: " + statsError.message);
    }

    if (uniqueHistory.length > 0) {
      const { error: historyError } = await supabase.from("elo_history").insert(uniqueHistory);
      if (historyError) throw new Error("History Insert Error: " + historyError.message);
    }
    
    if (h2hRecords.length > 0) {
      // H2H is purely informational, don't crash on fail
      const { error: h2hErr } = await supabase.from("h2h_records").insert(h2hRecords);
      if (h2hErr) console.error("H2H error:", h2hErr);
    }

    for (const spUpdate of uniqueSpeakerUpdates) {
      const { id, ...payload } = spUpdate;
      const { error: spError } = await supabase.from("speakers").update(payload).eq("id", id);
      if (spError) throw new Error(`Speaker update error (${id}): ` + spError.message);
    }

    const { error: tError } = await supabase.from("tournaments").update({ status: "processed" }).eq("id", tournamentId);
    if (tError) throw new Error("Tournament update error: " + tError.message);

    return NextResponse.json({
      success: true,
      processed: scraped.length,
      eloChanges: finalEloChanges,
      carryBonuses: {}, // Deprecated explicitly, but returning to satisfy old UI types
    });
  } catch (error: any) {
    console.error("Process error:", error);
    return NextResponse.json(
      { error: "İşlem sırasında hata oluştu. " + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}


