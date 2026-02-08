-- ============================================================
-- Bar Room Buddies - Seed Data
-- ============================================================
-- This runs automatically after migrations during `supabase db reset`.
-- Adds system game types and optional test data for local development.
-- ============================================================

-- System Game Types (idempotent - won't duplicate if migration already seeded them)
INSERT INTO game_types (name, is_system, win_condition_type, rules_notes, default_format, default_format_target)
SELECT * FROM (VALUES
  ('8-Ball', true, 'race'::win_condition_type, 'Standard 8-ball rules. Pocket your group (solids or stripes) then the 8-ball. Scratching on the 8 is a loss.', 'race_to'::match_format, 5),
  ('9-Ball', true, 'race'::win_condition_type, 'Balls must be pocketed in numerical order (1-9). The player who legally pockets the 9-ball wins.', 'race_to'::match_format, 7),
  ('10-Ball', true, 'race'::win_condition_type, 'Call-shot version of 9-ball using balls 1-10. Must call every shot. The 10-ball wins the game.', 'race_to'::match_format, 7),
  ('Straight Pool (14.1)', true, 'points'::win_condition_type, 'Call-shot game. Each legally pocketed ball is 1 point. Play to an agreed-upon target score. Balls are re-racked when only 1 remains.', 'race_to'::match_format, 100)
) AS v(name, is_system, win_condition_type, rules_notes, default_format, default_format_target)
WHERE NOT EXISTS (SELECT 1 FROM game_types WHERE is_system = true);

-- ============================================================
-- Storage Buckets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('venue-logos', 'venue-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars bucket
CREATE POLICY IF NOT EXISTS "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY IF NOT EXISTS "avatars_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "avatars_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "avatars_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Storage policies for venue-logos bucket
CREATE POLICY IF NOT EXISTS "venue_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'venue-logos');

CREATE POLICY IF NOT EXISTS "venue_logos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'venue-logos' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "venue_logos_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'venue-logos' AND auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "venue_logos_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'venue-logos' AND auth.role() = 'authenticated');
