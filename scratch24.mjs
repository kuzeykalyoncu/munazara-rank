import fs from 'fs';

const speakerText = `2 İbrahim Aydın ODTÜ IMF'nin Mutemet Adamı 379 74 76 77 75 77
9 Kutay Zengi ODTÜ Arada ülkücü damarı tutuyor 374 73 73 76 75 77`;

const teamText = `3 ODTÜ IMF'nin Mutemet Adamı 11 751 1 147 150 152 149 153 1 3 3 1 3
4 ODTÜ Arada ülkücü damarı tutuyor 11 744 3 145 145 151 150 153 3 1 3 2 2`;

function parseTest() {
  const teams = [];
  
  // mock team parsing
  teamText.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    if(parts.length < 5) return;
    const pos = parseInt(parts[0]);
    // find index where scores start (e.g. 11 751)
    let endIdx = parts.length - 1;
    for (let i = 1; i < parts.length - 2; i++) {
        if (/^\d+$/.test(parts[i]) && /^\d+$/.test(parts[i + 1])) {
            endIdx = i;
            break;
        }
    }
    const teamName = parts.slice(1, endIdx).join(" ");
    teams.push(teamName);
  });
  
  console.log("Teams parsed:", teams);

  speakerText.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    const scores = [];
    for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d+(\.\d+)?$/.test(parts[i])) {
            scores.unshift(parseFloat(parts[i]));
        } else {
            break;
        }
    }
    const numScores = scores.length;
    let blob = parts.slice(1, parts.length - numScores).join(" ");
    console.log("Speaker blob:", blob);
    
    // Fuzzy match
    let matchedTeam = "";
    let maxMatch = 0;
    
    for (const t of teams) {
      if (blob.includes(t)) {
          matchedTeam = t;
          break;
      }
    }
    
    if (!matchedTeam) {
      for (const t of teams) {
          const tWords = t.toLowerCase().split(/\s+/);
          const blobLower = blob.toLowerCase();
          const matchCount = tWords.filter(w => blobLower.includes(w)).length;
          
          if (matchCount === tWords.length && matchCount > maxMatch) {
              matchedTeam = t;
              maxMatch = matchCount;
          }
      }
    }
    
    console.log("Matched team:", matchedTeam);
    
    let name = blob;
    if (matchedTeam) {
        if (blob.includes(matchedTeam)) {
            name = blob.replace(matchedTeam, "").trim();
        } else {
            let tempBlobParts = blob.split(/\s+/);
            for (const tw of matchedTeam.split(/\s+/)) {
               const idx = tempBlobParts.findIndex(p => p.toLowerCase() === tw.toLowerCase());
               if (idx !== -1) tempBlobParts.splice(idx, 1);
            }
            name = tempBlobParts.join(" ").trim();
        }
    }
    
    name = name.replace(/[\d.,-]/g, '').replace(/\s+/g, ' ').trim();
    console.log("Extracted Name:", name);
    console.log("---");
  });
}

parseTest();
