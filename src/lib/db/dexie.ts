import Dexie, { type EntityTable } from 'dexie';

// ---------- Local Database Types ----------

export interface LocalProfile {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  avatar_blob: Blob | null;
  is_local: boolean;
  device_id: string | null;
  merged_into: string | null;
  venue_id: string | null;
  created_at: string;
  synced: boolean;
}

export interface LocalGameType {
  id: string;
  name: string;
  is_system: boolean;
  win_condition_type: 'race' | 'points' | 'timed';
  created_by: string | null;
  rules_notes: string | null;
  default_format: 'single' | 'race_to' | 'best_of';
  default_format_target: number | null;
  synced: boolean;
}

export type MatchMode = 'singles' | 'doubles' | 'scotch_doubles';

export interface LocalMatch {
  id: string;
  game_type_id: string;
  match_mode: MatchMode;
  player_1_id: string;
  player_2_id: string;
  player_1_partner_id: string | null;  // doubles: Team 1 partner
  player_2_partner_id: string | null;  // doubles: Team 2 partner
  format: 'single' | 'race_to' | 'best_of';
  format_target: number | null;
  player_1_score: number;
  player_2_score: number;
  winner_id: string | null;
  started_at: string;
  completed_at: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  venue_id: string | null;
  synced: boolean;
  local_updated_at: string;
}

export interface LocalGame {
  id: string;
  match_id: string;
  game_number: number;
  winner_id: string;
  completed_at: string;
  synced: boolean;
}

export interface LocalVenue {
  id: string;
  name: string;
  logo_url: string | null;
  logo_blob: Blob | null;
  accent_color: string;
  owner_id: string;
  created_at: string;
  synced: boolean;
}

export interface LocalSession {
  id: string;
  game_type_id: string;
  session_mode: MatchMode;
  status: 'active' | 'completed';
  started_at: string;
  completed_at: string | null;
  participant_ids: string[];          // All player IDs in this session
  // Singles fields:
  table_player_ids: [string, string]; // The two currently playing (singles)
  waiting_queue: string[];            // Rotation order (singles)
  // Doubles fields:
  teams: Array<[string, string]>;                         // All team pairings
  table_team_ids: [[string, string], [string, string]] | null; // Two teams on table
  waiting_team_queue: Array<[string, string]>;            // Queue of waiting teams
  venue_id: string | null;
  synced: boolean;
  local_updated_at: string;
}

export interface LocalSessionGame {
  id: string;
  session_id: string;
  game_number: number;
  player_1_id: string;
  player_2_id: string;
  player_1_partner_id: string | null;  // doubles partner
  player_2_partner_id: string | null;  // doubles partner
  winner_id: string;
  completed_at: string;
  prev_table_players: [string, string]; // Snapshot for undo (singles)
  prev_queue: string[];                 // Snapshot for undo (singles)
  prev_table_teams: [[string, string], [string, string]] | null; // Snapshot (doubles)
  prev_team_queue: Array<[string, string]>;                      // Snapshot (doubles)
  synced: boolean;
}

export type TournamentFormat = 'single_elimination' | 'double_elimination';
export type TournamentStatus = 'setup' | 'in_progress' | 'completed';
export type BracketType = 'winners' | 'losers' | 'grand_final';
export type TournamentMatchStatus = 'pending' | 'ready' | 'in_progress' | 'completed';

export interface LocalTournament {
  id: string;
  name: string;
  game_type_id: string;
  format: TournamentFormat;
  match_mode: MatchMode;
  match_format: 'single' | 'race_to' | 'best_of';
  match_format_target: number | null;
  status: TournamentStatus;
  seeding_method: 'random' | 'manual';
  total_participants: number;
  started_at: string;
  completed_at: string | null;
  winner_id: string | null;
  venue_id: string | null;
  synced: boolean;
  local_updated_at: string;
}

export interface LocalTournamentParticipant {
  id: string;
  tournament_id: string;
  player_id: string;
  partner_id: string | null;
  seed_position: number;
  status: 'active' | 'eliminated';
  eliminated_round: number | null;
  synced: boolean;
}

export interface LocalTournamentMatch {
  id: string;
  tournament_id: string;
  match_number: number;
  round_number: number;
  match_order_in_round: number;
  bracket_type: BracketType;
  player_1_id: string | null;
  player_2_id: string | null;
  player_1_partner_id: string | null;
  player_2_partner_id: string | null;
  player_1_seed: number | null;
  player_2_seed: number | null;
  player_1_score: number;
  player_2_score: number;
  winner_id: string | null;
  is_bye: boolean;
  status: TournamentMatchStatus;
  completed_at: string | null;
  next_winner_match_id: string | null;
  next_winner_slot: 'player_1' | 'player_2' | null;
  next_loser_match_id: string | null;
  next_loser_slot: 'player_1' | 'player_2' | null;
  synced: boolean;
  local_updated_at: string;
}

