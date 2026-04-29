const fs = require('fs');
const path = './src/app/api/admin/scrape/route.ts';
let code = fs.readFileSync(path, 'utf8');

const target = `              let foundAny = false;
              for (const row of vueData.tablesData[0].data) {
                 const teamPlacements: { name: string; sort: number }[] = [];
                 
                 for (const idx of teamIndices) {
                    const cell = row[idx];
                     if (cell && typeof cell.sort === "number") {
                       let text = cell.text || "";
                       if ((!text || /^\\d+$/.test(text.trim())) && cell.popover && cell.popover.title) {
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
              }`;

const replacement = `              const adjIdx = head.findIndex((h: any) => (h.key || "").toLowerCase().includes("adj") || (h.title || "").toLowerCase().includes("adj"));
              const resIdx = head.findIndex((h: any) => (h.key || "").toLowerCase() === "result" || (h.title || "").toLowerCase() === "result");
              const singleTeamIdx = head.findIndex((h: any) => (h.key || "").toLowerCase() === "team" || (h.tooltip || h.title || "").toLowerCase() === "team");

              let foundAny = false;
              const viewByTeamRoomsMap: Record<string, { name: string; sort: number }[]> = {};

              for (const row of vueData.tablesData[0].data) {
                 const teamPlacements: { name: string; sort: number }[] = [];
                 
                 for (const idx of teamIndices) {
                    const cell = row[idx];
                     if (cell && typeof cell.sort === "number") {
                       let text = cell.text || "";
                       if ((!text || /^\\d+$/.test(text.trim())) && cell.popover && cell.popover.title) {
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
                 } else if (teamPlacements.length === 0 && singleTeamIdx !== -1 && adjIdx !== -1 && resIdx !== -1) {
                   const cell = row[singleTeamIdx];
                   let text = cell?.text || cell?.sort || "";
                   if ((!text || /^\\d+$/.test(text.trim())) && cell?.popover && cell.popover.title) {
                      text = cell.popover.title;
                   }
                   text = text.toString().replace(/<[^>]*>/g, "").trim();
                   text = normalizeTeamName(text);
                   
                   const adjHtml = row[adjIdx]?.text || "";
                   const adjText = adjHtml.replace(/<[^>]*>/g, "").trim();
                   
                   if (text && adjText) {
                     const resText = row[resIdx]?.text || "";
                     let rank = parseInt(resText.replace(/<[^>]*>/g, "").trim(), 10) || 4;
                     if (resText.includes("1st")) rank = 1;
                     if (resText.includes("2nd")) rank = 2;
                     if (resText.includes("3rd")) rank = 3;
                     if (resText.includes("4th")) rank = 4;
                     
                     if (!viewByTeamRoomsMap[adjText]) viewByTeamRoomsMap[adjText] = [];
                     viewByTeamRoomsMap[adjText].push({ name: normalizeName(text), sort: 5 - rank });
                   }
                 }
              }

              if (!foundAny && Object.keys(viewByTeamRoomsMap).length > 0) {
                 for (const adjText in viewByTeamRoomsMap) {
                    const placements = viewByTeamRoomsMap[adjText];
                    if (placements.length >= 2) {
                       foundAny = true;
                       placements.sort((a, b) => b.sort - a.sort);
                       rooms.push({
                         name: roundName,
                         placements: placements.map(t => t.name),
                         isOutround
                       });
                    }
                 }
              }`;

if (code.includes(target)) {
    fs.writeFileSync(path, code.replace(target, replacement));
    console.log("Success");
} else {
    console.log("Target not found");
}
