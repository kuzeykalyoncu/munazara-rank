import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function parse() {
  const data = new Uint8Array(fs.readFileSync('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Team Tab.docx.pdf'));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const items = content.items
    .map(item => ({ str: item.str, x: item.transform[4], y: item.transform[5] }))
    .filter(i => /^\d+$/.test(i.str.trim()) && i.y < 600 && i.y > 530); 

  items.sort((a,b) => b.y - a.y);
  items.forEach(i => console.log(`Y: ${i.y.toFixed(2)} X: ${i.x.toFixed(2)} - '${i.str}'`));
}
parse();