export interface LocalTournamentGame {
  id: string;
  tournament_match_id: string;
  game_number: number;
  winner_id: string;
  completed_at: string;
  synced: boolean;
}

export interface SyncMeta {
  key: string;
  value: string;
}

// ---------- Database Class ----------

class BarRoomBuddiesDB extends Dexie {
  profiles!: EntityTable<LocalProfile, 'id'>;
  gameTypes!: EntityTable<LocalGameType, 'id'>;
  matches!: EntityTable<LocalMatch, 'id'>;
  games!: EntityTable<LocalGame, 'id'>;
  venues!: EntityTable<LocalVenue, 'id'>;
  syncMeta!: EntityTable<SyncMeta, 'key'>;
  sessions!: EntityTable<LocalSession, 'id'>;
  sessionGames!: EntityTable<LocalSessionGame, 'id'>;
  tournaments!: EntityTable<LocalTournament, 'id'>;
  tournamentParticipants!: EntityTable<LocalTournamentParticipant, 'id'>;
  tournamentMatches!: EntityTable<LocalTournamentMatch, 'id'>;
  tournamentGames!: EntityTable<LocalTournamentGame, 'id'>;

  constructor() {
    super('BarRoomBuddiesDB');

    this.version(1).stores({
      profiles: 'id, email, display_name, is_local, device_id, merged_into, synced',
      gameTypes: 'id, name, is_system, created_by, synced',
      matches: 'id, game_type_id, player_1_id, player_2_id, status, winner_id, started_at, completed_at, venue_id, synced, local_updated_at',
      games: 'id, match_id, game_number, winner_id, synced',
      venues: 'id, owner_id, synced',
      syncMeta: 'key',
    });

    this.version(2).stores({
      profiles: 'id, email, display_name, is_local, device_id, merged_into, synced',
      gameTypes: 'id, name, is_system, created_by, synced',
      matches: 'id, game_type_id, player_1_id, player_2_id, status, winner_id, started_at, completed_at, venue_id, synced, local_updated_at',
      games: 'id, match_id, game_number, winner_id, synced',
      venues: 'id, owner_id, synced',
      syncMeta: 'key',
      sessions: 'id, game_type_id, status, started_at, venue_id, synced',
      sessionGames: 'id, session_id, game_number, winner_id, synced',
    });

    // v3: Add doubles support fields (no index changes needed)
    this.version(3).stores({
      profiles: 'id, email, display_name, is_local, device_id, merged_into, synced',
      gameTypes: 'id, name, is_system, created_by, synced',
      matches: 'id, game_type_id, player_1_id, player_2_id, match_mode, status, winner_id, started_at, completed_at, venue_id, synced, local_updated_at',
      games: 'id, match_id, game_number, winner_id, synced',
      venues: 'id, owner_id, synced',
      syncMeta: 'key',
      sessions: 'id, game_type_id, session_mode, status, started_at, venue_id, synced',
      sessionGames: 'id, session_id, game_number, winner_id, synced',
    }).upgrade(tx => {
      // Set defaults for existing records
      tx.table('matches').toCollection().modify(match => {
        if (!match.match_mode) match.match_mode = 'singles';
        if (match.player_1_partner_id === undefined) match.player_1_partner_id = null;
        if (match.player_2_partner_id === undefined) match.player_2_partner_id = null;
      });
      tx.table('sessions').toCollection().modify(session => {
        if (!session.session_mode) session.session_mode = 'singles';
        if (!session.teams) session.teams = [];
        if (!session.table_team_ids) session.table_team_ids = null;
        if (!session.waiting_team_queue) session.waiting_team_queue = [];
      });
      tx.table('sessionGames').toCollection().modify(game => {
        if (game.player_1_partner_id === undefined) game.player_1_partner_id = null;
        if (game.player_2_partner_id === undefined) game.player_2_partner_id = null;
        if (!game.prev_table_teams) game.prev_table_teams = null;
        if (!game.prev_team_queue) game.prev_team_queue = [];
      });
    });

    // v4: Add tournament bracket support
    this.version(4).stores({
      profiles: 'id, email, display_name, is_local, device_id, merged_into, synced',
      gameTypes: 'id, name, is_system, created_by, synced',
      matches: 'id, game_type_id, player_1_id, player_2_id, match_mode, status, winner_id, started_at, completed_at, venue_id, synced, local_updated_at',
      games: 'id, match_id, game_number, winner_id, synced',
      venues: 'id, owner_id, synced',
      syncMeta: 'key',
      sessions: 'id, game_type_id, session_mode, status, started_at, venue_id, synced',
      sessionGames: 'id, session_id, game_number, winner_id, synced',
      tournaments: 'id, game_type_id, format, match_mode, status, started_at, venue_id, synced',
      tournamentParticipants: 'id, tournament_id, player_id, seed_position, status, synced',
      tournamentMatches: 'id, tournament_id, round_number, bracket_type, status, winner_id, synced',
      tournamentGames: 'id, tournament_match_id, game_number, winner_id, synced',
    });

    // v5: Add venue_id to profiles for venue scoping
    this.version(5).stores({
      profiles: 'id, email, display_name, is_local, device_id, merged_into, venue_id, synced',
      gameTypes: 'id, name, is_system, created_by, synced',
      matches: 'id, game_type_id, player_1_id, player_2_id, match_mode, status, winner_id, started_at, completed_at, venue_id, synced, local_updated_at',
      games: 'id, match_id, game_number, winner_id, synced',
      venues: 'id, owner_id, synced',
      syncMeta: 'key',
      sessions: 'id, game_type_id, session_mode, status, started_at, venue_id, synced',
      sessionGames: 'id, session_id, game_number, winner_id, synced',
      tournaments: 'id, game_type_id, format, match_mode, status, started_at, venue_id, synced',
      tournamentParticipants: 'id, tournament_id, player_id, seed_position, status, synced',
      tournamentMatches: 'id, tournament_id, round_number, bracket_type, status, winner_id, synced',
      tournamentGames: 'id, tournament_match_id, game_number, winner_id, synced',
    }).upgrade(tx => {
      // Set venue_id to null for existing profiles
      tx.table('profiles').toCollection().modify(profile => {
        if (profile.venue_id === undefined) profile.venue_id = null;
      });
    });
  }
}

