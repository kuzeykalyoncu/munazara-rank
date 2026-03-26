import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    // Array of { source_name: string, target_name: string }
    const payload: { source_name: string; target_name: string }[] = await req.json();

    if (!Array.isArray(payload) || payload.length === 0) {
      return NextResponse.json({ error: "Geçersiz veri gönderildi." }, { status: 400 });
    }

    // Insert all mappings at once using upsert to avoid duplicates
    // Convert names to lowercase for robust matching
    const insertData = payload.map(p => ({
       source_name: p.source_name.trim().toLowerCase(),
       target_name: p.target_name.trim(), // Keep original Title Case for target
    }));

    const { error } = await supabase.from("speaker_aliases").upsert(insertData, { onConflict: 'source_name' });
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, count: insertData.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Toplu işlem kaydedilirken hata oluştu: " + error.message },
      { status: 500 }
    );
  }
}
