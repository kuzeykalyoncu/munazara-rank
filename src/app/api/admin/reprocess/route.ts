import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/admin/reprocess
 * Body: { tournamentId: string, dryRun?: boolean }
 *
 * Kaydedilmiş ham veriyi yükler ve ELO hesaplamalarını yeniden çalıştırır.
 * Taranan veri, break listesi ve onaylı ayarlar DB'de saklandığından
 * admin panelinde tekrar taramamaya veya soru cevaplamaya gerek kalmaz.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tournamentId, dryRun = false } = body;

    if (!tournamentId) {
      return NextResponse.json({ error: "tournamentId gerekli." }, { status: 400 });
    }

    // Turnuvanın kayıtlı ham verisini yükle
    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .select("id, name, base_url, raw_data")
      .eq("id", tournamentId)
      .single();

    if (tErr || !tournament) {
      return NextResponse.json({ error: "Turnuva bulunamadı." }, { status: 404 });
    }

    if (!tournament.raw_data) {
      return NextResponse.json({
        error: "Bu turnuva için kayıtlı veri yok. Önce turnuvayı tarayıp onaylayın.",
        hasRawData: false,
      }, { status: 400 });
    }

    const rawData = tournament.raw_data as {
      speakers: any[];
      teams: any[];
      results: any;
      breakCount: string | number | null;
      overrideBreaks: Record<string, boolean>;
    };

    // Kayıtlı veriyle /api/admin/process endpoint'ini çağır
    const processRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/admin/process`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          speakers: rawData.speakers,
          teams: rawData.teams,
          results: rawData.results,
          breakCount: rawData.breakCount,
          overrideBreaks: rawData.overrideBreaks,
          dryRun,
        }),
      }
    );

    const result = await processRes.json();

    if (!processRes.ok) {
      return NextResponse.json({ error: result.error || "İşlem hatası." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tournamentName: tournament.name,
      ...result,
    });
  } catch (error: any) {
    console.error("Reprocess error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
