import axios from 'axios';
import * as fs from 'fs';

async function fetchHtml() {
  const res = await axios.get("https://tab.tabcim.com.tr/marmarakadinlar2022/results/round/1/?view=debate");
  const html = res.data;
  const match = html.match(/window\s*\.\s*vueData\s*=\s*(.*?)\s*</s);
  if (match) {
    fs.writeFileSync('tabbycat_debate.json', match[1]);
  }
}

fetchHtml().catch(console.error);
