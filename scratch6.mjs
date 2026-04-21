import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function parse(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.map(item => ({ str: item.str, x: item.transform[4], y: item.transform[5] })).filter(i => i.str.trim());
    
    // Find left-most column (Position)
    const minX = Math.min(...items.map(i => i.x));
    const positionTokens = items.filter(i => i.x < minX + 25 && /^\d+/.test(i.str));
    positionTokens.sort((a, b) => b.y - a.y);
    
    // Merge tokens with EXACT SAME Y first to remove random header items that don't belong, OR just rely on distance
    const rows = positionTokens.map(pt => ({ y: pt.y, items: [] }));
    
    for (const item of items) {
      if (!rows.length) continue;
      let closestRow = rows[0];
      let minDiff = Math.abs(item.y - closestRow.y);
      for(const row of rows) {
        const diff = Math.abs(item.y - row.y);
        if (diff < minDiff) { minDiff = diff; closestRow = row; }
      }
      if (minDiff < 30) {
          closestRow.items.push(item);
      }
    }
    
    for (const row of rows) {
       row.items.sort((a, b) => {
         const diffX = a.x - b.x;
         if (Math.abs(diffX) < 45) {
             return b.y - a.y; // top first
         }
         return diffX;
       });
       text += row.items.map(i => i.str).join(" ") + '\n';
    }
  }
  return text;
}
(async () => {
    console.log((await parse('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Speaker Tab.docx.pdf')).split('\n').slice(0, 5).join('\n'));
    console.log("------------------------");
    console.log((await parse('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Team Tab.docx.pdf')).split('\n').slice(0, 5).join('\n'));
})();
