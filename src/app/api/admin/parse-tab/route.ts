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

// ── Team Tab Parser ──────────────────────────────────────────────────────────
function parseTeamTab(text: string, numRounds: number, warnings: string[]): ParsedTeam[] {
  const teams: ParsedTeam[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // How many tokens from the right are fixed:
  // numRounds rank scores + numRounds speaker scores + pullups + totalSpeaker + totalRank = 2*numRounds + 3
  const fixedRight = 2 * numRounds + 3;

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    if (tokens.length < fixedRight + 2) continue; // need at least position + 1 team name word

    // First token: position
    const position = parseInt(tokens[0]);
    if (isNaN(position)) continue; // skip header row

    // From right: numRounds rank scores
    const rankScores: number[] = [];
    for (let i = 0; i < numRounds; i++) {
      rankScores.unshift(parseFloat(tokens[tokens.length - 1 - i]));
    }

    // Next numRounds: speaker scores per round
    const speakerScores: number[] = [];
    for (let i = 0; i < numRounds; i++) {
      speakerScores.unshift(parseFloat(tokens[tokens.length - numRounds - 1 - i]));
    }

    const pullups = parseInt(tokens[tokens.length - 2 * numRounds - 1]);
    const totalSpeaker = parseInt(tokens[tokens.length - 2 * numRounds - 2]);
    const totalRank = parseInt(tokens[tokens.length - 2 * numRounds - 3]);

    if (isNaN(totalSpeaker) || isNaN(totalRank)) {
      warnings.push(`Satır parse edilemedi: "${line.slice(0, 60)}..."`);
      continue;
    }

    // Team name = tokens between position and fixedRight section
    const teamName = tokens.slice(1, tokens.length - fixedRight).join(" ").trim();
    if (!teamName) {
      warnings.push(`Takım ismi bulunamadı: "${line.slice(0, 60)}"`);
      continue;
    }

    teams.push({ position, teamName, totalRank, totalSpeaker, pullups: pullups || 0, speakerScores, rankScores, speakers: [] });
  }

  return teams;
}

// ── Speaker Tab Parser ───────────────────────────────────────────────────────
function parseSpeakerTab(text: string, numRounds: number, knownTeams: string[], warnings: string[]): ParsedSpeaker[] {
  const speakers: ParsedSpeaker[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // Fixed right: numRounds scores + 1 total = numRounds + 1
  const fixedRight = numRounds + 1;

  // Sort teams longest-first so we match greedily (e.g. "HACETTEPE Chivas Regal 18" before "HACETTEPE")
  const sortedTeams = [...knownTeams].sort((a, b) => b.length - a.length);

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    if (tokens.length < fixedRight + 2) continue;

    const position = parseInt(tokens[0]);
    if (isNaN(position)) continue;

    // From right: numRounds scores
    const scores: number[] = [];
    for (let i = 0; i < numRounds; i++) {
      scores.unshift(parseFloat(tokens[tokens.length - 1 - i]));
    }

    const total = parseFloat(tokens[tokens.length - numRounds - 1]);
    if (isNaN(total)) continue;

    // Middle blob: everything between position and scores/total
    const blob = tokens.slice(1, tokens.length - fixedRight).join(" ").trim();
    if (!blob) continue;

    // Try to find known team name in blob
    let name = blob;
    let team = "";

    for (const t of sortedTeams) {
      const idx = blob.indexOf(t);
      if (idx !== -1) {
        name = blob.slice(0, idx).trim();
        team = t;
        break;
      }
    }

    // Fallback: no team matched — use last few words as team
    if (!team) {
      const parts = blob.split(" ");
      name = parts.slice(0, 2).join(" ");
      team = parts.slice(2).join(" ");
      warnings.push(`Takım eşleştirilemedi: "${blob}" — manuel düzeltme gerekiyor`);
    }

    speakers.push({ position, name, team, total, scores });
  }

  return speakers;
}
