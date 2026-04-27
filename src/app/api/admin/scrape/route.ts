import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

export interface ScrapeResult {
  speakers: { name: string; totalPoints: number; scores: number[]; rank?: number }[];
  teams: { name: string; speakers: string[] }[];
  results: {
    rooms: { name: string; placements: string[]; isOutround: boolean }[];
    breaks: string[];
    finalists: string[];
    champions: string[];
    bestSpeakers: string[];
    inferredBreakCount?: number;
  };
  warnings: string[];
}

function normalizeName(name: string): string {
  return name.trim().split(/\s+/).map(word => {
      if (!word) return "";
      return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1).toLocaleLowerCase('tr-TR');
  }).join(" ");
}

// Removes emojis, extra newlines and normalizes whitespace for team name matching
function normalizeTeamName(name: string): string {
  return name
    // Remove emoji unicode ranges
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}]/gu, "")
    // Remove variation selectors
    .replace(/[\uFE00-\uFE0F]/g, "")
    // Collapse all whitespace (including newlines, tabs)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MunazaraRank/1.0; +https://munazararank.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    return res.data;
  } catch {
    return null;
  }
}

function extractVueTablesData(html: string): any[] | null {
  try {
    // 1. Try tablesData: [ ... ]
    let startIdx = html.indexOf("tablesData: ");
    if (startIdx !== -1) {
      const arrayStart = html.indexOf("[", startIdx);
      const endIdx = html.indexOf("</script>", arrayStart);
      if (endIdx !== -1) {
        let jsonStr = html.substring(arrayStart, endIdx);
        const lastBracketIdx = jsonStr.lastIndexOf("]");
        if (lastBracketIdx !== -1) {
          jsonStr = jsonStr.substring(0, lastBracketIdx + 1);
          try {
             return JSON.parse(jsonStr);
          } catch (e) {
             console.warn("JSON.parse failed for tablesData:", e);
          }
        }
      }
    }

    // 2. Fallback: Search for window.vueData = { ... } and find tables property
    const vueMatch = html.match(/window\s*\.\s*vueData\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
    if (vueMatch) {
       // Since the simple regex might stop at first '}', we use a more balanced approach
       let content = vueMatch[1];
       // Basic balanced brace attempt (not perfect but better than non-greedy match)
       let braceCount = 0;
       let endPos = -1;
       const fullMatch = html.match(/window\s*\.\s*vueData\s*=\s*(\{[\s\S]*)/);
       if (fullMatch) {
         const str = fullMatch[1];
         for (let i = 0; i < str.length; i++) {
           if (str[i] === "{") braceCount++;
           if (str[i] === "}") braceCount--;
           if (braceCount === 0) {
             endPos = i;
             break;
           }
         }
         if (endPos !== -1) {
           const fullJson = str.substring(0, endPos + 1);
           try {
             const parsed = JSON.parse(fullJson);
             if (parsed.tablesData) return parsed.tablesData;
             if (parsed.tables) return parsed.tables;
           } catch (e) {
             console.warn("JSON.parse failed for balanced vueData:", e);
           }
         }
       }
    }
    return null;
  } catch (e) {
    console.warn("Failed to extract Vue tablesData JSON", e);
    return null;
  }
}

function parseSpeakers(
  html: string
): { name: string; totalPoints: number; scores: number[]; rank?: number }[] {
  const $ = cheerio.load(html);
  const speakers: { name: string; totalPoints: number; scores: number[]; rank?: number }[] = [];

  // 1. Try Vue tablesData JSON first (newer Tabbycat)
  const vueData = extractVueTablesData(html);
  if (vueData && vueData.length > 0 && vueData[0].data && vueData[0].head) {
    const head = vueData[0].head;
    const rankIdx = head.findIndex((h: any) => ["rank", "rk", "sıra"].includes((h.key || "").toLowerCase()) || ["Rank", "Sıra"].includes(h.tooltip || h.title));
    const nameIdx = head.findIndex((h: any) => 
      ["name", "speaker", "participant", "fullname"].includes((h.key || "").toLowerCase()) || 
      ["Name", "Speaker", "Participant"].includes(h.tooltip || h.title)
    );
    const avgIdx = head.findIndex((h: any) => ["Avg", "Average"].includes(h.key || h.tooltip || h.title));
    const totalIdx = head.findIndex((h: any) => ["Total", "Points"].includes(h.key || h.tooltip || h.title));
    
    // Find round score indices — supports R1/R2... (Tabbycat default) AND T1/T2... (TabCim variant) and other single-letter prefixes
    const roundIndices = head
      .map((h: any, idx: number) => (/^[A-Z]\d+$/.test(h.key || h.title || "") ? idx : -1))
      .filter((idx: number) => idx !== -1);

    for (const row of vueData[0].data) {
      if (!Array.isArray(row) || row.length < 2) continue;
      
      let name = "";
      if (nameIdx !== -1) {
        const cell = row[nameIdx];
        // If text is a short number/empty, try popover or sort
        name = cell?.text || "";
        if ((!name || /^\d+$/.test(name.trim())) && cell?.popover?.title) {
          name = cell.popover.title;
        } else if ((!name || /^\d+$/.test(name.trim())) && cell?.sort && typeof cell.sort === "string") {
          name = cell.sort;
        }
        
        // Clean name: remove HTML tags, handle common Tabbycat tie markers like "11="
        name = normalizeName(name.replace(/<[^>]*>/g, "").replace(/\d+=/, ""));
      }

      let rank = 0;
      if (rankIdx !== -1) {
        const rc = row[rankIdx];
        const rStr = (rc?.text || rc?.sort || "").toString().replace(/<[^>]*>/g, "").replace("=", "").trim();
        rank = parseInt(rStr, 10) || 0;
      }

      if (!name || /^\d+$/.test(name) || name.length < 2) continue;

      const scores: number[] = [];
      let total = 0;
      let avg = 0;

      // Extract scores from known round columns
      // Handles: cell.text="76", cell.sort=76 (number), cell.sort="76" (string)
      for (const idx of roundIndices) {
        const cell = row[idx];
        const rawText = cell?.text ?? "";
        const rawSort = cell?.sort;
        // Prefer text, fallback to sort (number or string)
        const strVal = rawText
          ? rawText.replace(/<[^>]*>/g, "").trim()
          : (rawSort !== undefined && rawSort !== null && rawSort !== "")
            ? String(rawSort).replace(/<[^>]*>/g, "").trim()
            : "";
        if (!strVal) { scores.push(0); continue; }
        const val = parseFloat(strVal);
        if (!isNaN(val) && val >= 50 && val <= 100) scores.push(val);
        else scores.push(0);
      }

      // Avg: prefer sort (number or string), fallback to text (may have <small> tags)
      if (avgIdx !== -1) {
        const ac = row[avgIdx];
        const aSort = ac?.sort;
        const aText = ac?.text ?? "";
        const aStr = (aSort !== undefined && aSort !== null && aSort !== "")
          ? String(aSort).replace(/<[^>]*>/g, "").trim()
          : aText.replace(/<[^>]*>/g, "").trim();
        if (aStr) avg = parseFloat(aStr);
      }
      if (totalIdx !== -1) {
        const tc = row[totalIdx];
        const tSort = tc?.sort;
        const tText = tc?.text ?? "";
        const tStr = (tSort !== undefined && tSort !== null && tSort !== "")
          ? String(tSort).replace(/<[^>]*>/g, "").trim()
          : tText.replace(/<[^>]*>/g, "").trim();
        if (tStr) total = parseFloat(tStr);
      }

      const nonZeroScores = scores.filter(s => s > 0);
      const pointAvg = avg > 0 ? avg
        : nonZeroScores.length > 0 ? nonZeroScores.reduce((a, b) => a + b, 0) / nonZeroScores.length
        : total > 0 ? total / (scores.length || 1) : 0;
      
      if (pointAvg > 0) {
        speakers.push({ name, totalPoints: pointAvg, scores, rank });
      }
    }
    
    if (speakers.length > 0) return speakers;
  }

  // 2. Fallback to static HTML (older Tabbycat)
  $("table.table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;

    const nameCell = $(cells[0]);
    let name = nameCell.find("a").text().trim() || nameCell.text().trim();
    name = normalizeName(name);
    if (!name || name.length < 2) return;

    const avgText = $(cells[3]).text().trim();
    const avg = parseFloat(avgText);

    const scores: number[] = [];
    cells.each((i, cell) => {
      if (i === 0 || i === cells.length - 1) return; 
      const txt = $(cell).text().trim();
      if (!txt) {
        scores.push(0);
        return;
      }
      const val = parseFloat(txt);
      if (!isNaN(val) && val >= 50 && val <= 100) scores.push(val);
      else scores.push(0);
    });

    const totalPoints = !isNaN(avg) ? avg : scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    const rankStr = $(cells[0]).text().replace(/<[^>]*>/g, "").replace("=", "").trim();
    const rank = parseInt(rankStr, 10) || 0;

    if (name && totalPoints > 0) {
      speakers.push({ name, totalPoints, scores, rank });
    }
  });

  return speakers;
}

function parseTeams(html: string): { name: string; speakers: string[] }[] {
  const $ = cheerio.load(html);
  const teams: { name: string; speakers: string[] }[] = [];

  // 1. Try Vue tablesData JSON (newer Tabbycat)
  const vueData = extractVueTablesData(html);
  if (vueData && vueData.length > 0 && vueData[0].data && vueData[0].head) {
    const head = vueData[0].head;
    const teamIdx = head.findIndex((h: any) => 
      (h.key || "").toLowerCase() === "team" || 
      (h.tooltip || h.title || "").toLowerCase() === "team"
    );
    
    for (const row of vueData[0].data) {
      if (!Array.isArray(row) || teamIdx === -1) continue;
      
      const teamCell = row[teamIdx];
      let teamName = teamCell?.text || "";
      if (teamName) teamName = teamName.replace(/<[^>]*>/g, "").trim();
      
      if (!teamName || /^\d+$/.test(teamName)) {
        if (teamCell?.popover?.title) teamName = teamCell.popover.title.replace(/ placed.*/, "").trim();
        else if (teamCell?.sort && typeof teamCell.sort === "string") teamName = teamCell.sort;
      }
      
      teamName = normalizeName(teamName);
      // Strip emojis/newlines that Tabbycat sometimes adds as prefixes
      teamName = normalizeName(teamName.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\uFE00-\uFE0F]/gu, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " "));
      if (!teamName) continue;

      let spNames: string[] = [];

      // Sometimes speakers are in a popover structure
      if (teamCell.popover && teamCell.popover.content) {
        for (const item of teamCell.popover.content) {
          if (item.text && !item.text.toLowerCase().includes("view") && !item.text.toLowerCase().includes("record")) {
             const parts = item.text.split(/,\s*/);
             if (parts.length >= 2) {
               spNames = parts.map((s: string) => normalizeName(s.trim().replace(/<[^>]*>/g, "")));
               break;
             }
          }
        }
      } 

      if (spNames.length >= 2) {
        teams.push({ name: teamName.trim(), speakers: spNames.slice(0, 2).map(s => s.trim()) });
      }
    }
    
    if (teams.length > 0) return teams;
  }

  // 2. Fallback to static HTML
  $("table.table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const teamName = normalizeName($(cells[0]).find("a").text().trim() || $(cells[0]).text().trim());
    if (!teamName || teamName.length < 2) return;

    const speakerCell = $(cells[1]);
    const speakerLinks = speakerCell.find("a");
    const speakers: string[] = [];

    if (speakerLinks.length >= 1) {
      speakerLinks.each((_, a) => {
        const spName = normalizeName($(a).text().trim());
        if (spName && spName.length > 1) speakers.push(spName);
      });
    } else {
      const raw = speakerCell.text().trim();
      const parts = raw.split(/[,\n&]/).map((s) => normalizeName(s.trim())).filter((s) => s.length > 1);
      speakers.push(...parts);
    }

    if (speakers.length >= 2) {
      teams.push({ name: teamName, speakers: speakers.slice(0, 2) });
    }
  });

  return teams;
}



