const fs = require('fs');
const pdfParse = require('pdf-parse');

async function parse() {
  try {
    const data1 = await pdfParse(fs.readFileSync('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Team Tab.docx.pdf'));
    console.log("TEAM TAB FIRST 15 LINES:");
    console.log(data1.text.split('\n').slice(0, 15).join('\n'));
    console.log("----");
    const data2 = await pdfParse(fs.readFileSync('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Speaker Tab.docx.pdf'));
    console.log("SPEAKER TAB FIRST 15 LINES:");
    console.log(data2.text.split('\n').slice(0, 15).join('\n'));
  } catch (e) {
    console.error(e);
  }
}
parse();
