import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function parse(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.map(item => ({ str: item.str, x: item.transform[4], roundedY: Math.round(item.transform[5] / 3) * 3 }));
    items.sort((a, b) => b.roundedY - a.roundedY || a.x - b.x);
    let lastY = null;
    for (const item of items) {
      if (!item.str.trim()) continue;
      if (lastY !== null && Math.abs(item.roundedY - lastY) > 0) text += '\n';
      else if (lastY !== null) text += ' ';
      text += item.str.trim();
      lastY = item.roundedY;
    }
    text += '\n\n';
  }
  return text;
}
(async () => {
    console.log("TEAM TAB FIRST 20 LINES:");
    console.log((await parse('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Team Tab.docx.pdf')).split('\n').slice(0, 20).join('\n'));
    console.log("----");
    console.log("SPEAKER TAB FIRST 20 LINES:");
    console.log((await parse('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Speaker Tab.docx.pdf')).split('\n').slice(0, 20).join('\n'));
})();
