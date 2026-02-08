// ============================================================
// Bar Room Buddies - Type Definitions
// ============================================================

// ---------- Enums ----------

export type MatchFormat = 'single' | 'race_to' | 'best_of';
export type MatchStatus = 'in_progress' | 'completed' | 'abandoned';
export type WinConditionType = 'race' | 'points' | 'timed';
export type ThemeMode = 'light' | 'dark';

// ---------- Database Models ----------

export interface Profile {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  is_local: boolean;
  device_id: string | null;
  merged_into: string | null;
  created_at: string;
}

export interface GameType {
  id: string;
  name: string;
  is_system: boolean;
  win_condition_type: WinConditionType;
  created_by: string | null;
  rules_notes: string | null;
  default_format: MatchFormat;
  default_format_target: number | null;
}

export interface Match {
  id: string;
  game_type_id: string;
  player_1_id: string;
  player_2_id: string;
  format: MatchFormat;
  format_target: number | null;
  player_1_score: number;
  player_2_score: number;
  winner_id: string | null;
  started_at: string;
  completed_at: string | null;
  status: MatchStatus;
  venue_id: string | null;
  synced: boolean;
  local_updated_at: string;
}

export interface Game {
  id: string;
  match_id: string;
  game_number: number;
  winner_id: string;
  completed_at: string;
}

export interface Venue {
  id: string;
  name: string;
  logo_url: string | null;
  accent_color: string;
  owner_id: string;
  created_at: string;
}

// ---------- UI / Component Props ----------

export interface PlayerStats {
  profile: Profile;
  total_wins: number;
  total_losses: number;
  win_percentage: number;
  current_streak: number;
  longest_streak: number;
  streak_type: 'win' | 'loss' | 'none';
}

export interface HeadToHead {
  opponent: Profile;
  wins: number;
  losses: number;
  last_played: string;
}

export interface MatchWithPlayers extends Match {
  player_1: Profile;
  player_2: Profile;
  game_type: GameType;
  games: Game[];
}

export interface LeaderboardEntry {
  profile: Profile;
  wins: number;
  losses: number;
  win_percentage: number;
  total_matches: number;
  rank: number;
}

// ---------- Form / Input Types ----------

export interface NewMatchInput {
  game_type_id: string;
  player_1_id: string;
  player_2_id: string;
  format: MatchFormat;
  format_target: number | null;
}

export interface NewPlayerInput {
  display_name: string;
  avatar_url?: string | null;
  is_local: boolean;
}

export interface NewGameTypeInput {
  name: string;
  win_condition_type: WinConditionType;
  rules_notes?: string | null;
  default_format: MatchFormat;
  default_format_target?: number | null;
}

export interface VenueInput {
  name: string;
  accent_color: string;
  logo_url?: string | null;
}

// ---------- Auth Types ----------

export interface AuthState {
  user: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// ---------- Sync Types ----------

export interface SyncStatus {
  lastSynced: string | null;
  pendingChanges: number;
  isSyncing: boolean;
  isOnline: boolean;
}
