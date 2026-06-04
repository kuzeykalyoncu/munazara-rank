import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Try optimized query from speakers table
    const { data: speakers, error: spErr } = await supabase
      .from("speakers")
      .select("id, name, peak_elo, peak_elo_tournament")
      .order("peak_elo", { ascending: false })
      .limit(10);

    if (!spErr && speakers && speakers.length > 0 && speakers.some(s => s.peak_elo !== undefined)) {
      const peakElos = speakers.map(s => ({
        speakerId: s.id,
        name: s.name,
        peakElo: s.peak_elo || 1000,
        tournamentName: s.peak_elo_tournament || "Başlangıç"
      }));
      return NextResponse.json(
        { peakElos },
        {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
          },
        }
      );
    }

    // 2. Fallback: Fetch all elo_history records and group dynamically
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

    const topPeaks = Array.from(peakMap.values())
      .sort((a, b) => b.peakElo - a.peakElo)
      .slice(0, 10);

    return NextResponse.json(
      { peakElos: topPeaks },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Peak ELO error:", error);
    return NextResponse.json(
      { error: "En yüksek ELO verileri yüklenemedi." },
      { status: 500 }
    );
  }
}
