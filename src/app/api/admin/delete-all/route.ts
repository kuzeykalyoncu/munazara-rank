import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST() {
  try {
    // 1. Delete all relational data
    const { error: err1 } = await supabase.from("elo_history").delete().not("id", "is", null);
    if (err1) throw err1;

    const { error: err2 } = await supabase.from("tournament_stats").delete().not("id", "is", null);
    if (err2) throw err2;

    const { error: err3 } = await supabase.from("h2h_records").delete().not("id", "is", null);
    if (err3) throw err3;

    // 2. Delete aliases
    try {
      await supabase.from("speaker_aliases").delete().not("id", "is", null);
    } catch (e) {} // ignore if aliases table doesn't exist

    // 3. Delete core entities
    const { error: err4 } = await supabase.from("speakers").delete().not("id", "is", null);
    if (err4) throw err4;

    const { error: err5 } = await supabase.from("tournaments").delete().not("id", "is", null);
    if (err5) throw err5;

    return NextResponse.json({ success: true, message: "Bütün veriler kalıcı olarak silindi." });
  } catch (error: any) {
    console.error("Delete All error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
