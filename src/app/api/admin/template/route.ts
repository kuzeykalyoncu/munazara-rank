import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MunazaraRank";
    workbook.created = new Date();

    // --- Takımlar Sayfası ---
    const teamSheet = workbook.addWorksheet("Takımlar", { properties: { tabColor: { argb: "FFC0000" } } });
    teamSheet.columns = [
      { header: "Sıra", key: "rank", width: 10 },
      { header: "Takım Adı", key: "teamName", width: 30 },
      { header: "Toplam Puan", key: "totalPoints", width: 15 },
      { header: "Toplam SP", key: "totalSp", width: 15 },
      { header: "R1 Puan", key: "r1Rank", width: 10 },
      { header: "R2 Puan", key: "r2Rank", width: 10 },
      { header: "R3 Puan", key: "r3Rank", width: 10 },
      { header: "R4 Puan", key: "r4Rank", width: 10 },
      { header: "R5 Puan", key: "r5Rank", width: 10 },
    ];

    // Örnek veri (Kullanıcıya formatı göstermek için)
    teamSheet.addRow({
      rank: 1, teamName: "Örnek Takım A", totalPoints: 12, totalSp: 750,
      r1Rank: 3, r2Rank: 2, r3Rank: 3, r4Rank: 1, r5Rank: 3
    });
    teamSheet.addRow({
      rank: 2, teamName: "Örnek Takım B", totalPoints: 10, totalSp: 745,
      r1Rank: 2, r2Rank: 3, r3Rank: 1, r4Rank: 2, r5Rank: 2
    });

    // Başlık satırını kalın yap
    teamSheet.getRow(1).font = { bold: true };
    teamSheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };


    // --- Konuşmacılar Sayfası ---
    const speakerSheet = workbook.addWorksheet("Konuşmacılar", { properties: { tabColor: { argb: "FF00B0F0" } } });
    speakerSheet.columns = [
      { header: "Sıra", key: "rank", width: 10 },
      { header: "Konuşmacı Adı", key: "name", width: 25 },
      { header: "Takım Adı", key: "teamName", width: 30 },
      { header: "Toplam SP", key: "totalSp", width: 15 },
      { header: "R1 SP", key: "r1Sp", width: 10 },
      { header: "R2 SP", key: "r2Sp", width: 10 },
      { header: "R3 SP", key: "r3Sp", width: 10 },
      { header: "R4 SP", key: "r4Sp", width: 10 },
      { header: "R5 SP", key: "r5Sp", width: 10 },
    ];

    speakerSheet.addRow({
      rank: 1, name: "Ali Yılmaz", teamName: "Örnek Takım A", totalSp: 380,
      r1Sp: 76, r2Sp: 75, r3Sp: 78, r4Sp: 75, r5Sp: 76
    });
    speakerSheet.addRow({
      rank: 2, name: "Ayşe Kaya", teamName: "Örnek Takım A", totalSp: 370,
      r1Sp: 74, r2Sp: 75, r3Sp: 73, r4Sp: 74, r5Sp: 74
    });

    // Başlık satırını kalın yap
    speakerSheet.getRow(1).font = { bold: true };
    speakerSheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    // Buffer oluştur
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="MunazaraRank_Sablon.xlsx"',
      },
    });
  } catch (error: any) {
    console.error("Excel şablonu oluşturulurken hata:", error);
    return NextResponse.json({ error: "Şablon oluşturulamadı." }, { status: 500 });
  }
}
