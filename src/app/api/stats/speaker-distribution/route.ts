import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let allLogs: { own_sp: any; created_at: string; tournaments: { name: string } | null }[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data: chunk, error } = await supabase
        .from("elo_round_log")
        .select("own_sp, created_at, tournaments(name)")
        .eq("is_outround", false)
        .not("own_sp", "is", null)
        .gte("own_sp", 60)
        .lte("own_sp", 80)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (!chunk || chunk.length === 0) break;

      allLogs.push(...(chunk as any));
      if (chunk.length < pageSize) break;
      page++;
    }

    const counts: Record<number, number> = {};
    const latestTournamentForScore: Record<number, { name: string; date: string }> = {};

    // Pre-initialize counts from 60 to 80 with 0 for a complete bell curve
    for (let i = 60; i <= 80; i++) {
      counts[i] = 0;
    }

    let totalPoints = 0;
    let sumOfPoints = 0;

    allLogs.forEach((row) => {
      const sp = Math.round(Number(row.own_sp));
      if (sp >= 60 && sp <= 80) {
        counts[sp] = (counts[sp] || 0) + 1;
        totalPoints++;
        sumOfPoints += sp;

        // Track the latest tournament where this score was given
        const createdAt = row.created_at;
        const tournamentName = row.tournaments?.name || "Bilinmeyen Turnuva";
        if (createdAt) {
          const existing = latestTournamentForScore[sp];
          if (!existing || new Date(createdAt) > new Date(existing.date)) {
            latestTournamentForScore[sp] = {
              name: tournamentName,
              date: createdAt
            };
          }
        }
      }
    });

    const average = totalPoints > 0 ? Number((sumOfPoints / totalPoints).toFixed(2)) : 0;

    const distribution = Object.entries(counts).map(([score, count]) => {
      const scoreNum = parseInt(score);
      return {
        score: scoreNum,
        count,
        percentage: totalPoints > 0 ? Number(((count / totalPoints) * 100).toFixed(2)) : 0,
        latestTournament: latestTournamentForScore[scoreNum]?.name || "Belirtilmemiş"
      };
    }).sort((a, b) => a.score - b.score);

    return NextResponse.json(
      { 
        distribution, 
        totalCount: totalPoints,
        average
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Speaker distribution error:", error);
    return NextResponse.json(
      { error: "Konuşmacı puanı dağılımı yüklenemedi." },
      { status: 500 }
    );
  }
}
