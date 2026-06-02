import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/admin/reprocess
 * Body: { tournamentId: string, dryRun?: boolean }
 *
 * 1. Eğer raw_data varsa → direkt kullan
 * 2. Eğer raw_data yoksa → mevcut elo_round_log, tournament_stats, h2h_records
 *    tablolarından raw_data'yı geri inşa et
 *
 * Böylece mevcut 66 turnuva için de çalışır, hiçbir şey yapma gerek kalmaz.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tournamentId, dryRun = false } = body;

    if (!tournamentId) {
      return NextResponse.json({ error: "tournamentId gerekli." }, { status: 400 });
    }

    // Turnuvayı yükle
    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .select("id, name, base_url, raw_data")
      .eq("id", tournamentId)
      .single();

    if (tErr || !tournament) {
      return NextResponse.json({ error: "Turnuva bulunamadı." }, { status: 404 });
    }

    // Kullanılacak veri: önce kayıtlı raw_data, yoksa DB'den yeniden inşa et
    let payload: any = tournament.raw_data;

    if (!payload) {
      payload = await reconstructFromDb(tournamentId);
      if (!payload) {
        return NextResponse.json({
          error: "Bu turnuva için ne kayıtlı veri ne de yeniden inşa edilebilecek tur verisi bulunuyor.",
          hasRawData: false,
        }, { status: 400 });
      }
    }

    // /api/admin/process endpoint'ini çağır
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const adminToken = req.cookies.get("munazara_admin")?.value;
    const processRes = await fetch(`${baseUrl}/api/admin/process`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(adminToken ? { "Cookie": `munazara_admin=${adminToken}` } : {})
      },
      body: JSON.stringify({
        tournamentId,
        speakers: payload.speakers,
        teams: payload.teams,
        results: payload.results,
        breakCount: payload.breakCount,
        overrideBreaks: payload.overrideBreaks || {},
        dryRun,
      }),
    });

    const result = await processRes.json();
    if (!processRes.ok) {
      return NextResponse.json({ error: result.error || "İşlem hatası." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tournamentName: tournament.name,
      reconstructed: !tournament.raw_data,
      ...result,
    });
  } catch (error: any) {
    console.error("Reprocess error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── DB'den ham veriyi yeniden inşa et ────────────────────────────────────────
async function reconstructFromDb(tournamentId: string): Promise<any | null> {
  try {
    // 1. Tournament stats: kim katıldı, break/final/champion/bestSpeaker durumu
    const { data: statsData } = await supabase
      .from("tournament_stats")
      .select(`
        speaker_id, partner_id, break_status, final_status,
        champion_status, best_speaker_status, speak_avg,
        spk:speakers!tournament_stats_speaker_id_fkey(id, name),
        partner:speakers!tournament_stats_partner_id_fkey(id, name)
      `)
      .eq("tournament_id", tournamentId);

    if (!statsData || statsData.length === 0) return null;

    // 2. Tur seviyesinde ELO log
    const { data: rawLogs } = await supabase
      .from("elo_round_log")
      .select("speaker_id, round_name, placement, own_sp, partner_name, is_outround")
      .eq("tournament_id", tournamentId)
      .order("round_name");

    // 3. H2H kayıtları (aynı tur/oda tespiti için)
    const { data: h2hData } = await supabase
      .from("h2h_records")
      .select("winner_id, loser_id, round_name")
      .eq("tournament_id", tournamentId)
      .not("round_name", "is", null);

    // ── Speaker ID → Name haritası ───────────────────────────────────────────
    const idToName: Record<string, string> = {};
    for (const s of statsData) {
      const spk = (s as any).spk;
      if (spk?.id && spk?.name) idToName[spk.id] = spk.name;
    }

    // ── Partner tespiti (tur loglarından) ────────────────────────────────────
    const partnerPairs = new Set<string>(); // "A|||B" (sorted)
    const speakerHasPartner = new Set<string>();

    for (const log of rawLogs || []) {
      if (!log.partner_name) continue;
      const spName = idToName[log.speaker_id];
      if (!spName) continue;
      const pair = [spName, log.partner_name].sort().join("|||");
      partnerPairs.add(pair);
      speakerHasPartner.add(spName);
      speakerHasPartner.add(log.partner_name);
    }

    // ── Takımlar ─────────────────────────────────────────────────────────────
    const teams: { name: string; speakers: string[] }[] = [];
    const addedTeams = new Set<string>();

    for (const pair of partnerPairs) {
      const [sp1, sp2] = pair.split("|||");
      const key = pair;
      if (!addedTeams.has(key)) {
        teams.push({ name: `${sp1} & ${sp2}`, speakers: [sp1, sp2] });
        addedTeams.add(key);
      }
    }
    // Partnersiz konuşmacılar
    for (const name of Object.values(idToName)) {
      if (!speakerHasPartner.has(name)) {
        teams.push({ name, speakers: [name] });
      }
    }

    // ── Tur loglarını round_name'e göre grupla ───────────────────────────────
    const logsByRound: Record<string, typeof rawLogs> = {};
    for (const log of rawLogs || []) {
      if (!logsByRound[log.round_name]) logsByRound[log.round_name] = [];
      logsByRound[log.round_name]!.push(log);
    }

    // ── H2H komşuluk grafiği (tur bazlı) ────────────────────────────────────
    const adjByRound: Record<string, Record<string, Set<string>>> = {};
    for (const h of h2hData || []) {
      if (!h.round_name) continue;
      if (!adjByRound[h.round_name]) adjByRound[h.round_name] = {};
      const adj = adjByRound[h.round_name];
      if (!adj[h.winner_id]) adj[h.winner_id] = new Set();
      if (!adj[h.loser_id]) adj[h.loser_id] = new Set();
      adj[h.winner_id].add(h.loser_id);
      adj[h.loser_id].add(h.winner_id);
    }

    // ── Bağlı bileşen tespiti (= oda) ───────────────────────────────────────
    function connectedComponents(adj: Record<string, Set<string>>): string[][] {
      const visited = new Set<string>();
      const comps: string[][] = [];
      for (const node of Object.keys(adj)) {
        if (visited.has(node)) continue;
        const comp: string[] = [];
        const q = [node];
        while (q.length) {
          const cur = q.shift()!;
          if (visited.has(cur)) continue;
          visited.add(cur);
          comp.push(cur);
          for (const nb of (adj[cur] || [])) {
            if (!visited.has(nb)) q.push(nb);
          }
        }
        comps.push(comp);
      }
      return comps;
    }

    // ── Odaları inşa et ──────────────────────────────────────────────────────
    const rooms: { name: string; placements: string[]; isOutround: boolean }[] = [];
    const roundNames = Object.keys(logsByRound);

    for (const roundName of roundNames) {
      const roundLogs = logsByRound[roundName]!;
      const isOutround = roundLogs[0]?.is_outround || false;
      const adj = adjByRound[roundName];

      if (adj && Object.keys(adj).length > 0) {
        // H2H verisi varsa: bağlı bileşenler = odalar
        const comps = connectedComponents(adj);
        for (const comp of comps) {
          // Bu odadaki takımları placement sırasına göre sırala
          const placementMap: Record<number, string[]> = {};
          for (const spId of comp) {
            const log = roundLogs.find(l => l.speaker_id === spId);
            if (!log) continue;
            const p = log.placement;
            if (!placementMap[p]) placementMap[p] = [];
            placementMap[p].push(idToName[spId] || spId);
          }
          const orderedPlacements = Object.keys(placementMap)
            .map(Number)
            .sort((a, b) => a - b)
            .map(p => placementMap[p].sort().join(" & "));
          if (orderedPlacements.length > 0) {
            rooms.push({ name: roundName, placements: orderedPlacements, isOutround });
          }
        }
      } else {
        // H2H verisi yoksa: tüm konuşmacıları tek odaya say
        const placementMap: Record<number, string[]> = {};
        for (const log of roundLogs) {
          const name = idToName[log.speaker_id];
          if (!name) continue;
          if (!placementMap[log.placement]) placementMap[log.placement] = [];
          placementMap[log.placement].push(name);
        }
        const orderedPlacements = Object.keys(placementMap)
          .map(Number)
          .sort((a, b) => a - b)
          .map(p => placementMap[p].sort().join(" & "));
        if (orderedPlacements.length > 0) {
          rooms.push({ name: roundName, placements: orderedPlacements, isOutround });
        }
      }
    }

    // ── Konuşmacı SP skorları (prelim turlarından) ──────────────────────────
    const prelimRounds = roundNames.filter(rn => !logsByRound[rn]?.[0]?.is_outround);
    const speakerScores: Record<string, number[]> = {};
    for (let i = 0; i < prelimRounds.length; i++) {
      const roundLogs = logsByRound[prelimRounds[i]]!;
      for (const log of roundLogs) {
        const name = idToName[log.speaker_id];
        if (!name) continue;
        if (!speakerScores[name]) speakerScores[name] = [];
        speakerScores[name][i] = log.own_sp || 0;
      }
    }

    const speakers = Object.values(idToName).map(name => {
      const scores = speakerScores[name] || [];
      const totalPoints = scores.reduce((a, b) => a + b, 0);
      return { name, totalPoints, scores };
    });

    // ── Break / Final / Şampiyon / En İyi Konuşmacı ─────────────────────────
    const breaksSet = new Set<string>();
    const finalistsSet = new Set<string>();
    const championsSet = new Set<string>();
    const bestSpeakersArr: string[] = [];

    for (const stat of statsData) {
      const spk = (stat as any).spk;
      const partner = (stat as any).partner;
      if (!spk?.name) continue;

      const spName = spk.name;
      const partnerName = partner?.name;
      const teamName = partnerName
        ? [spName, partnerName].sort().join(" & ")
        : spName;

      if (stat.break_status) breaksSet.add(teamName);
      if (stat.final_status) finalistsSet.add(teamName);
      if (stat.champion_status) championsSet.add(teamName);
      if (stat.best_speaker_status) bestSpeakersArr.push(spName);
    }

    const breaks = [...breaksSet];
    const breakCount = breaks.length;

    return {
      speakers,
      teams,
      results: {
        rooms,
        breaks,
        finalists: [...finalistsSet],
        champions: [...championsSet],
        bestSpeakers: [...new Set(bestSpeakersArr)],
      },
      breakCount,
      overrideBreaks: {},
    };
  } catch (e) {
    console.error("reconstructFromDb error:", e);
    return null;
  }
}
