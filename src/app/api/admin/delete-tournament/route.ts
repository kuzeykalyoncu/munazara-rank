import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId } = await req.json();

    if (!tournamentId) {
      return NextResponse.json({ error: "Eksik turnuva ID" }, { status: 400 });
    }

    const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
