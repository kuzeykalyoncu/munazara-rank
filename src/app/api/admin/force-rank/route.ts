import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { speakerId } = await req.json();

    if (!speakerId) {
      return NextResponse.json(
        { error: "Konuşmacı ID gerekli" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("speakers")
      .update({ force_ranked: true })
      .eq("id", speakerId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Force rank error:", error);
    return NextResponse.json(
      { error: "Sıralama güncellenirken hata oluştu" },
      { status: 500 }
    );
  }
}
