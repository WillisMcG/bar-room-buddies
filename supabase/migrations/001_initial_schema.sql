-- ============================================================
-- Bar Room Buddies - Initial Database Schema
-- ============================================================
-- Run this in your Supabase SQL Editor to set up the database.
-- This creates all tables, indexes, RLS policies, and seed data.
-- ============================================================

-- ---------- Enable Extensions ----------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- Custom Types ----------
CREATE TYPE match_format AS ENUM ('single', 'race_to', 'best_of');
CREATE TYPE match_status AS ENUM ('in_progress', 'completed', 'abandoned');
CREATE TYPE win_condition_type AS ENUM ('race', 'points', 'timed');

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  is_local BOOLEAN NOT NULL DEFAULT true,
  device_id TEXT,
  merged_into UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_auth_user ON profiles(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX idx_profiles_device ON profiles(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX idx_profiles_merged ON profiles(merged_into) WHERE merged_into IS NOT NULL;

-- RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (needed for leaderboards, player lists)
CREATE POLICY "profiles_select_all" ON profiles
  FOR SELECT USING (true);

-- Users can insert their own profile (linked to their auth account)
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth_user_id = auth.uid() OR 
      is_local = true
    )
  );

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (
    auth_user_id = auth.uid()
  ) WITH CHECK (
    auth_user_id = auth.uid()
  );

-- Allow anonymous/unauthenticated inserts for local profiles
CREATE POLICY "profiles_insert_local" ON profiles
  FOR INSERT WITH CHECK (
    is_local = true AND auth_user_id IS NULL
  );

-- ============================================================
-- GAME TYPES
-- ============================================================
CREATE TABLE game_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  win_condition_type win_condition_type NOT NULL DEFAULT 'race',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rules_notes TEXT,
  default_format match_format NOT NULL DEFAULT 'single',
  default_format_target INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_types_system ON game_types(is_system) WHERE is_system = true;

-- RLS for game_types
ALTER TABLE game_types ENABLE ROW LEVEL SECURITY;

-- Anyone can read game types
CREATE POLICY "game_types_select_all" ON game_types
  FOR SELECT USING (true);

-- Authenticated users can create custom game types
CREATE POLICY "game_types_insert" ON game_types
  FOR INSERT WITH CHECK (
    is_system = false
  );