function parseResults(html: string): ScrapeResult["results"] {
  const $ = cheerio.load(html);
  // Using rooms instead of pairing up rounds
  const rooms: { name: string; placements: string[]; isOutround: boolean }[] = [];
  const breaks: string[] = [];
  const finalists: string[] = [];
  const champions: string[] = [];
  const bestSpeakers: string[] = [];

  // Try extracting from Vue tablesData (newer Tabbycat)
  const vueData = extractVueTablesData(html);
  if (vueData && vueData.length > 0 && vueData[0].data) {
    for (const row of vueData[0].data) {
      if (!Array.isArray(row)) continue;
      
      const textRow = row.map((r: any) => r.text || "").join(" ").toLowerCase();
      
      const teamCell = row.find((c: any) => c.class && c.class.includes("team-name")) || row[0];
      let teamName = teamCell?.text || "";
      if (teamName) teamName = teamName.replace(/<[^>]*>/g, "").trim();

      if (teamName && !/^\d+$/.test(teamName)) {
        if (textRow.includes("break") || textRow.includes("yarı") || textRow.includes("çeyrek")) {
          breaks.push(teamName);
        }
        if (textRow.includes("final")) {
          finalists.push(teamName);
          breaks.push(teamName); 
        }
        if (textRow.includes("şampiyon") || textRow.includes("champion") || textRow.includes("kazanan") || textRow.includes("winner")) {
          champions.push(teamName);
          finalists.push(teamName);
          breaks.push(teamName);
        }
      }
    }
  }

  // Fallback to static HTML (older Tabbycat)
  $("table.table tbody tr").each((_, row) => {
    const text = $(row).text().toLowerCase();
    const cells = $(row).find("td");
    const teamName = $(cells[0]).text().trim();

    if (teamName) {
      if (text.includes("break") || text.includes("yarı") || text.includes("çeyrek")) {
        breaks.push(teamName);
      }
      if (text.includes("final")) {
        finalists.push(teamName);
        breaks.push(teamName); 
      }
      if (text.includes("şampiyon") || text.includes("champion") || text.includes("kazanan") || text.includes("winner")) {
        champions.push(teamName);
        finalists.push(teamName);
        breaks.push(teamName);
      }
    }
  });

  let currentIsOutround = false;
  let maxBreakCount = 0;

  // Scan all links that point to a round to securely find outround titles (Final, Yarı, Çeyrek)
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.includes("/results/round/")) {
      const text = $(el).text().trim().toLowerCase();
      if (text.includes("octo")) maxBreakCount = Math.max(maxBreakCount, 32);
      else if (text.includes("çeyrek") || text.includes("quarter")) maxBreakCount = Math.max(maxBreakCount, 16);
      else if (text.includes("yarı") || text.includes("semi")) maxBreakCount = Math.max(maxBreakCount, 8);
      else if (text.includes("final")) maxBreakCount = Math.max(maxBreakCount, 4);
    }
  });

  $("*").each((_, el) => {
    // Check if the current element is a heading specifying the round
    if ($(el).is("h1, h2, h3, h4, h5")) {
      const heading = $(el).text().trim().toLowerCase();
      // If heading is about speakers or standings, ignore. If it's a round name, check if it's an outround.
      if (heading.includes("round") || heading.includes("tur") || heading.includes("final") || heading.includes("çeyrek") || heading.includes("yarı") || heading.includes("quarter") || heading.includes("octo") || heading.includes("semi")) {
        currentIsOutround = /final|çeyrek|yarı|quarter|octo|semi/i.test(heading);
      }
    }

    // Check if the current element is a table
    if ($(el).is("table")) {
       $(el).find("tbody tr").each((_, row) => {
         const cells = $(row).find("td");
         const teamsInRow: string[] = [];
         
         // In Tabbycat BP, team names are often in columns 1, 2, 3, 4 or spread across the row.
         // We extract anchor texts or cell texts that look like team names.
         cells.each((_, td) => {
            let tName = $(td).find("a").first().text().trim();
            if (!tName) tName = $(td).text().trim();
            // Filter out purely numeric or short useless data
            if (tName && tName.length >= 3 && !/^[0-9]+$/.test(tName) && !tName.toLowerCase().includes("ayrıntılar")) {
               teamsInRow.push(tName);
            }
         });

         // Assuming left-to-right ...
         let validTeams = teamsInRow.filter(t => t && t.length >= 3);
         if (validTeams.length >= 2) {
            rooms.push({
               name: "Tur",
               placements: validTeams,
               isOutround: currentIsOutround
            });
         }
       });
    }
  });

  return {
    rooms,
    breaks: [...new Set(breaks)],
    finalists: [...new Set(finalists)],
    champions: [...new Set(champions)],
    bestSpeakers: [...new Set(bestSpeakers)],
    inferredBreakCount: maxBreakCount,
  };
}

