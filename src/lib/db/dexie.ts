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

export interface LocalMatch {
  id: string;
  game_type_id: string;
  player_1_id: string;
  player_2_id: string;
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
  status: 'active' | 'completed';
  started_at: string;
  completed_at: string | null;
  participant_ids: string[];          // All player IDs in this session
  table_player_ids: [string, string]; // The two currently playing
  waiting_queue: string[];            // Rotation order of waiting players
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
  winner_id: string;
  completed_at: string;
  prev_table_players: [string, string]; // Snapshot for undo
  prev_queue: string[];                 // Snapshot for undo
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