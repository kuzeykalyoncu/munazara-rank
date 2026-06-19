import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let allSpeakers: any[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("speakers")
        .select("id, name, elo, total_tournaments, career_avg_speak, win_rate, prelim_round_count, career_break_count, force_ranked, peak_elo, peak_elo_tournament")
        .order("elo", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allSpeakers = allSpeakers.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    return NextResponse.json(
      { speakers: allSpeakers },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Leaderboard yüklenemedi." },
      { status: 500 }
    );
  }
}