async function fetchDebateRounds(baseUrl: string) {
  const rooms: { name: string; placements: string[]; isOutround: boolean }[] = [];
  const warnings: string[] = [];
  let missingCount = 0;

  // Çekilecek tur listesini eşzamanlı olarak hazırla (Tur 1 den 20 ye kadar)
  const fetchPromises = Array.from({ length: 20 }, async (_, i) => {
    const roundIndex = i + 1;
    try {
      const url = `${baseUrl}results/round/${roundIndex}/?view=debate`;
      const html = await fetchPage(url);
      if (!html) return { roundIndex, html: null, error: `Tur ${roundIndex} sayfasına erişilemedi (sonuçlar gizli veya sayfa yok).` };
      return { roundIndex, html, error: null };
    } catch (e) {
      return { roundIndex, html: null, error: `Tur ${roundIndex} okunurken bilinmeyen hata.` };
    }
  });

  // !! Bütün turlara aynı anda (paralel) istek atılarak indirme hızlandırılır !!
  const roundResults = await Promise.all(fetchPromises);

  // Gelen yanıtları sırayla (Tur 1 den 20 ye) parse et
  for (const res of roundResults) {
    if (missingCount >= 3) break; // Peş peşe 3 hata gelirse sonrası turları yok say
    
    const roundIndex = res.roundIndex;
    if (res.error || !res.html) {
      warnings.push(res.error || `Tur ${roundIndex} sayfasına erişilemedi.`);
      missingCount++;
      continue;
    }
    const html = res.html;

    try {
      const startMatch = html.match(/tablesData:\s*(\[[\s\S]*)/);
      if (startMatch) {
        const str = startMatch[1];
        let bracketCount = 0;
        let endPos = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < str.length; i++) {
          const char = str[i];
          if (escapeNext) { escapeNext = false; continue; }
          if (char === '\\') { escapeNext = true; continue; }
          if (char === '\"') { inString = !inString; continue; }
          if (!inString) {
            if (char === '[') bracketCount++;
            else if (char === ']') {
              bracketCount--;
              if (bracketCount === 0) { endPos = i; break; }
            }
          }
        }
        
        if (endPos !== -1) {
          try {
            const parsedArray = JSON.parse(str.substring(0, endPos + 1));
            const vueData = { tablesData: parsedArray };
            if (vueData.tablesData && vueData.tablesData[0] && vueData.tablesData[0].data && vueData.tablesData[0].head) {
              const head = vueData.tablesData[0].head;
              const teamIndices = head
                .map((h: any, idx: number) => {
                   const keyStr = (h.key || "").toLowerCase();
                   const tltpStr = (h.tooltip || h.title || "").toLowerCase();
                   if (["og", "oo", "cg", "co", "aff", "neg", "gov", "opp", "team"].includes(keyStr) || tltpStr.includes("team")) {
                      return idx;
                   }
                   return -1;
                })
                .filter((idx: number) => idx !== -1);
              
              let isOutround = false;
              let roundName = `Tur ${roundIndex}`;
              const titleMatch = html.match(/<div[^>]*id="pageTitle"[^>]*>[\s\S]*?<small[^>]*>(.*?)<\/small>/i) 
                              || html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i)
                              || html.match(/<title>(.*?)<\/title>/i);
              if (titleMatch) {
                 const titleText = (titleMatch[1] || titleMatch[2] || "").toLowerCase();
                 isOutround = /final|çeyrek|yarı|quarter|octo|semi/i.test(titleText);
                 if (/final/i.test(titleText) && !/yarı|semi|çeyrek|quarter|octo/.test(titleText)) roundName = "Final";
                 else if (/yarı|semi/i.test(titleText)) roundName = "Yarı Final";
                 else if (/çeyrek|quarter/i.test(titleText)) roundName = "Çeyrek Final";
                 else if (/octo/i.test(titleText)) roundName = "Sekizinci Final";
              }

              let foundAny = false;
              for (const row of vueData.tablesData[0].data) {
                 const teamPlacements: { name: string; sort: number }[] = [];
                 
                 for (const idx of teamIndices) {
                    const cell = row[idx];
                     if (cell && typeof cell.sort === "number") {
                       let text = cell.text || "";
                       if ((!text || /^\d+$/.test(text.trim())) && cell.popover && cell.popover.title) {
                          text = cell.popover.title;
                       }
                       text = text.replace(/<[^>]*>/g, "").trim();
                       text = normalizeTeamName(text);
                       teamPlacements.push({ name: normalizeName(text), sort: cell.sort });
                     }
                 }

                 if (teamPlacements.length >= 2) {
                   foundAny = true;
                   teamPlacements.sort((a, b) => b.sort - a.sort); // Highest sort is 1st place
                   
                   rooms.push({
                     name: roundName,
                     placements: teamPlacements.map(t => t.name),
                     isOutround
                   });
                 }
              }
              
              if (foundAny) {
                 missingCount = 0; // Reset missing count on success
              } else {
                 warnings.push(`Tur ${roundIndex} sayfasından salon kaydı çıkarılamadı.`);
                 missingCount++;
              }
            } else {
              warnings.push(`Tur ${roundIndex} verisinde tablo bulunamadı.`);
              missingCount++;
            }
          } catch (e) {
            warnings.push(`Tur ${roundIndex} JSON parse hatası.`);
            missingCount++;
          }
        } else {
          warnings.push(`Tur ${roundIndex} verisi eksik.`);
          missingCount++;
        }
      } else {
        warnings.push(`Tur ${roundIndex} sayfası var ancak Tabbycat modeli bulunamadı.`);
        missingCount++;
      }
    } catch (err) {
      warnings.push(`Tur ${roundIndex} parse edilirken bilinmeyen hata.`);
      missingCount++;
    }
  }
  return { rooms, warnings };
}


