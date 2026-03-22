import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("speaker_aliases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
       if (error.code === '42P01') {
          // Table doesn't exist yet, return empty array gracefully
          return NextResponse.json({ aliases: [] });
       }
       throw error;
    }

    return NextResponse.json({ aliases: data || [] });
  } catch (error: any) {
    console.error("Aliases GET error:", error);
    return NextResponse.json(
      { error: "Alias listesi çekilemedi.", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { source_name, target_name } = await req.json();

    if (!source_name || !target_name) {
      return NextResponse.json({ error: "Eksik parametre." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("speaker_aliases")
      .insert({ source_name, target_name })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, alias: data });
  } catch (error: any) {
    console.error("Aliases POST error:", error);
    return NextResponse.json(
      { error: "Alias eklenemedi.", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Eksik ID." }, { status: 400 });
    }

    const { error } = await supabase
      .from("speaker_aliases")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Aliases DELETE error:", error);
    return NextResponse.json(
      { error: "Alias silinemedi.", details: error.message },
      { status: 500 }
    );
  }
}
