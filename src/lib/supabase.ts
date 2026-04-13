import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Only initialize if both env vars are present and URL is valid
function createSupabaseClient(): SupabaseClient {
  if (
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "YOUR_SUPABASE_URL_HERE" &&
    supabaseUrl.startsWith("http")
  ) {
    return createClient(supabaseUrl, supabaseAnonKey);
  }
  // Return a dummy client that won't crash — it will fail at query time with a graceful error
  return createClient("https://placeholder.supabase.co", "placeholder-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
}

export const supabase = createSupabaseClient();

export type Speaker = {
  id: string;
  name: string;
  elo: number;
  total_tournaments: number;
  win_rate: number;
  career_avg_speak: number;
  prelim_round_count?: number;
  created_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  base_url: string;
  status: "pending" | "processed";
  created_at: string;
};

export type TournamentStats = {
  id: string;
  tournament_id: string;
  speaker_id: string;
  speak_avg: number;
  partner_id: string | null;
  break_status: boolean;
  final_status: boolean;
  champion_status: boolean;
  best_speaker_status: boolean;
  elo_change: number;
  carry_bonus: number;
};

export type EloHistory = {
  id: string;
  speaker_id: string;
  tournament_id: string;
  elo_before: number;
  elo_after: number;
  recorded_at: string;
};

export type H2HRecord = {
  id: string;
  winner_id: string;
  loser_id: string;
  tournament_id: string;
  round_count: number;
};
