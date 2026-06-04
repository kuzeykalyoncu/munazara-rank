import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("speakers")
      .select("id, name, elo, total_tournaments, career_avg_speak, win_rate, prelim_round_count, career_break_count, force_ranked, peak_elo, peak_elo_tournament")
      .order("elo", { ascending: false })
      .limit(600);

    if (error) throw error;

    return NextResponse.json(
      { speakers: data },
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
