import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST() {
  try {
    // 1. Clear all computed data tables
    const { error: err1 } = await supabase.from("elo_history").delete().not("id", "is", null);
    if (err1) throw new Error("elo_history temizlenirken hata: " + err1.message);

    const { error: err2 } = await supabase.from("tournament_stats").delete().not("id", "is", null);
    if (err2) throw new Error("tournament_stats temizlenirken hata: " + err2.message);

    const { error: err3 } = await supabase.from("h2h_records").delete().not("id", "is", null);
    if (err3) console.error("h2h_records temizlenirken hata:", err3.message);

    // Also clear round-level audit log
    const { error: errRLog } = await supabase.from("elo_round_log").delete().not("id", "is", null);
    if (errRLog) console.error("elo_round_log temizlenirken hata:", errRLog.message);

    // 2. Reset all speakers to base state
    const updateObj: any = {
      elo: 1000,
      total_tournaments: 0,
      career_avg_speak: 0,
      win_rate: 0,
      peak_elo: 1000,
      peak_elo_tournament: null,
    };

    try { const { error } = await supabase.from("speakers").select("match_count").limit(1); if (!error) updateObj.match_count = 0; } catch(e) {}
    try { const { error } = await supabase.from("speakers").select("br_count").limit(1); if (!error) { updateObj.br_count = 0; updateObj.br_bonus_total = 0; } } catch(e) {}
    // Reset cumulative career break count too
    try { const { error } = await supabase.from("speakers").select("career_break_count").limit(1); if (!error) updateObj.career_break_count = 0; } catch(e) {}

    const { error: err4 } = await supabase.from("speakers").update(updateObj).not("id", "is", null);
    if (err4) throw new Error("speakers sıfırlanırken hata: " + err4.message);

    // 3. Reset tournaments to pending
    const { error: err5 } = await supabase.from("tournaments").update({ status: "pending" }).not("id", "is", null);
    if (err5) throw new Error("tournaments güncellenirken hata: " + err5.message);

    return NextResponse.json({ success: true, message: "Hesaplamalar tamamen sıfırlandı." });
  } catch (error: any) {
    console.error("Reset error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
