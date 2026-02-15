-- ============================================================
-- Bar Room Buddies - Add Sessions, Tournaments, and Teams
-- ============================================================
-- Migration: 002_add_sessions_tournaments_teams
-- Adds all missing tables to bring Supabase in sync with Dexie schema.
-- ============================================================

-- ---------- Custom Types ----------
DO $$ BEGIN
  CREATE TYPE match_mode AS ENUM ('singles', 'doubles', 'scotch_doubles');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE rotation_mode AS ENUM ('king_of_table', 'round_robin', 'winners_out', 'straight_rotation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('active', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tournament_format AS ENUM ('single_elimination', 'double_elimination');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tournament_status AS ENUM ('setup', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bracket_type AS ENUM ('winners', 'losers', 'grand_final');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tournament_match_status AS ENUM ('pending', 'ready', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- Add match_mode column to existing matches table ----------
DO $$ BEGIN
  ALTER TABLE matches ADD COLUMN match_mode match_mode NOT NULL DEFAULT 'singles';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE matches ADD COLUMN player_1_partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE matches ADD COLUMN player_2_partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ---------- Add venue_id to profiles ----------
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- SESSIONS (Open Table)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_type_id UUID NOT NULL REFERENCES game_types(id) ON DELETE RESTRICT,
  session_mode match_mode NOT NULL DEFAULT 'singles',
  rotation_mode rotation_mode NOT NULL DEFAULT 'king_of_table',
  status session_status NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  participant_ids UUID[] NOT NULL DEFAULT '{}',
  table_player_ids UUID[2],
  waiting_queue UUID[] NOT NULL DEFAULT '{}',
  teams JSONB NOT NULL DEFAULT '[]',
  table_team_ids JSONB,
  waiting_team_queue JSONB NOT NULL DEFAULT '[]',
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  synced BOOLEAN NOT NULL DEFAULT false,
  local_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_venue ON sessions(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_synced ON sessions(synced) WHERE synced = false;

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_select_all" ON sessions FOR SELECT USING (true);
CREATE POLICY "sessions_insert" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "sessions_update" ON sessions FOR UPDATE USING (true);
CREATE POLICY "sessions_delete" ON sessions FOR DELETE USING (true);

-- ============================================================
-- SESSION GAMES
-- ============================================================
CREATE TABLE IF NOT EXISTS session_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  player_1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  player_2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  player_1_partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  player_2_partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  winner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_table_players UUID[2],
  prev_queue UUID[] NOT NULL DEFAULT '{}',
  prev_table_teams JSONB,
  prev_team_queue JSONB NOT NULL DEFAULT '[]',
  synced BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_session_games_session ON session_games(session_id);
CREATE INDEX IF NOT EXISTS idx_session_games_winner ON session_games(winner_id);
CREATE INDEX IF NOT EXISTS idx_session_games_synced ON session_games(synced) WHERE synced = false;

ALTER TABLE session_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_games_select_all" ON session_games FOR SELECT USING (true);
CREATE POLICY "session_games_insert" ON session_games FOR INSERT WITH CHECK (true);
CREATE POLICY "session_games_update" ON session_games FOR UPDATE USING (true);
CREATE POLICY "session_games_delete" ON session_games FOR DELETE USING (true);

-- ============================================================
-- TOURNAMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  game_type_id UUID NOT NULL REFERENCES game_types(id) ON DELETE RESTRICT,
  format tournament_format NOT NULL,
  match_mode match_mode NOT NULL DEFAULT 'singles',
  match_format match_format NOT NULL DEFAULT 'single',
  match_format_target INTEGER,
  status tournament_status NOT NULL DEFAULT 'setup',
  seeding_method TEXT NOT NULL DEFAULT 'random',
  total_participants INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  synced BOOLEAN NOT NULL DEFAULT false,
  local_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_venue ON tournaments(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournaments_synced ON tournaments(synced) WHERE synced = false;

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments_select_all" ON tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_insert" ON tournaments FOR INSERT WITH CHECK (true);
CREATE POLICY "tournaments_update" ON tournaments FOR UPDATE USING (true);
CREATE POLICY "tournaments_delete" ON tournaments FOR DELETE USING (true);

-- ============================================================
-- TOURNAMENT PARTICIPANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  seed_position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  eliminated_round INTEGER,
  synced BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT unique_participant UNIQUE (tournament_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_tp_tournament ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tp_player ON tournament_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_tp_synced ON tournament_participants(synced) WHERE synced = false;

ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_select_all" ON tournament_participants FOR SELECT USING (true);
CREATE POLICY "tp_insert" ON tournament_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "tp_update" ON tournament_participants FOR UPDATE USING (true);
CREATE POLICY "tp_delete" ON tournament_participants FOR DELETE USING (true);

-- ============================================================
-- TOURNAMENT MATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  match_order_in_round INTEGER NOT NULL,
  bracket_type bracket_type NOT NULL DEFAULT 'winners',
  player_1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  player_2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  player_1_partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  player_2_partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  player_1_seed INTEGER,
  player_2_seed INTEGER,
  player_1_score INTEGER NOT NULL DEFAULT 0,
  player_2_score INTEGER NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_bye BOOLEAN NOT NULL DEFAULT false,
  status tournament_match_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  next_winner_match_id UUID REFERENCES tournament_matches(id) ON DELETE SET NULL,
  next_winner_slot TEXT,
  next_loser_match_id UUID REFERENCES tournament_matches(id) ON DELETE SET NULL,
  next_loser_slot TEXT,
  synced BOOLEAN NOT NULL DEFAULT false,
  local_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tm_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tm_status ON tournament_matches(status);
CREATE INDEX IF NOT EXISTS idx_tm_bracket ON tournament_matches(tournament_id, bracket_type);
CREATE INDEX IF NOT EXISTS idx_tm_synced ON tournament_matches(synced) WHERE synced = false;

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tm_select_all" ON tournament_matches FOR SELECT USING (true);
CREATE POLICY "tm_insert" ON tournament_matches FOR INSERT WITH CHECK (true);
CREATE POLICY "tm_update" ON tournament_matches FOR UPDATE USING (true);
CREATE POLICY "tm_delete" ON tournament_matches FOR DELETE USING (true);

-- ============================================================
-- TOURNAMENT GAMES (individual games within a tournament match)
-- ============================================================
CREATE TABLE IF NOT EXISTS tournament_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_match_id UUID NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  winner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT unique_tournament_game UNIQUE (tournament_match_id, game_number)
);

CREATE INDEX IF NOT EXISTS idx_tg_match ON tournament_games(tournament_match_id);
CREATE INDEX IF NOT EXISTS idx_tg_synced ON tournament_games(synced) WHERE synced = false;

ALTER TABLE tournament_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_select_all" ON tournament_games FOR SELECT USING (true);
CREATE POLICY "tg_insert" ON tournament_games FOR INSERT WITH CHECK (true);
CREATE POLICY "tg_update" ON tournament_games FOR UPDATE USING (true);
CREATE POLICY "tg_delete" ON tournament_games FOR DELETE USING (true);

-- ============================================================
-- TEAMS (persistent doubles team names)
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  synced BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT unique_team_pair UNIQUE (player_1_id, player_2_id),
  CONSTRAINT different_team_players CHECK (player_1_id != player_2_id)
);

CREATE INDEX IF NOT EXISTS idx_teams_p1 ON teams(player_1_id);
CREATE INDEX IF NOT EXISTS idx_teams_p2 ON teams(player_2_id);
CREATE INDEX IF NOT EXISTS idx_teams_venue ON teams(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_teams_synced ON teams(synced) WHERE synced = false;

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select_all" ON teams FOR SELECT USING (true);
CREATE POLICY "teams_insert" ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY "teams_update" ON teams FOR UPDATE USING (true);
CREATE POLICY "teams_delete" ON teams FOR DELETE USING (true);

-- ============================================================
-- UPDATE merge_profiles TO INCLUDE NEW TABLES
-- ============================================================
CREATE OR REPLACE FUNCTION merge_profiles(local_profile_id UUID, account_profile_id UUID)
RETURNS void AS $$
BEGIN
  -- Matches
  UPDATE matches SET player_1_id = account_profile_id WHERE player_1_id = local_profile_id;
  UPDATE matches SET player_2_id = account_profile_id WHERE player_2_id = local_profile_id;
  UPDATE matches SET player_1_partner_id = account_profile_id WHERE player_1_partner_id = local_profile_id;
  UPDATE matches SET player_2_partner_id = account_profile_id WHERE player_2_partner_id = local_profile_id;
  UPDATE matches SET winner_id = account_profile_id WHERE winner_id = local_profile_id;

  -- Games
  UPDATE games SET winner_id = account_profile_id WHERE winner_id = local_profile_id;

  -- Session games
  UPDATE session_games SET player_1_id = account_profile_id WHERE player_1_id = local_profile_id;
  UPDATE session_games SET player_2_id = account_profile_id WHERE player_2_id = local_profile_id;
  UPDATE session_games SET player_1_partner_id = account_profile_id WHERE player_1_partner_id = local_profile_id;
  UPDATE session_games SET player_2_partner_id = account_profile_id WHERE player_2_partner_id = local_profile_id;
  UPDATE session_games SET winner_id = account_profile_id WHERE winner_id = local_profile_id;

  -- Tournament participants
  UPDATE tournament_participants SET player_id = account_profile_id WHERE player_id = local_profile_id;
  UPDATE tournament_participants SET partner_id = account_profile_id WHERE partner_id = local_profile_id;

  -- Tournament matches
  UPDATE tournament_matches SET player_1_id = account_profile_id WHERE player_1_id = local_profile_id;
  UPDATE tournament_matches SET player_2_id = account_profile_id WHERE player_2_id = local_profile_id;
  UPDATE tournament_matches SET player_1_partner_id = account_profile_id WHERE player_1_partner_id = local_profile_id;
  UPDATE tournament_matches SET player_2_partner_id = account_profile_id WHERE player_2_partner_id = local_profile_id;
  UPDATE tournament_matches SET winner_id = account_profile_id WHERE winner_id = local_profile_id;

  -- Tournament games
  UPDATE tournament_games SET winner_id = account_profile_id WHERE winner_id = local_profile_id;

  -- Tournaments (winner)
  UPDATE tournaments SET winner_id = account_profile_id WHERE winner_id = local_profile_id;

  -- Teams
  UPDATE teams SET player_1_id = account_profile_id WHERE player_1_id = local_profile_id;
  UPDATE teams SET player_2_id = account_profile_id WHERE player_2_id = local_profile_id;

  -- Mark as merged
  UPDATE profiles SET merged_into = account_profile_id WHERE id = local_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- UPDATE get_player_stats TO INCLUDE SESSION GAMES
-- ============================================================
CREATE OR REPLACE FUNCTION get_player_stats(player_uuid UUID, game_type_uuid UUID DEFAULT NULL)
RETURNS TABLE (
  total_wins BIGINT,
  total_losses BIGINT,
  win_percentage NUMERIC,
  current_streak INTEGER,
  longest_streak INTEGER,
  streak_type TEXT
) AS $$
DECLARE
  v_streak INTEGER := 0;
  v_longest INTEGER := 0;
  v_streak_type TEXT := 'none';
  v_current_type TEXT := '';
  rec RECORD;
BEGIN
  -- Combine match wins/losses with session game wins/losses
  WITH all_results AS (
    -- From matches
    SELECT
      winner_id,
      completed_at,
      game_type_id
    FROM matches
    WHERE status = 'completed'
      AND (player_1_id = player_uuid OR player_2_id = player_uuid)
    UNION ALL
    -- From session games
    SELECT
      sg.winner_id,
      sg.completed_at,
      s.game_type_id
    FROM session_games sg
    JOIN sessions s ON sg.session_id = s.id
    WHERE (sg.player_1_id = player_uuid OR sg.player_2_id = player_uuid)
  )
  SELECT
    COUNT(*) FILTER (WHERE winner_id = player_uuid) AS wins,
    COUNT(*) FILTER (WHERE winner_id IS NOT NULL AND winner_id != player_uuid) AS losses
  INTO total_wins, total_losses
  FROM all_results
  WHERE (game_type_uuid IS NULL OR game_type_id = game_type_uuid);

  IF (total_wins + total_losses) > 0 THEN
    win_percentage := ROUND((total_wins::NUMERIC / (total_wins + total_losses)::NUMERIC) * 100, 1);
  ELSE
    win_percentage := 0;
  END IF;

  -- Calculate streaks from combined results
  FOR rec IN
    WITH all_results AS (
      SELECT winner_id, completed_at, game_type_id
      FROM matches
      WHERE status = 'completed'
        AND (player_1_id = player_uuid OR player_2_id = player_uuid)
      UNION ALL
      SELECT sg.winner_id, sg.completed_at, s.game_type_id
      FROM session_games sg
      JOIN sessions s ON sg.session_id = s.id
      WHERE (sg.player_1_id = player_uuid OR sg.player_2_id = player_uuid)
    )
    SELECT winner_id, completed_at
    FROM all_results
    WHERE (game_type_uuid IS NULL OR game_type_id = game_type_uuid)
    ORDER BY completed_at DESC
  LOOP
    IF rec.winner_id = player_uuid THEN
      IF v_current_type = 'win' OR v_current_type = '' THEN
        v_streak := v_streak + 1;
        v_current_type := 'win';
      ELSE EXIT;
      END IF;
    ELSE
      IF v_current_type = 'loss' OR v_current_type = '' THEN
        v_streak := v_streak + 1;
        v_current_type := 'loss';
      ELSE EXIT;
      END IF;
    END IF;
  END LOOP;

  current_streak := v_streak;
  streak_type := COALESCE(NULLIF(v_current_type, ''), 'none');

  v_streak := 0;
  v_longest := 0;
  FOR rec IN
    WITH all_results AS (
      SELECT winner_id, completed_at, game_type_id
      FROM matches
      WHERE status = 'completed'
        AND (player_1_id = player_uuid OR player_2_id = player_uuid)
      UNION ALL
      SELECT sg.winner_id, sg.completed_at, s.game_type_id
      FROM session_games sg
      JOIN sessions s ON sg.session_id = s.id
      WHERE (sg.player_1_id = player_uuid OR sg.player_2_id = player_uuid)
    )
    SELECT winner_id
    FROM all_results
    WHERE (game_type_uuid IS NULL OR game_type_id = game_type_uuid)
    ORDER BY completed_at ASC
  LOOP
    IF rec.winner_id = player_uuid THEN
      v_streak := v_streak + 1;
      IF v_streak > v_longest THEN v_longest := v_streak; END IF;
    ELSE
      v_streak := 0;
    END IF;
  END LOOP;
  longest_streak := v_longest;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