export async function POST(req: NextRequest) {
  try {
    const { baseUrl, breakCount } = await req.json();
    if (!baseUrl) {
      return NextResponse.json({ error: "baseUrl is required" }, { status: 400 });
    }

    const cleanUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

    // Scrape all core pages + the detailed rounds
    const [speakerHtml, teamHtml, detailedRounds] =
      await Promise.all([
        fetchPage(`${cleanUrl}tab/speaker/`),
        fetchPage(`${cleanUrl}tab/team/`),
        fetchDebateRounds(cleanUrl),
      ]);
      
    let resultsHtml = await fetchPage(`${cleanUrl}results/`);
    if (!resultsHtml) {
      resultsHtml = await fetchPage(`${cleanUrl}tab/results/`);
    }

    if (!speakerHtml && !teamHtml) {
      return NextResponse.json(
        {
          error:
            "Site erişilemedi. URL'i kontrol edin veya site yanıt vermiyor.",
        },
        { status: 422 }
      );
    }

    const speakers = speakerHtml ? parseSpeakers(speakerHtml) : [];
    const teams = teamHtml ? parseTeams(teamHtml) : [];
    const results = parseResults(resultsHtml || "");

    // Override generic rounds with detailed BP rounds if found
    if (detailedRounds.rooms && detailedRounds.rooms.length > 0) {
      results.rooms = detailedRounds.rooms;
    }

    const warnings = detailedRounds.warnings || [];
    const inferredBreakCount = results.inferredBreakCount || 0;

    // Extract tournament name from page title
    let tournamentName = cleanUrl
      .replace(/https?:\/\/[^/]+\//, "")
      .replace(/\//g, " ")
      .trim();

    if (speakerHtml) {
       const $ = cheerio.load(speakerHtml);
       const title = $("title").text().trim() || $("h1").first().text().trim();
       if (title) tournamentName = title.split("|")[0].trim();
    }

    // Initialize break array based on highest confidence count (admin manual input overrides inference)
    let finalBreakCount = 0;
    if (breakCount && !isNaN(breakCount) && breakCount > 0) {
      finalBreakCount = parseInt(breakCount, 10);
    } else if (inferredBreakCount > 0) {
      finalBreakCount = inferredBreakCount;
    }

    if (finalBreakCount > 0 && teams.length > 0) {
      const topTeams = teams.slice(0, finalBreakCount).map(t => t.name.toLowerCase());
      results.breaks = topTeams; 
    }

    return NextResponse.json({
      success: true,
      tournamentName,
      speakers,
      teams,
      results,
      warnings,
      inferredBreakCount,
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: "Scrape işlemi sırasında hata oluştu." },
      { status: 500 }
    );
  }
}
