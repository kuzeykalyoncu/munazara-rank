import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const label = body.label || new Date().toLocaleString("tr-TR");

    // Tüm kritik verileri çek
    const [speakersRes, historyRes, statsRes] = await Promise.all([
      supabase.from("speakers").select("*"),
      supabase.from("elo_history").select("*"),
      supabase.from("tournament_stats").select("*"),
    ]);

    if (speakersRes.error) throw new Error("Speakers: " + speakersRes.error.message);
    if (historyRes.error) throw new Error("History: " + historyRes.error.message);
    if (statsRes.error) throw new Error("Stats: " + statsRes.error.message);

    // Snapshot kaydet
    const { error: insertErr } = await supabase.from("elo_snapshot").insert({
      label,
      speakers_data: speakersRes.data,
      elo_history_data: historyRes.data,
      tournament_stats_data: statsRes.data,
    });

    if (insertErr) throw new Error("Snapshot kaydedilemedi: " + insertErr.message);

    return NextResponse.json({
      success: true,
      label,
      speakers: speakersRes.data?.length,
      eloHistory: historyRes.data?.length,
      tournamentStats: statsRes.data?.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  // Mevcut snapshot listesi
  const { data, error } = await supabase
    .from("elo_snapshot")
    .select("id, label, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data });
}
