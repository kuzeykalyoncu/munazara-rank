import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import pdfParse from "pdf-parse";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);
    return NextResponse.json({ text: data.text || "" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