// Singleton instance
export const db = new BarRoomBuddiesDB();

// ---------- Helper Functions ----------

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let deviceId = window.localStorage.getItem('brb_device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem('brb_device_id', deviceId);
  }
  return deviceId;
}

// Singleton promise to prevent race conditions when multiple components
// call seedSystemGameTypes() simultaneously
let _seedPromise: Promise<void> | null = null;

export function seedSystemGameTypes(): Promise<void> {
  if (!_seedPromise) {
    _seedPromise = _doSeedSystemGameTypes();
  }
  return _seedPromise;
}

async function _doSeedSystemGameTypes() {
  // First, deduplicate any existing system types (cleanup from race conditions)
  const allTypes = await db.gameTypes.toArray();
  const systemTypes = allTypes.filter(t => t.is_system);

  // Remove duplicates: keep only the first of each name
  const seen = new Set<string>();
  const toDelete: string[] = [];
  for (const t of systemTypes) {
    if (seen.has(t.name)) {
      toDelete.push(t.id);
    } else {
      seen.add(t.name);
    }
  }
  if (toDelete.length > 0) {
    await db.gameTypes.bulkDelete(toDelete);
  }

  // Check which system types are missing and only add those
  const existingNames = new Set(systemTypes.map(t => t.name));

  const requiredTypes: LocalGameType[] = [
    {
      id: crypto.randomUUID(),
      name: '8-Ball',
      is_system: true,
      win_condition_type: 'race',
      created_by: null,
      rules_notes: 'Standard 8-ball rules. Pocket your group (solids or stripes) then the 8-ball.',
      default_format: 'race_to',
      default_format_target: 5,
      synced: false,
    },
    {
      id: crypto.randomUUID(),
      name: '9-Ball',
      is_system: true,
      win_condition_type: 'race',
      created_by: null,
      rules_notes: 'Balls must be pocketed in numerical order (1-9). The player who legally pockets the 9-ball wins.',
      default_format: 'race_to',
      default_format_target: 7,
      synced: false,
    },
    {
      id: crypto.randomUUID(),
      name: '10-Ball',
      is_system: true,
      win_condition_type: 'race',
      created_by: null,
      rules_notes: 'Call-shot version of 9-ball using balls 1-10. Must call every shot.',
      default_format: 'race_to',
      default_format_target: 7,
      synced: false,
    },
    {
      id: crypto.randomUUID(),
      name: 'Straight Pool (14.1)',
      is_system: true,
      win_condition_type: 'points',
      created_by: null,
      rules_notes: 'Call-shot game. Each legally pocketed ball is 1 point. Play to an agreed-upon score.',
      default_format: 'race_to',
      default_format_target: 100,
      synced: false,
    },
  ];

  const missing = requiredTypes.filter(t => !existingNames.has(t.name));
  if (missing.length > 0) {
    await db.gameTypes.bulkAdd(missing);
  }
}