import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("speakers")
      .select("*")
      .order("elo", { ascending: false })
      .limit(600);

    if (error) throw error;

    return NextResponse.json({ speakers: data });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Leaderboard yüklenemedi." },
      { status: 500 }
    );
  }
}
