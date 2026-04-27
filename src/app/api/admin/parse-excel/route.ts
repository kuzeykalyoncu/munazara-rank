import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { ParsedSpeaker, ParsedTeam } from "../parse-tab/route";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const speakerFile = formData.get("speakerFile") as File;
    const teamFile = formData.get("teamFile") as File;

    if (!speakerFile || !teamFile) {
      return NextResponse.json({ error: "Lütfen hem Speaker Tab hem de Team Tab dosyalarını yükleyin." }, { status: 400 });
    }

    const speakerBuffer = await speakerFile.arrayBuffer();
    const speakerWorkbook = new ExcelJS.Workbook();
    await speakerWorkbook.xlsx.load(speakerBuffer);

    const teamBuffer = await teamFile.arrayBuffer();
    const teamWorkbook = new ExcelJS.Workbook();
    await teamWorkbook.xlsx.load(teamBuffer);

    // İlk sayfayı (sheet) al
    const teamSheet = teamWorkbook.worksheets[0];
    const speakerSheet = speakerWorkbook.worksheets[0];

    if (!teamSheet || !speakerSheet) {
      return NextResponse.json({ 
        error: "Excel dosyalarının içinde okunabilir sayfa bulunamadı." 
      }, { status: 400 });
    }

    const warnings: string[] = [];
    const teams: ParsedTeam[] = [];
    const speakers: ParsedSpeaker[] = [];

    // --- TAKIMLARI OKU ---
    // Sütunlar: 1:Sıra, 2:Takım Adı, 3:Top Puan, 4:Top SP, 5:R1 Puan, 6:R2 Puan, 7:R3 Puan, 8:R4 Puan, 9:R5 Puan
    teamSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Başlık satırını atla

      // Değerleri güvenli bir şekilde çek (formüller vs varsa sonucunu al)
      const getVal = (col: number) => {
        const val = row.getCell(col).value;
        if (val && typeof val === "object" && "result" in val) return val.result;
        return val;
      };

      const rankStr = getVal(1);
      const teamName = getVal(2)?.toString().trim();
      
      if (!teamName || teamName.toLowerCase().includes("örnek takım")) return; // Boş veya örnek satırı atla

      const position = parseInt(rankStr?.toString() || "0", 10) || 0;
      const totalRank = parseInt(getVal(3)?.toString() || "0", 10) || 0;
      const totalSpeaker = parseFloat(getVal(4)?.toString() || "0") || 0;

      const rankScores: number[] = [];
      for (let i = 5; i <= 9; i++) {
        const v = getVal(i);
        rankScores.push(v !== null && v !== undefined && v !== "" ? parseInt(v.toString(), 10) : 0);
      }

      teams.push({
        position,
        teamName,
        totalRank,
        totalSpeaker,
        pullups: 0,
        speakerScores: [0, 0, 0, 0, 0], // Sadece takım tablosunda olduğu için SP'leri 0 yapıyoruz, gerçek SP'ler konuşmacıdan hesaplanacak.
        rankScores,
        speakers: [] // Sonradan eklenecek
      });
    });

    // --- KONUŞMACILARI OKU ---
    // Sütunlar: 1:Sıra, 2:İsim, 3:Takım, 4:Top SP, 5:R1 SP, 6:R2 SP, 7:R3 SP, 8:R4 SP, 9:R5 SP
    speakerSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const getVal = (col: number) => {
        const val = row.getCell(col).value;
        if (val && typeof val === "object" && "result" in val) return val.result;
        return val;
      };

      const name = getVal(2)?.toString().trim();
      const team = getVal(3)?.toString().trim();

      if (!name || name.toLowerCase().includes("örnek takım")) return;

      const position = parseInt(getVal(1)?.toString() || "0", 10) || 0;
      const total = parseFloat(getVal(4)?.toString() || "0") || 0;

      const scores: number[] = [];
      for (let i = 5; i <= 9; i++) {
        const v = getVal(i);
        scores.push(v !== null && v !== undefined && v !== "" ? parseFloat(v.toString()) : 0);
      }

      speakers.push({
        position,
        name,
        team: team || "",
        total,
        scores
      });
    });

    // --- TAKIM VE KONUŞMACI EŞLEŞTİRMESİ ---
    for (const sp of speakers) {
      const t = teams.find(t => t.teamName.toLowerCase() === sp.team.toLowerCase());
      if (t) {
        if (!t.speakers.includes(sp.name)) {
          t.speakers.push(sp.name);
        }
      } else {
        warnings.push(`"${sp.name}" adlı konuşmacının takımı ("${sp.team}") Takımlar listesinde bulunamadı!`);
      }
    }

    // Takımların speakerScores'larını konuşmacıların toplamından hesapla (Takım tablosundaki eksik SP'leri tamamlamak için)
    for (const t of teams) {
      if (t.speakers.length > 0) {
        for (let r = 0; r < 5; r++) {
          let roundSpTotal = 0;
          for (const spName of t.speakers) {
            const sp = speakers.find(s => s.name === spName);
            if (sp && sp.scores[r]) {
              roundSpTotal += sp.scores[r];
            }
          }
          t.speakerScores[r] = roundSpTotal;
        }
      }
    }

    return NextResponse.json({ success: true, teams, speakers, warnings });

  } catch (error: any) {
    console.error("Excel parse hatası:", error);
    return NextResponse.json({ error: "Excel okunurken hata oluştu: " + error.message }, { status: 500 });
  }
}