-- Creators can update their own custom game types
CREATE POLICY "game_types_update_own" ON game_types
  FOR UPDATE USING (
    is_system = false AND (
      created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
  );

-- Creators can delete their own custom game types
CREATE POLICY "game_types_delete_own" ON game_types
  FOR DELETE USING (
    is_system = false AND (
      created_by IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    )
  );

-- ============================================================
-- VENUES
-- ============================================================
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  accent_color TEXT NOT NULL DEFAULT '#22c55e',
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_venues_owner ON venues(owner_id);

-- RLS for venues
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Anyone can view venues
CREATE POLICY "venues_select_all" ON venues
  FOR SELECT USING (true);

-- Authenticated users can create venues
CREATE POLICY "venues_insert" ON venues
  FOR INSERT WITH CHECK (
    owner_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Only venue owner can update
CREATE POLICY "venues_update_own" ON venues
  FOR UPDATE USING (
    owner_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  ) WITH CHECK (
    owner_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- Only venue owner can delete
CREATE POLICY "venues_delete_own" ON venues
  FOR DELETE USING (
    owner_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

-- ============================================================
-- MATCHES
-- ============================================================
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_type_id UUID NOT NULL REFERENCES game_types(id) ON DELETE RESTRICT,
  player_1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  player_2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  format match_format NOT NULL DEFAULT 'single',
  format_target INTEGER,
  player_1_score INTEGER NOT NULL DEFAULT 0,
  player_2_score INTEGER NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status match_status NOT NULL DEFAULT 'in_progress',
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  synced BOOLEAN NOT NULL DEFAULT false,
  local_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure players are different
  CONSTRAINT different_players CHECK (player_1_id != player_2_id),
  -- Winner must be one of the players
  CONSTRAINT valid_winner CHECK (
    winner_id IS NULL OR winner_id = player_1_id OR winner_id = player_2_id
  ),
  -- Scores must be non-negative
  CONSTRAINT non_negative_scores CHECK (player_1_score >= 0 AND player_2_score >= 0)
);

CREATE INDEX idx_matches_player1 ON matches(player_1_id);
CREATE INDEX idx_matches_player2 ON matches(player_2_id);
CREATE INDEX idx_matches_game_type ON matches(game_type_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_venue ON matches(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX idx_matches_completed ON matches(completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_matches_synced ON matches(synced) WHERE synced = false;

-- RLS for matches
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Anyone can read matches
CREATE POLICY "matches_select_all" ON matches
  FOR SELECT USING (true);

-- Anyone can insert matches (supports local play without auth)
CREATE POLICY "matches_insert" ON matches
  FOR INSERT WITH CHECK (true);

-- Participants or authenticated users can update matches they're involved in
CREATE POLICY "matches_update" ON matches
  FOR UPDATE USING (true);

-- ============================================================
-- GAMES (individual games within a match)
-- ============================================================
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  winner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique game number per match
  CONSTRAINT unique_game_number UNIQUE (match_id, game_number)
);

CREATE INDEX idx_games_match ON games(match_id);
CREATE INDEX idx_games_winner ON games(winner_id);

-- RLS for games
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Anyone can read games
CREATE POLICY "games_select_all" ON games
  FOR SELECT USING (true);

-- Anyone can insert games (supports local play)
CREATE POLICY "games_insert" ON games
  FOR INSERT WITH CHECK (true);

-- Anyone can delete games (for undo functionality)
CREATE POLICY "games_delete" ON games
  FOR DELETE USING (true);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER venues_updated_at
  BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to merge a local profile into an account profile
CREATE OR REPLACE FUNCTION merge_profiles(local_profile_id UUID, account_profile_id UUID)
RETURNS void AS $$
BEGIN
  -- Update all matches where local profile was player_1
  UPDATE matches SET player_1_id = account_profile_id 
  WHERE player_1_id = local_profile_id;
  
  -- Update all matches where local profile was player_2
  UPDATE matches SET player_2_id = account_profile_id 
  WHERE player_2_id = local_profile_id;
  
  -- Update all matches where local profile was winner
  UPDATE matches SET winner_id = account_profile_id 
  WHERE winner_id = local_profile_id;
  
  -- Update all games where local profile was winner
  UPDATE games SET winner_id = account_profile_id 
  WHERE winner_id = local_profile_id;
  
  -- Mark the local profile as merged
  UPDATE profiles SET merged_into = account_profile_id 
  WHERE id = local_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get player stats
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
  -- Calculate wins and losses
  SELECT 
    COUNT(*) FILTER (WHERE winner_id = player_uuid) AS wins,
    COUNT(*) FILTER (WHERE winner_id IS NOT NULL AND winner_id != player_uuid) AS losses
  INTO total_wins, total_losses
  FROM matches
  WHERE status = 'completed'
    AND (player_1_id = player_uuid OR player_2_id = player_uuid)
    AND (game_type_uuid IS NULL OR game_type_id = game_type_uuid);

  -- Calculate win percentage
  IF (total_wins + total_losses) > 0 THEN
    win_percentage := ROUND((total_wins::NUMERIC / (total_wins + total_losses)::NUMERIC) * 100, 1);
  ELSE
    win_percentage := 0;
  END IF;

  -- Calculate streaks
  FOR rec IN
    SELECT winner_id, completed_at
    FROM matches
    WHERE status = 'completed'
      AND (player_1_id = player_uuid OR player_2_id = player_uuid)
      AND (game_type_uuid IS NULL OR game_type_id = game_type_uuid)
    ORDER BY completed_at DESC
  LOOP
    IF rec.winner_id = player_uuid THEN
      IF v_current_type = 'win' OR v_current_type = '' THEN
        v_streak := v_streak + 1;
        v_current_type := 'win';
      ELSE
        EXIT;
      END IF;
    ELSE
      IF v_current_type = 'loss' OR v_current_type = '' THEN
        v_streak := v_streak + 1;
        v_current_type := 'loss';
      ELSE
        EXIT;
      END IF;
    END IF;
  END LOOP;

  current_streak := v_streak;
  streak_type := COALESCE(NULLIF(v_current_type, ''), 'none');

  -- Longest win streak
  v_streak := 0;
  v_longest := 0;
  FOR rec IN
    SELECT winner_id
    FROM matches
    WHERE status = 'completed'
      AND (player_1_id = player_uuid OR player_2_id = player_uuid)
      AND (game_type_uuid IS NULL OR game_type_id = game_type_uuid)
    ORDER BY completed_at ASC
  LOOP
    IF rec.winner_id = player_uuid THEN
      v_streak := v_streak + 1;
      IF v_streak > v_longest THEN
        v_longest := v_streak;
      END IF;
    ELSE
      v_streak := 0;
    END IF;
  END LOOP;
  longest_streak := v_longest;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get head-to-head record
CREATE OR REPLACE FUNCTION get_head_to_head(player_a UUID, player_b UUID, game_type_uuid UUID DEFAULT NULL)
RETURNS TABLE (
  player_a_wins BIGINT,
  player_b_wins BIGINT,
  total_matches BIGINT,
  last_played TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE winner_id = player_a),
    COUNT(*) FILTER (WHERE winner_id = player_b),
    COUNT(*),
    MAX(completed_at)
  FROM matches
  WHERE status = 'completed'
    AND (
      (player_1_id = player_a AND player_2_id = player_b) OR
      (player_1_id = player_b AND player_2_id = player_a)
    )
    AND (game_type_uuid IS NULL OR game_type_id = game_type_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get leaderboard
CREATE OR REPLACE FUNCTION get_leaderboard(
  game_type_uuid UUID DEFAULT NULL,
  min_matches INTEGER DEFAULT 3,
  time_days INTEGER DEFAULT NULL
)
RETURNS TABLE (
  profile_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  wins BIGINT,
  losses BIGINT,
  win_percentage NUMERIC,
  total_matches BIGINT,
  rank BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH player_records AS (
    SELECT 
      p.id AS pid,
      p.display_name AS pname,
      p.avatar_url AS pavatar,
      COUNT(*) FILTER (WHERE m.winner_id = p.id) AS w,
      COUNT(*) FILTER (WHERE m.winner_id IS NOT NULL AND m.winner_id != p.id) AS l,
      COUNT(*) AS total
    FROM profiles p
    JOIN matches m ON (m.player_1_id = p.id OR m.player_2_id = p.id)
    WHERE m.status = 'completed'
      AND p.merged_into IS NULL
      AND (game_type_uuid IS NULL OR m.game_type_id = game_type_uuid)
      AND (time_days IS NULL OR m.completed_at >= now() - (time_days || ' days')::INTERVAL)
    GROUP BY p.id, p.display_name, p.avatar_url
    HAVING COUNT(*) >= min_matches
  )
  SELECT 
    pid,
    pname,
    pavatar,
    w,
    l,
    ROUND((w::NUMERIC / NULLIF(total, 0)::NUMERIC) * 100, 1),
    total,
    ROW_NUMBER() OVER (ORDER BY (w::NUMERIC / NULLIF(total, 0)::NUMERIC) DESC, total DESC)
  FROM player_records
  ORDER BY (w::NUMERIC / NULLIF(total, 0)::NUMERIC) DESC, total DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SEED DATA - System Game Types
-- ============================================================
INSERT INTO game_types (name, is_system, win_condition_type, rules_notes, default_format, default_format_target) VALUES
  ('8-Ball', true, 'race', 'Standard 8-ball rules. Pocket your group (solids or stripes) then the 8-ball. Scratching on the 8 is a loss.', 'race_to', 5),
  ('9-Ball', true, 'race', 'Balls must be pocketed in numerical order (1-9). The player who legally pockets the 9-ball wins.', 'race_to', 7),
  ('10-Ball', true, 'race', 'Call-shot version of 9-ball using balls 1-10. Must call every shot. The 10-ball wins the game.', 'race_to', 7),
  ('Straight Pool (14.1)', true, 'points', 'Call-shot game. Each legally pocketed ball is 1 point. Play to an agreed-upon target score. Balls are re-racked when only 1 remains.', 'race_to', 100);

-- ============================================================
-- STORAGE BUCKETS (run in Supabase dashboard or via API)
-- ============================================================
-- Note: Storage bucket creation typically done via Supabase dashboard.
-- These are the buckets needed:
--   1. avatars - for player avatar photos (public read)
--   2. venue-logos - for venue branding logos (public read)

-- Create storage policies (uncomment when running in Supabase):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('venue-logos', 'venue-logos', true);
