import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";

// ---- Colour palette ----
const CLR = {
  headerBg: "FF1E1B4B",    // deep indigo
  headerFg: "FFFFFFFF",
  sheet1Bg: "FF0F172A",    // slate-900
  sheet2Bg: "FF0F172A",
  accent:   "FF6366F1",    // indigo-500
  green:    "FF4ADE80",
  red:      "FFF87171",
  yellow:   "FFFBBF24",
  blue:     "FF60A5FA",
  muted:    "FF94A3B8",
  rowAlt:   "FF1E293B",    // slate-800
};

function styleHeader(row: ExcelJS.Row, sheetBg: string) {
  row.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLR.headerBg } };
    cell.font = { bold: true, color: { argb: CLR.headerFg }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: CLR.accent } },
    };
  });
  row.height = 30;
}

function altRow(row: ExcelJS.Row, idx: number) {
  if (idx % 2 === 0) {
    row.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLR.rowAlt } };
    });
  }
}

function setColWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.columns = widths.map(w => ({ width: w }));
}

function colorCell(cell: ExcelJS.Cell, val: number) {
  cell.font = { color: { argb: val >= 0 ? CLR.green : CLR.red }, bold: true };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  if (!tournamentId) return NextResponse.json({ error: "tournamentId gerekli" }, { status: 400 });

  try {
    // ── 1. Fetch tournament meta ──────────────────────────────────────────
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("name")
      .eq("id", tournamentId)
      .single();
    const tName = tournament?.name ?? "Turnuva";

    // ── 2. Fetch tournament_stats (sheet 1 + sheet 3 base) ───────────────
    const { data: stats } = await supabase
      .from("tournament_stats")
      .select(`
        tournament_id, speaker_id, speak_avg, break_status, final_status,
        champion_status, elo_change, carry_bonus,
        speakers!tournament_stats_speaker_id_fkey(name, elo, match_count, career_break_count),
        partner:speakers!tournament_stats_partner_id_fkey(name, elo)
      `)
      .eq("tournament_id", tournamentId);

    // ── 3. Fetch elo_history for this tournament (start/end elo) ─────────
    const { data: history } = await supabase
      .from("elo_history")
      .select("speaker_id, elo_before, elo_after")
      .eq("tournament_id", tournamentId);

    const histMap: Record<string, { before: number; after: number }> = {};
    for (const h of (history ?? [])) {
      histMap[h.speaker_id] = { before: h.elo_before, after: h.elo_after };
    }

    // ── 4. Fetch elo_round_log ────────────────────────────────────────────
    const { data: roundLogs } = await supabase
      .from("elo_round_log")
      .select(`
        speaker_id, round_name, is_outround, placement,
        partner_name, partner_sp, own_sp, sp_diff, distribution_mode,
        team_raw_delta, elo_change, elo_before, elo_after,
        k_factor, team_elo_before, expected_score, actual_score,
        speakers!elo_round_log_speaker_id_fkey(name)
      `)
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true });

    // ── 5. Build team → speakers lookup from stats ────────────────────────
    // Group speakers by partner to reconstruct teams
    const speakerInfo: Record<string, { name: string; elo: number; matchCount: number; careerBreaks: number }> = {};
    for (const s of (stats ?? [])) {
      const sp = s.speakers as any;
      if (sp) speakerInfo[s.speaker_id] = {
        name: sp.name,
        elo: sp.elo,
        matchCount: sp.match_count ?? 0,
        careerBreaks: sp.career_break_count ?? 0,
      };
    }

    // ── 6. Create workbook ────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "MünazaraRank";
    wb.created = new Date();
    wb.modified = new Date();

    // ════════════════════════════════════════════════════════════
    // SHEET 1: Takım ve Outround Özeti
    // ════════════════════════════════════════════════════════════
    const sh1 = wb.addWorksheet("📋 Takım Özeti");
    sh1.views = [{ state: "frozen", ySplit: 2 }];
    setColWidths(sh1, [28, 22, 22, 16, 16, 14, 16, 26]);

    // Title row
    sh1.mergeCells("A1:H1");
    const titleCell1 = sh1.getCell("A1");
    titleCell1.value = `${tName} — Takım & Outround Özeti`;
    titleCell1.font = { bold: true, size: 13, color: { argb: CLR.accent } };
    titleCell1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLR.sheet1Bg } };
    titleCell1.alignment = { horizontal: "center", vertical: "middle" };
    sh1.getRow(1).height = 28;

    const hdr1 = sh1.addRow([
      "Takım / Konuşmacı", "Konuşmacı 1", "Konuşmacı 2",
      "Turnuva Başı Elo", "Turnuva Sonu Elo", "Net Değişim",
      "Break Yaptı Mı?", "En Yüksek Tur",
    ]);
    styleHeader(hdr1, CLR.sheet1Bg);

    // Pair speakers into teams via partner
    const processedPairs = new Set<string>();
    let rowIdx = 0;

    for (const s of (stats ?? [])) {
      const partner = s.partner as any;
      const pairKey = [s.speaker_id, partner?.name ?? ""].sort().join("|");
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const spInfo = speakerInfo[s.speaker_id];
      const hist = histMap[s.speaker_id];
      const startElo = hist?.before ?? 1000;
      const endElo = hist?.after ?? spInfo?.elo ?? 1000;
      const netChange = endElo - startElo;

      // Highest outround from round_log for this speaker
      const spRounds = (roundLogs ?? []).filter(r => r.speaker_id === s.speaker_id && r.is_outround);
      let bestRound = "Yok";
      if (spRounds.some(r => r.round_name?.toLowerCase().includes("final") && !r.round_name?.toLowerCase().includes("yarı") && !r.round_name?.toLowerCase().includes("çeyrek"))) bestRound = "Final";
      else if (spRounds.some(r => r.round_name?.toLowerCase().includes("yarı") || r.round_name?.toLowerCase().includes("semi"))) bestRound = "Yarı Final";
      else if (spRounds.some(r => r.round_name?.toLowerCase().includes("çeyrek") || r.round_name?.toLowerCase().includes("quarter"))) bestRound = "Çeyrek Final";
      else if (spRounds.some(r => r.round_name?.toLowerCase().includes("octo"))) bestRound = "Octofinalist";
      else if (spRounds.length > 0) bestRound = "Break";

      const row = sh1.addRow([
        `${spInfo?.name ?? "?"} & ${partner?.name ?? "Bilinmiyor"}`,
        spInfo?.name ?? "?",
        partner?.name ?? "—",
        startElo,
        endElo,
        netChange,
        s.break_status ? "✅ Evet" : "❌ Hayır",
        bestRound,
      ]);
      altRow(row, rowIdx++);
      colorCell(row.getCell(6), netChange);
      row.getCell(7).font = { color: { argb: s.break_status ? CLR.green : CLR.red } };
      row.eachCell(cell => { cell.alignment = { vertical: "middle" }; });
    }

    // ════════════════════════════════════════════════════════════
    // SHEET 2: Tur Bazlı Elo Dökümü (KRİTİK)
    // ════════════════════════════════════════════════════════════
    const sh2 = wb.addWorksheet("🔢 Tur Bazlı Log");
    sh2.views = [{ state: "frozen", ySplit: 2 }];
    setColWidths(sh2, [14, 22, 14, 10, 12, 12, 11, 11, 10, 10, 9, 22, 14]);

    sh2.mergeCells("A1:M1");
    const titleCell2 = sh2.getCell("A1");
    titleCell2.value = `${tName} — Tur Bazlı Elo Dökümü (EN KRİTİK SAYFA)`;
    titleCell2.font = { bold: true, size: 13, color: { argb: CLR.accent } };
    titleCell2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLR.sheet2Bg } };
    titleCell2.alignment = { horizontal: "center", vertical: "middle" };
    sh2.getRow(1).height = 28;

    const hdr2 = sh2.addRow([
      "Tur Adı", "Konuşmacı Adı", "Partner", "Sıra",
      "K Katsayısı", "Takım Elosu", "Beklenen (EA)", "Gerçekleşen (SA)",
      "Kendi SP", "Partner SP", "SP Farkı",
      "Dağıtım Kuralı", "Elo Değişimi",
    ]);
    styleHeader(hdr2, CLR.sheet2Bg);

    rowIdx = 0;
    for (const r of (roundLogs ?? [])) {
      const spName = (r.speakers as any)?.name ?? "?";
      const distLabel =
        r.distribution_mode === "performans" ? "🔵 Performans (Doğru Orantı)" :
        r.distribution_mode === "gelisim"    ? "🟣 Gelişim (Ters Orantı)" :
        r.distribution_mode === "kayip"      ? "🔴 Kayıp" :
        r.distribution_mode === "outround"   ? "🟠 Eleme Turu" : r.distribution_mode;

      const row = sh2.addRow([
        r.round_name,
        spName,
        r.partner_name ?? "—",
        r.placement,
        r.k_factor ?? "—",
        r.team_elo_before != null ? Math.round(r.team_elo_before) : "—",
        r.expected_score != null ? r.expected_score.toFixed(4) : "—",
        r.actual_score != null ? r.actual_score.toFixed(4) : "—",
        r.own_sp ?? "—",
        r.partner_sp ?? "—",
        r.sp_diff ?? "—",
        distLabel,
        r.elo_change != null ? Math.round(r.elo_change * 10) / 10 : 0,
      ]);
      altRow(row, rowIdx++);

      // Color-code elo_change column (col 13 = M)
      const eloCell = row.getCell(13);
      const eloVal = r.elo_change ?? 0;
      colorCell(eloCell, eloVal);

      // Highlight SP diff > 1 in blue (performans mode trigger)
      if (r.sp_diff != null && r.sp_diff > 1) {
        row.getCell(11).font = { color: { argb: CLR.blue }, bold: true };
      }

      // Highlight outround rows
      if (r.is_outround) {
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1A36" } };
        });
      }

      row.eachCell(cell => { cell.alignment = { vertical: "middle" }; });
    }

    // ════════════════════════════════════════════════════════════
    // SHEET 3: Bireysel Kapanış ve Bonuslar
    // ════════════════════════════════════════════════════════════
    const sh3 = wb.addWorksheet("🏅 Bireysel Kapanış");
    sh3.views = [{ state: "frozen", ySplit: 2 }];
    setColWidths(sh3, [26, 16, 18, 16, 16, 18]);

    sh3.mergeCells("A1:F1");
    const titleCell3 = sh3.getCell("A1");
    titleCell3.value = `${tName} — Bireysel Kapanış ve Bonuslar`;
    titleCell3.font = { bold: true, size: 13, color: { argb: CLR.accent } };
    titleCell3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLR.sheet1Bg } };
    titleCell3.alignment = { horizontal: "center", vertical: "middle" };
    sh3.getRow(1).height = 28;

    const hdr3 = sh3.addRow([
      "Konuşmacı Adı", "Turnuva Başı Elo", "Turlardan Ham Delta",
      "Break Bonusu", "Turnuva Sonu Elo", "Yeni Maç Sayısı",
    ]);
    styleHeader(hdr3, CLR.sheet1Bg);

    rowIdx = 0;
    for (const s of (stats ?? [])) {
      const spInfo = speakerInfo[s.speaker_id];
      const hist = histMap[s.speaker_id];
      const startElo = hist?.before ?? 1000;
      const endElo = hist?.after ?? spInfo?.elo ?? 1000;
      const breakBonus = s.break_status ? 5 : 0;
      const tourRounds = (roundLogs ?? []).filter(r => r.speaker_id === s.speaker_id);
      const rawDeltaSum = tourRounds.reduce((acc, r) => acc + (r.elo_change ?? 0), 0);
      const netDeltaNoBreak = Math.round((rawDeltaSum - breakBonus) * 10) / 10;

      const row = sh3.addRow([
        spInfo?.name ?? "?",
        startElo,
        netDeltaNoBreak,
        breakBonus > 0 ? `+${breakBonus} Elo` : "—",
        endElo,
        spInfo?.matchCount ?? "?",
      ]);
      altRow(row, rowIdx++);
      colorCell(row.getCell(3), netDeltaNoBreak);
      if (breakBonus > 0) row.getCell(4).font = { color: { argb: CLR.yellow }, bold: true };
      colorCell(row.getCell(5), endElo - startElo);
      row.eachCell(cell => { cell.alignment = { vertical: "middle" }; });
    }

    // ── Apply dark background globally ──────────────────────────────────
    for (const sh of [sh1, sh2, sh3]) {
      sh.eachRow(row => {
        row.eachCell(cell => {
          if (!cell.fill || (cell.fill as any).fgColor?.argb === undefined) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLR.sheet1Bg } };
          }
          if (!cell.font?.color) {
            cell.font = { ...(cell.font || {}), color: { argb: "FFE2E8F0" } };
          }
        });
      });
    }

    // ── Stream Excel to client ───────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const safeFilename = tName.replace(/[^a-zA-Z0-9_\-ğüşıöçĞÜŞİÖÇ ]/g, "_");

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFilename}_EloRaporu.xlsx"`,
        "Cache-Control": "no-cache",
      },
    });

  } catch (error: any) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Excel oluşturulurken hata: " + error.message }, { status: 500 });
  }
}
