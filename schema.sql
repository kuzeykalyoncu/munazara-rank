-- ============================================================
-- Münazara ELO Tracker - Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Konuşmacılar
CREATE TABLE IF NOT EXISTS speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  elo INTEGER NOT NULL DEFAULT 1000,
  total_tournaments INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  career_avg_speak NUMERIC(5,2) NOT NULL DEFAULT 0,
  match_count INTEGER NOT NULL DEFAULT 0,
  -- Break tracking
  br_count INTEGER NOT NULL DEFAULT 0,
  br_bonus_total INTEGER NOT NULL DEFAULT 0,
  -- Pairwise win/loss/tie (win_rate kaynağı)
  pairwise_wins INTEGER NOT NULL DEFAULT 0,
  pairwise_losses INTEGER NOT NULL DEFAULT 0,
  pairwise_ties INTEGER NOT NULL DEFAULT 0,
  -- Prelim-only SP (career_avg_speak kaynağı)
  prelim_speak_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  prelim_round_count INTEGER NOT NULL DEFAULT 0,
  -- Peak ELO tracking
  peak_elo INTEGER NOT NULL DEFAULT 1000,
  peak_elo_tournament TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turnuvalar
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turnuva bazlı konuşmacı istatistikleri
CREATE TABLE IF NOT EXISTS tournament_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  speaker_id UUID REFERENCES speakers(id) ON DELETE CASCADE,
  speak_avg NUMERIC(5,2),
  partner_id UUID REFERENCES speakers(id),
  break_status BOOLEAN DEFAULT FALSE,
  final_status BOOLEAN DEFAULT FALSE,
  champion_status BOOLEAN DEFAULT FALSE,
  best_speaker_status BOOLEAN DEFAULT FALSE,
  elo_change INTEGER DEFAULT 0,
  carry_bonus INTEGER DEFAULT 0,
  UNIQUE(tournament_id, speaker_id)
);

-- ELO geçmişi (grafik için)
CREATE TABLE IF NOT EXISTS elo_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id UUID REFERENCES speakers(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  elo_before INTEGER NOT NULL,
  elo_after INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Head-to-Head kayıtları
CREATE TABLE IF NOT EXISTS h2h_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id UUID REFERENCES speakers(id) ON DELETE CASCADE,
  loser_id UUID REFERENCES speakers(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round_name TEXT,
  round_count INTEGER DEFAULT 1,
  is_tie BOOLEAN DEFAULT FALSE

);

-- ============================================================
-- Row Level Security (RLS) - Public Read
-- ============================================================

ALTER TABLE speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE elo_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE h2h_records ENABLE ROW LEVEL SECURITY;

-- Public can read everything
CREATE POLICY "Public read speakers" ON speakers FOR SELECT USING (true);
CREATE POLICY "Public read tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "Public read tournament_stats" ON tournament_stats FOR SELECT USING (true);
CREATE POLICY "Public read elo_history" ON elo_history FOR SELECT USING (true);
CREATE POLICY "Public read h2h_records" ON h2h_records FOR SELECT USING (true);

-- Service role can do everything (for API routes)
CREATE POLICY "Service can insert speakers" ON speakers FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update speakers" ON speakers FOR UPDATE USING (true);
CREATE POLICY "Service can insert tournaments" ON tournaments FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update tournaments" ON tournaments FOR UPDATE USING (true);
CREATE POLICY "Service can insert tournament_stats" ON tournament_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can upsert tournament_stats" ON tournament_stats FOR UPDATE USING (true);
CREATE POLICY "Service can insert elo_history" ON elo_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert h2h_records" ON h2h_records FOR INSERT WITH CHECK (true);

-- Snapshots for backup/restore
CREATE TABLE IF NOT EXISTS elo_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  speakers_data JSONB NOT NULL,
  elo_history_data JSONB NOT NULL,
  tournament_stats_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE elo_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read snapshots" ON elo_snapshot FOR SELECT USING (true);
CREATE POLICY "Public insert snapshots" ON elo_snapshot FOR INSERT WITH CHECK (true);

-- Speaker Aliases (Rumuzlar)
CREATE TABLE IF NOT EXISTS speaker_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL UNIQUE,
  target_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE speaker_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read speaker_aliases" ON speaker_aliases FOR SELECT USING (true);
CREATE POLICY "Public insert speaker_aliases" ON speaker_aliases FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update speaker_aliases" ON speaker_aliases FOR UPDATE USING (true);
CREATE POLICY "Public delete speaker_aliases" ON speaker_aliases FOR DELETE USING (true);

-- ELO Round Log (Detaylı Raunt Logları)
CREATE TABLE IF NOT EXISTS elo_round_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id UUID REFERENCES speakers(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round_name TEXT,
  is_outround BOOLEAN,
  placement INTEGER,
  partner_name TEXT,
  partner_sp NUMERIC,
  own_sp NUMERIC,
  sp_diff NUMERIC,
  distribution_mode TEXT,
  team_raw_delta NUMERIC,
  elo_change NUMERIC,
  elo_before NUMERIC,
  elo_after NUMERIC,
  k_factor NUMERIC,
  team_elo_before NUMERIC,
  expected_score NUMERIC,
  actual_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE elo_round_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read elo_round_log" ON elo_round_log FOR SELECT USING (true);
CREATE POLICY "Public insert elo_round_log" ON elo_round_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update elo_round_log" ON elo_round_log FOR UPDATE USING (true);
CREATE POLICY "Public delete elo_round_log" ON elo_round_log FOR DELETE USING (true);

