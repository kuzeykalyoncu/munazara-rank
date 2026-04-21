const fs = require('fs');
const pdf = require('pdf-parse');

async function check() {
  const data = await pdf(fs.readFileSync('/Users/kuzeykalyoncu/Desktop/3. BAŞKENT OPEN Speaker Tab.docx.pdf'));
  console.log(data.text.split('\n').slice(0, 20).join('\n'));
}
check();
