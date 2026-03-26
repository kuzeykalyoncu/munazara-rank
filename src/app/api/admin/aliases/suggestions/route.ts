import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function getLevenshteinDistance(a: string, b: string): number {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export async function GET() {
  try {
    const { data: speakers, error } = await supabase
      .from("speakers")
      .select("name, total_tournaments")
      .order("total_tournaments", { ascending: false }); // Sort by experience

    if (error) throw new Error(error.message);
    if (!speakers || speakers.length === 0) {
      return NextResponse.json({ clusters: [] });
    }

    // Identify duplicates (Clusters)
    const visited = new Set<string>();
    const clusters: { id: string; items: { name: string; tournaments: number }[] }[] = [];

    for (let i = 0; i < speakers.length; i++) {
      const sp1 = speakers[i];
      if (visited.has(sp1.name)) continue;

      const currentCluster = [{ name: sp1.name, tournaments: sp1.total_tournaments }];
      visited.add(sp1.name);

      for (let j = i + 1; j < speakers.length; j++) {
        const sp2 = speakers[j];
        if (visited.has(sp2.name)) continue;

        const name1 = sp1.name.toLowerCase();
        const name2 = sp2.name.toLowerCase();

        const dist = getLevenshteinDistance(name1, name2);
        const isSub = name1.includes(name2) || name2.includes(name1);

        if (dist <= 3 || isSub) {
          currentCluster.push({ name: sp2.name, tournaments: sp2.total_tournaments });
          visited.add(sp2.name);
        }
      }

      if (currentCluster.length > 1) {
        clusters.push({
          id: `cluster-${clusters.length + 1}-${Date.now()}`,
          items: currentCluster,
        });
      }
    }

    return NextResponse.json({ clusters });
  } catch (error: any) {
    return NextResponse.json(
      { error: "İsim önerileri yüklenirken hata oluştu: " + error.message },
      { status: 500 }
    );
  }
}
