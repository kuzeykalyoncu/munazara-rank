import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Fetch all elo_history records with their related speaker and tournament names using pagination
    const allHistory: any[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data: chunk, error } = await supabase
        .from("elo_history")
        .select("elo_after, speaker_id, speakers(name), tournaments(name)")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (!chunk || chunk.length === 0) break;

      allHistory.push(...chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    if (allHistory.length === 0) {
      return NextResponse.json({ peakElos: [] });
    }

    // 2. Group by speaker_id and find the maximum elo_after
    const peakMap = new Map<string, { speakerId: string; name: string; peakElo: number; tournamentName: string }>();

    for (const row of allHistory) {
      const speakerId = row.speaker_id;
      const eloAfter = row.elo_after || 0;
      const speakerName = (row.speakers as any)?.name || "Bilinmeyen Konuşmacı";
      const tournamentName = (row.tournaments as any)?.name || "Bilinmeyen Turnuva";

      const existing = peakMap.get(speakerId);
      if (!existing || eloAfter > existing.peakElo) {
        peakMap.set(speakerId, {
          speakerId,
          name: speakerName,
          peakElo: eloAfter,
          tournamentName,
        });
      }
    }

    // 3. Convert to array, sort descending by peakElo, take top 10
    const topPeaks = Array.from(peakMap.values())
      .sort((a, b) => b.peakElo - a.peakElo)
      .slice(0, 10);

    return NextResponse.json({ peakElos: topPeaks });
  } catch (error) {
    console.error("Peak ELO error:", error);
    return NextResponse.json(
      { error: "En yüksek ELO verileri yüklenemedi." },
      { status: 500 }
    );
  }
}
