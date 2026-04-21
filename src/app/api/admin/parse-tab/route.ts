import { NextRequest, NextResponse } from "next/server";

export interface ParsedSpeaker {
  position: number;
  name: string;
  team: string;
  total: number;
  scores: number[]; // per-round SP, 0 = didn't play
}

export interface ParsedTeam {
  position: number;
  teamName: string;
  totalRank: number;
  totalSpeaker: number;
  pullups: number;
  speakerScores: number[]; // per-round combined SP
  rankScores: number[];    // per-round rank (0-3)
  speakers: string[];      // filled after merging with speaker tab
}

/**
 * POST /api/admin/parse-tab
 * Body: { speakerText: string, teamText: string, numRounds: number }
 * Returns: { speakers: ParsedSpeaker[], teams: ParsedTeam[], warnings: string[] }
 *
 * Parsing strategy uses fixed-position-from-right extraction since numRounds is known.
 * Speaker Tab layout (right to left): [R5..R1 scores | total | ...name+team... | position]
 * Team Tab layout (right to left):    [RankR5..R1 | SpkR5..R1 | pullups | totalSpk | totalRank | ...teamName... | position]
 */
export async function POST(req: NextRequest) {
  try {
    const { speakerText, teamText, numRounds = 5 } = await req.json();
    const warnings: string[] = [];

    // ── Parse Team Tab ──────────────────────────────────────────────────────
    const teams = parseTeamTab(teamText, numRounds, warnings);

    // ── Parse Speaker Tab ───────────────────────────────────────────────────
    const teamNames = teams.map(t => t.teamName);
    const speakers = parseSpeakerTab(speakerText, numRounds, teamNames, warnings);

    // ── Link speakers to teams ──────────────────────────────────────────────
    for (const team of teams) {
      team.speakers = speakers
        .filter(sp => sp.team === team.teamName)
        .map(sp => sp.name);
    }

    return NextResponse.json({ speakers, teams, warnings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── Helper to extract end numbers ───────────────────────────────────────────
function extractLineParts(line: string, expectedNumbersCount: number): { position: number, nameBlob: string, numTokens: number[] } | null {
  // First extract the position (e.g. "1", "1=", "3")
  const posMatch = line.match(/^(\d+)[=a-zA-Z]*\s+(.*)/);
  if (!posMatch) return null;
  const position = parseInt(posMatch[1]);
  const rest = posMatch[2];

  // Extract all numbers at the end of the line
  const numMatch = rest.match(/(?:(?:^|\s+)\d+(?:\.\d+)?)+$/);
  if (!numMatch) return null;

  const numPartStr = numMatch[0].trim();
  const allTokens = numPartStr.split(/\s+/);
  
  // If we matched more numbers than expected, the extra numbers on the left belong to the name
  let nameBlob = rest.slice(0, rest.length - numMatch[0].length).trim();
  let numTokens = allTokens.map(Number);
  
  if (numTokens.length > expectedNumbersCount) {
    const extraCount = numTokens.length - expectedNumbersCount;
    const extraNums = allTokens.slice(0, extraCount);
    nameBlob = nameBlob ? nameBlob + " " + extraNums.join(" ") : extraNums.join(" ");
    numTokens = numTokens.slice(extraCount);
  } else if (numTokens.length < expectedNumbersCount) {
    // If fewer than expected (due to missing 0s), pad with 0s at the end (assume trailing scores missing)
    while (numTokens.length < expectedNumbersCount) {
      numTokens.push(0);
    }
  }

  return { position, nameBlob, numTokens };
}

// ── Team Tab Parser ──────────────────────────────────────────────────────────
function parseTeamTab(text: string, numRounds: number, warnings: string[]): ParsedTeam[] {
  const teams: ParsedTeam[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // fixedRight variables: [totalRank, totalSpeaker, pullups, ...speakerScores, ...rankScores]
  const fixedRight = 2 * numRounds + 3;

  for (const line of lines) {
    const parts = extractLineParts(line, fixedRight);
    if (!parts) continue;
    const { position, nameBlob: teamName, numTokens } = parts;

    // Tokens: [totalRank, totalSpeaker, pullups, SP_R1..RN, Rank_R1..RN]  (assuming left-to-right from the end blob)
    // Wait, the PDF prints (left to right): Rank total, SP total, pullups, (SpR1..RN), (RankR1..RN)
    // But Tabbycat outputs:
    // "1    OPEN Take Me To Mosque  12    752  1        148 146 150 154 154  2 2 2 3 3"
    // So mapping is: 0: Rank=12, 1: SP=752, 2: PU=1, [3..3+numR-1]: SpScores, [rest]: RankScores
    
    // We already aligned numTokens to be exactly fixedRight in length
    const totalRank = numTokens[0];
    const totalSpeaker = numTokens[1];
    const pullups = numTokens[2];
    
    const speakerScores = numTokens.slice(3, 3 + numRounds);
    const rankScores = numTokens.slice(3 + numRounds, 3 + 2 * numRounds);

    if (!teamName) {
      warnings.push(`Takım ismi bulunamadı: "${line.slice(0, 60)}"`);
      continue;
    }

    teams.push({ position, teamName, totalRank, totalSpeaker, pullups, speakerScores, rankScores, speakers: [] });
  }

  return teams;
}

// ── Speaker Tab Parser ───────────────────────────────────────────────────────
function parseSpeakerTab(text: string, numRounds: number, knownTeams: string[], warnings: string[]): ParsedSpeaker[] {
  const speakers: ParsedSpeaker[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const fixedRight = numRounds + 1; // total + numRounds scores
  const sortedTeams = [...knownTeams].sort((a, b) => b.length - a.length);

  for (const line of lines) {
    const parts = extractLineParts(line, fixedRight);
    if (!parts) continue;
    const { position, nameBlob: blob, numTokens } = parts;

    // tab output: total, R1..RN
    // e.g. "382 75 76 78 77 76" -> numTokens[0]=382, numTokens[1..N]=scores
    const total = numTokens[0];
    const scores = numTokens.slice(1);

    if (!blob) continue;

    let name = blob;
    let team = "";

    // 1st pass: strict match including boundaries
    for (const t of sortedTeams) {
      const idx = blob.indexOf(t);
      if (idx !== -1) {
        name = blob.slice(0, idx).trim();
        team = t;
        break;
      }
    }

    // Fallback: no team matched 
    if (!team) {
      const p = blob.split(" ");
      name = p.slice(0, Math.max(1, p.length - 2)).join(" ");
      team = p.slice(Math.max(1, p.length - 2)).join(" ");
      warnings.push(`Takım eşleştirilemedi: "${blob}" — manuel düzeltme gerekiyor`);
    }

    speakers.push({ position, name, team, total, scores });
  }

  return speakers;
}
