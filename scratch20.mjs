import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function parseTeam() {
  const data = new Uint8Array(fs.readFileSync('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Team Tab.docx.pdf'));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const items = content.items.map(item => ({ str: item.str, x: item.transform[4], y: item.transform[5] }));
  
  const badText = ['Position', 'Total', 'points', 'ups', 'R1', 'R2', 'R3', 'Speaker', 'Rank'];
  const badItemsY = items.filter(i => badText.includes(i.str.trim()) && i.y > 600).map(i => i.y);
  const lowestBadY = badItemsY.length > 0 ? Math.min(...badItemsY) : 10000;
  console.log('Team Tab Lowest Header Y:', lowestBadY.toFixed(2));
  
  const anchors = items.filter(i => /^\d+$/.test(i.str.trim()) && i.x < 100);
  const maxAnchorY = Math.max(...anchors.map(a => a.y));
  console.log('Team Tab Max Anchor Y:', maxAnchorY.toFixed(2));
}

async function parseSpeaker() {
  const data = new Uint8Array(fs.readFileSync('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Speaker Tab.docx.pdf'));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const items = content.items.map(item => ({ str: item.str, x: item.transform[4], y: item.transform[5] }));
  
  const badText = ['Position', 'Total', 'points', 'ups', 'R1', 'R2', 'R3', 'Speaker', 'Rank'];
  const badItemsY = items.filter(i => badText.includes(i.str.trim()) && i.y > 600).map(i => i.y);
  const lowestBadY = badItemsY.length > 0 ? Math.min(...badItemsY) : 10000;
  console.log('Speaker Tab Lowest Header Y:', lowestBadY.toFixed(2));
  
  const anchors = items.filter(i => /^\d+$/.test(i.str.trim()) && i.x < 100);
  const maxAnchorY = Math.max(...anchors.map(a => a.y));
  console.log('Speaker Tab Max Anchor Y:', maxAnchorY.toFixed(2));
}

await parseTeam();
await parseSpeaker();
