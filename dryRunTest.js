const http = require('http');

const payload = JSON.stringify({
  tournamentId: "test-tournament",
  tournamentName: "Test Open",
  numRounds: 1,
  dryRun: true,
  finalists: [],
  champion: "",
  bestSpeaker: "İbrahim Aydın",
  speakers: [
    { position: 1, name: "İbrahim Aydın", team: "A Team", total: 80, scores: [80] },
    { position: 2, name: "Kutay Zengi", team: "A Team", total: 70, scores: [70] },
    { position: 3, name: "Ahmet", team: "B Team", total: 75, scores: [75] },
    { position: 4, name: "Mehmet", team: "B Team", total: 75, scores: [75] },
    { position: 5, name: "Ayşe", team: "C Team", total: 75, scores: [75] },
    { position: 6, name: "Fatma", team: "C Team", total: 75, scores: [75] },
    { position: 7, name: "Ali", team: "D Team", total: 75, scores: [75] },
    { position: 8, name: "Veli", team: "D Team", total: 75, scores: [75] }
  ],
  teams: [
    { position: 1, teamName: "A Team", totalRank: 3, totalSpeaker: 150, pullups: 0, speakerScores: [150], rankScores: [3], speakers: ["İbrahim Aydın", "Kutay Zengi"] },
    { position: 2, teamName: "B Team", totalRank: 2, totalSpeaker: 150, pullups: 0, speakerScores: [150], rankScores: [2], speakers: ["Ahmet", "Mehmet"] },
    { position: 3, teamName: "C Team", totalRank: 1, totalSpeaker: 150, pullups: 0, speakerScores: [150], rankScores: [1], speakers: ["Ayşe", "Fatma"] },
    { position: 4, teamName: "D Team", totalRank: 0, totalSpeaker: 150, pullups: 0, speakerScores: [150], rankScores: [0], speakers: ["Ali", "Veli"] }
  ]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/process-manual',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(JSON.parse(data));
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(payload);
req.end();
