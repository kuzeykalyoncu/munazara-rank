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
    // Position tokens are those within 20px of minX, AND they must be numbers
    const positionTokens = items.filter(i => i.x < minX + 20 && /^\d+/.test(i.str));
    // Sort position tokens descending by Y
    positionTokens.sort((a, b) => b.y - a.y);
    
    // Now group ALL items by assigning them to the closest Position Y
    const rows = positionTokens.map(pt => ({ y: pt.y, position: pt.str, items: [] }));
    
    for (const item of items) {
      if (!rows.length) continue;
      // find closest row
      let closestRow = rows[0];
      let minDiff = Math.abs(item.y - closestRow.y);
      for(const row of rows) {
        const diff = Math.abs(item.y - row.y);
        if (diff < minDiff) { minDiff = diff; closestRow = row; }
      }
      closestRow.items.push(item);
    }
    
    // For each row, sort items by X
    for (const row of rows) {
       row.items.sort((a, b) => a.x - b.x);
       text += row.items.map(i => i.str).join(" ") + '\n';
    }
  }
  return text;
}
(async () => {
    console.log("TEAM TAB FIRST 10 LINES:");
    console.log((await parse('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Team Tab.docx.pdf')).split('\n').slice(0, 10).join('\n'));
    console.log("----");
    console.log("SPEAKER TAB FIRST 10 LINES:");
    console.log((await parse('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Speaker Tab.docx.pdf')).split('\n').slice(0, 10).join('\n'));
})();
