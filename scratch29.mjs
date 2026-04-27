import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function parsePdf(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    
    const rawItems = content.items
      .map(item => ({ str: item.str, x: item.transform[4], y: item.transform[5] }))
      .filter(item => item.str.trim());
      
    if (rawItems.length === 0) continue;

    const topY = Math.max(...rawItems.map(i => i.y));
    const badText = ['Position', 'Total', 'points', 'ups', 'R1', 'R2', 'R3', 'Speaker', 'Rank'];
    const badItemsY = rawItems.filter(i => badText.includes(i.str.trim()) && i.y > topY - 60).map(i => i.y);
    const lowestBadY = badItemsY.length > 0 ? Math.min(...badItemsY) : 10000;
    
    const items = rawItems.filter(i => i.y < lowestBadY);

    const minX = Math.min(...items.map(i => i.x));
    const positionTokens = items.filter(i => i.x < minX + 25 && /^\d+/.test(i.str));
    positionTokens.sort((a, b) => b.y - a.y);
    
    const rows = positionTokens.map(pt => ({ y: pt.y, items: [] }));
    
    for (const item of items) {
      if (!rows.length) {
        fullText += item.str + " ";
        continue;
      }
      let closestRow = rows[0];
      let minDiff = Math.abs(item.y - closestRow.y);
      for(const row of rows) {
        const diff = Math.abs(item.y - row.y);
        if (diff < minDiff) { 
          minDiff = diff; 
          closestRow = row; 
        }
      }
      if (minDiff < 30) {
        closestRow.items.push(item);
      }
    }
    
    for (const row of rows) {
       row.items.sort((a, b) => {
         const diffX = a.x - b.x;
         if (Math.abs(diffX) < 25) {
             return b.y - a.y; 
         }
         return diffX;
       });
       fullText += row.items.map(i => i.str).join(" ") + '\n';
    }
  }
  return fullText;
}

async function run() {
  const teamText = await parsePdf('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Team Tab.docx.pdf');
  console.log(teamText.split('\n').filter(l => l.includes("Kimlik")).join('\n'));
}

run();
