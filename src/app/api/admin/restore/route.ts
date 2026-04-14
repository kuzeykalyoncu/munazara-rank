import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { snapshotId } = await req.json();

    // Snapshot'ı yükle
    const { data: snapshot, error: fetchErr } = await supabase
      .from("elo_snapshot")
      .select("*")
      .eq("id", snapshotId)
      .single();

    if (fetchErr || !snapshot) {
      return NextResponse.json({ error: "Snapshot bulunamadı." }, { status: 404 });
    }

    const speakers: any[] = snapshot.speakers_data || [];
    const eloHistory: any[] = snapshot.elo_history_data || [];
    const tournamentStats: any[] = snapshot.tournament_stats_data || [];

    // 1. Speakers'ı geri yükle (ELO ve kariyer istatistikleri)
    const speakerFields = [
      "elo", "total_tournaments", "career_avg_speak", "win_rate",
      "career_break_count", "br_count", "br_bonus_total", "match_count",
    ];

    let speakerErrors = 0;
    for (const sp of speakers) {
      const updateData: any = {};
      for (const f of speakerFields) {
        if (sp[f] !== undefined) updateData[f] = sp[f];
      }
      if (Object.keys(updateData).length === 0) continue;
      const { error } = await supabase.from("speakers").update(updateData).eq("id", sp.id);
      if (error) speakerErrors++;
    }

    // 2. elo_history temizle ve geri yükle
    await supabase.from("elo_history").delete().not("id", "is", null);
    if (eloHistory.length > 0) {
      const { error } = await supabase.from("elo_history").insert(eloHistory);
      if (error) console.error("elo_history restore error:", error.message);
    }

    // 3. tournament_stats temizle ve geri yükle
    await supabase.from("tournament_stats").delete().not("id", "is", null);
    if (tournamentStats.length > 0) {
      // Batch insert (max 500 per chunk)
      const chunkSize = 500;
      for (let i = 0; i < tournamentStats.length; i += chunkSize) {
        const chunk = tournamentStats.slice(i, i + chunkSize);
        const { error } = await supabase.from("tournament_stats").insert(chunk);
        if (error) console.error("tournament_stats restore chunk error:", error.message);
      }
    }

    // 4. Tournaments'ı "processed" olarak işaretle
    await supabase.from("tournaments").update({ status: "processed" }).not("id", "is", null);

    return NextResponse.json({
      success: true,
      label: snapshot.label,
      restored: {
        speakers: speakers.length - speakerErrors,
        eloHistory: eloHistory.length,
        tournamentStats: tournamentStats.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
