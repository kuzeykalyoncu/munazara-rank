import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function parse(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const items = content.items.map(item => ({ str: item.str, x: item.transform[4], y: item.transform[5] })).filter(i => i.str.trim());
  const positionTokens = items.filter(i => i.x < 100 && /^\d+/.test(i.str));
  positionTokens.sort((a, b) => b.y - a.y);
  const row = { y: positionTokens[0].y, items: [] };
  for (const item of items) {
    if (Math.abs(item.y - row.y) < 20) {
      row.items.push(item);
    }
  }
  row.items.sort((a, b) => {
    if (Math.abs(a.x - b.x) < 5) return b.y - a.y;
    return a.x - b.x;
  });
  row.items.forEach(i => console.log(`STR: "${i.str}" X: ${i.x.toFixed(2)} Y: ${i.y.toFixed(2)}`));
}
(async () => {
    await parse('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Speaker Tab.docx.pdf');
})();
