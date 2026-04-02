import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Speaker base info
    const { data: speaker, error: spErr } = await supabase
      .from("speakers")
      .select("*")
      .eq("id", id)
      .single();
    if (spErr || !speaker) {
      return NextResponse.json({ error: "Konuşmacı bulunamadı." }, { status: 404 });
    }

    // ELO history with tournament name
    const { data: eloHistory } = await supabase
      .from("elo_history")
      .select("*, tournaments(name, base_url)")
      .eq("speaker_id", id)
      .order("recorded_at", { ascending: true });

    // H2H as winner (excluding ties)
    const { data: h2hWins } = await supabase
      .from("h2h_records")
      .select("*, loser:speakers!h2h_records_loser_id_fkey(name), tournaments(name)")
      .eq("winner_id", id)
      .or("is_tie.is.null,is_tie.eq.false");

    // H2H as loser (excluding ties)
    const { data: h2hLosses } = await supabase
      .from("h2h_records")
      .select("*, winner:speakers!h2h_records_winner_id_fkey(name), tournaments(name)")
      .eq("loser_id", id)
      .or("is_tie.is.null,is_tie.eq.false");

    // H2H ties (winner_id stores one side of the tie)
    const { data: h2hTies } = await supabase
      .from("h2h_records")
      .select("*, loser:speakers!h2h_records_loser_id_fkey(name), winner:speakers!h2h_records_winner_id_fkey(name), tournaments(name)")
      .eq("is_tie", true)
      .or(`winner_id.eq.${id},loser_id.eq.${id}`);


    // Tournament stats with partner info
    const { data: tournamentStats } = await supabase
      .from("tournament_stats")
      .select(
        "*, tournaments(name, base_url), partner:speakers!tournament_stats_partner_id_fkey(name, elo)"
      )
      .eq("speaker_id", id)
      .order("tournaments(created_at)", { ascending: false });

    return NextResponse.json({
      speaker,
      eloHistory: eloHistory || [],
      h2hWins: h2hWins || [],
      h2hLosses: h2hLosses || [],
      h2hTies: h2hTies || [],
      tournamentStats: tournamentStats || [],
    });
  } catch (error) {
    console.error("Speaker profile error:", error);
    return NextResponse.json(
      { error: "Profil yüklenirken hata oluştu." },
      { status: 500 }
    );
  }
}
