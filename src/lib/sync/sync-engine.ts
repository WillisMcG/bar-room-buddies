import { db } from '@/lib/db/dexie';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

// Maps Dexie table names to Supabase table names
const TABLE_MAP = {
  profiles: 'profiles',
  gameTypes: 'game_types',
  matches: 'matches',
  games: 'games',
  venues: 'venues',
  sessions: 'sessions',
  sessionGames: 'session_games',
  tournaments: 'tournaments',
  tournamentParticipants: 'tournament_participants',
  tournamentMatches: 'tournament_matches',
  tournamentGames: 'tournament_games',
  teams: 'teams',
} as const;

type DexieTableName = keyof typeof TABLE_MAP;

export class SyncEngine {
  private isRunning = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private syncInProgress = false;

  async start(intervalMs = 30000) {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial sync
    await this.syncAll();

    // Periodic sync
    this.intervalId = setInterval(() => {
      if (navigator.onLine) {
        this.syncAll();
      }
    }, intervalMs);

    // Sync on reconnect
    window.addEventListener('online', () => this.syncAll());
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async syncAll() {
    if (!navigator.onLine || this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      // Push all unsynced local data first (order matters for foreign keys)
      await this.pushTable('profiles', this.mapProfile);
      await this.pushTable('gameTypes', this.mapGameType);
      await this.pushTable('venues', this.mapVenue);
      await this.pushTable('matches', this.mapMatch);
      await this.pushTable('games', this.mapGame);
      await this.pushTable('sessions', this.mapSession);
      await this.pushTable('sessionGames', this.mapSessionGame);
      await this.pushTable('tournaments', this.mapTournament);
      await this.pushTable('tournamentParticipants', this.mapTournamentParticipant);
      await this.pushTable('tournamentMatches', this.mapTournamentMatch);
      await this.pushTable('tournamentGames', this.mapTournamentGame);
      await this.pushTable('teams', this.mapTeam);

      // Pull remote changes
      await this.pullTable('profiles', 'updated_at');
      await this.pullTable('gameTypes', null); // game_types don't have updated_at, pull all
      await this.pullTable('venues', 'updated_at');
      await this.pullTable('matches', 'local_updated_at');
      await this.pullTable('games', null);
      await this.pullTable('sessions', 'local_updated_at');
      await this.pullTable('sessionGames', null);
      await this.pullTable('tournaments', 'local_updated_at');
      await this.pullTable('tournamentParticipants', null);
      await this.pullTable('tournamentMatches', 'local_updated_at');
      await this.pullTable('tournamentGames', null);
      await this.pullTable('teams', null);

      await db.syncMeta.put({
        key: 'lastSynced',
        value: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async getPendingCount(): Promise<number> {
    const tables: DexieTableName[] = [
      'profiles', 'gameTypes', 'matches', 'games', 'venues',
      'sessions', 'sessionGames',
      'tournaments', 'tournamentParticipants', 'tournamentMatches', 'tournamentGames',
      'teams',
    ];

    const counts = await Promise.all(
      tables.map(async (tableName) => {
        try {
          return await db[tableName].where('synced').equals(0).count();
        } catch {
          return 0;
        }
      })
    );

    return counts.reduce((sum, c) => sum + c, 0);
  }

  // ============================================================
  // GENERIC PUSH: local → Supabase
  // ============================================================

  private async pushTable<T extends { id: string; synced: boolean }>(
    dexieTable: DexieTableName,
    mapFn: (record: T) => Record<string, unknown>,
  ) {
    const supabaseTable = TABLE_MAP[dexieTable];
    let unsynced: T[];

    try {
      unsynced = await (db[dexieTable] as any)
        .where('synced')
        .equals(0)
        .toArray();
    } catch {
      return;
    }

    if (unsynced.length === 0) return;

    // All profiles sync — local guests included so data persists in Supabase

    // Batch upsert in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < unsynced.length; i += chunkSize) {
      const chunk = unsynced.slice(i, i + chunkSize);
      const mapped = chunk.map(mapFn);

      try {
        const { error } = await supabase
          .from(supabaseTable)
          .upsert(mapped, { onConflict: 'id' });

        if (!error) {
          // Mark all in this chunk as synced
          const ids = chunk.map((r) => r.id);
          await (db[dexieTable] as any)
            .where('id')
            .anyOf(ids)
            .modify({ synced: true });
        } else {
          console.error(`Push ${supabaseTable} error:`, error.message);
          // Fall back to one-by-one so partial failures don't block everything
          for (const record of chunk) {
            try {
              const { error: singleErr } = await supabase
                .from(supabaseTable)
                .upsert(mapFn(record), { onConflict: 'id' });

              if (!singleErr) {
                await (db[dexieTable] as any).update(record.id, { synced: true });
              }
            } catch (e) {
              console.error(`Push single ${supabaseTable} error:`, e);
            }
          }
        }
      } catch (e) {
        console.error(`Push ${supabaseTable} batch error:`, e);
      }
    }
  }

  // ============================================================
  // GENERIC PULL: Supabase → local
  // ============================================================

  private async pullTable(
    dexieTable: DexieTableName,
    timestampCol: string | null,
  ) {
    const supabaseTable = TABLE_MAP[dexieTable];
    const syncMetaKey = `lastPull_${dexieTable}`;

    try {
      const lastSync = await db.syncMeta.get(syncMetaKey);
      let query = supabase.from(supabaseTable).select('*');

      // Incremental pull if we have a timestamp column and a previous sync time
      if (timestampCol && lastSync?.value) {
        query = query.gte(timestampCol, lastSync.value);
      }

      // Limit pull size to avoid overwhelming the client
      const { data, error } = await query.limit(500);

      if (error || !data) {
        if (error) console.error(`Pull ${supabaseTable} error:`, error.message);
        return;
      }

      for (const remote of data) {
        const existing = await (db[dexieTable] as any).get(remote.id);

        if (!existing) {
          // New remote record — add locally
          await (db[dexieTable] as any).put({
            ...remote,
            synced: true,
            // Preserve local-only fields that don't exist on remote
            ...(dexieTable === 'profiles' ? { avatar_blob: null } : {}),
            ...(dexieTable === 'venues' ? { logo_blob: null } : {}),
          });
        } else if (existing.synced !== false) {
          // Local is already synced — check if remote is newer (last-write-wins)
          if (timestampCol) {
            const remoteTime = new Date(remote[timestampCol]).getTime();
            const localTimestamp = (existing as any)[timestampCol];
            const localTime = localTimestamp ? new Date(localTimestamp).getTime() : 0;

            if (remoteTime >= localTime) {
              await (db[dexieTable] as any).put({
                ...remote,
                synced: true,
                ...(dexieTable === 'profiles' ? { avatar_blob: existing.avatar_blob || null } : {}),
                ...(dexieTable === 'venues' ? { logo_blob: existing.logo_blob || null } : {}),
              });
            }
          } else {
            // No timestamp column — remote wins for already-synced records
            await (db[dexieTable] as any).put({
              ...remote,
              synced: true,
              ...(dexieTable === 'profiles' ? { avatar_blob: existing.avatar_blob || null } : {}),
              ...(dexieTable === 'venues' ? { logo_blob: existing.logo_blob || null } : {}),
            });
          }
        }
        // If local is unsynced (synced === false), keep local version — it pushes next cycle
      }

      await db.syncMeta.put({
        key: syncMetaKey,
        value: new Date().toISOString(),
      });
    } catch (e) {
      console.error(`Pull ${supabaseTable} error:`, e);
    }
  }

  // ============================================================
  // FIELD MAPPERS: Dexie record → Supabase row
  // Strip local-only fields (blobs, etc.) before pushing
  // ============================================================

  private mapProfile = (p: any) => ({
    id: p.id,
    email: p.email,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    is_local: p.is_local,
    device_id: p.device_id,
    merged_into: p.merged_into,
    venue_id: p.venue_id,
    created_at: p.created_at,
  });

  private mapGameType = (g: any) => ({
    id: g.id,
    name: g.name,
    is_system: g.is_system,
    win_condition_type: g.win_condition_type,
    created_by: g.created_by,
    rules_notes: g.rules_notes,
    default_format: g.default_format,
    default_format_target: g.default_format_target,
  });

  private mapVenue = (v: any) => ({
    id: v.id,
    name: v.name,
    logo_url: v.logo_url,
    accent_color: v.accent_color,
    owner_id: v.owner_id,
    created_at: v.created_at,
  });

  private mapMatch = (m: any) => ({
    id: m.id,
    game_type_id: m.game_type_id,
    match_mode: m.match_mode || 'singles',
    player_1_id: m.player_1_id,
    player_2_id: m.player_2_id,
    player_1_partner_id: m.player_1_partner_id,
    player_2_partner_id: m.player_2_partner_id,
    format: m.format,
    format_target: m.format_target,
    player_1_score: m.player_1_score,
    player_2_score: m.player_2_score,
    winner_id: m.winner_id,
    started_at: m.started_at,
    completed_at: m.completed_at,
    status: m.status,
    venue_id: m.venue_id,
    local_updated_at: m.local_updated_at,
  });

  private mapGame = (g: any) => ({
    id: g.id,
    match_id: g.match_id,
    game_number: g.game_number,
    winner_id: g.winner_id,
    completed_at: g.completed_at,
  });

  private mapSession = (s: any) => ({
    id: s.id,
    game_type_id: s.game_type_id,
    session_mode: s.session_mode || 'singles',
    rotation_mode: s.rotation_mode || 'king_of_table',
    status: s.status,
    started_at: s.started_at,
    completed_at: s.completed_at,
    participant_ids: s.participant_ids,
    table_player_ids: s.table_player_ids,
    waiting_queue: s.waiting_queue,
    teams: JSON.stringify(s.teams || []),
    table_team_ids: s.table_team_ids ? JSON.stringify(s.table_team_ids) : null,
    waiting_team_queue: JSON.stringify(s.waiting_team_queue || []),
    venue_id: s.venue_id,
    local_updated_at: s.local_updated_at,
  });

  private mapSessionGame = (sg: any) => ({
    id: sg.id,
    session_id: sg.session_id,
    game_number: sg.game_number,
    player_1_id: sg.player_1_id,
    player_2_id: sg.player_2_id,
    player_1_partner_id: sg.player_1_partner_id,
    player_2_partner_id: sg.player_2_partner_id,
    winner_id: sg.winner_id,
    completed_at: sg.completed_at,
    prev_table_players: sg.prev_table_players,
    prev_queue: sg.prev_queue,
    prev_table_teams: sg.prev_table_teams ? JSON.stringify(sg.prev_table_teams) : null,
    prev_team_queue: JSON.stringify(sg.prev_team_queue || []),
  });

  private mapTournament = (t: any) => ({
    id: t.id,
    name: t.name,
    game_type_id: t.game_type_id,
    format: t.format,
    match_mode: t.match_mode || 'singles',
    match_format: t.match_format,
    match_format_target: t.match_format_target,
    status: t.status,
    seeding_method: t.seeding_method,
    total_participants: t.total_participants,
    started_at: t.started_at,
    completed_at: t.completed_at,
    winner_id: t.winner_id,
    venue_id: t.venue_id,
    local_updated_at: t.local_updated_at,
  });

  private mapTournamentParticipant = (tp: any) => ({
    id: tp.id,
    tournament_id: tp.tournament_id,
    player_id: tp.player_id,
    partner_id: tp.partner_id,
    seed_position: tp.seed_position,
    status: tp.status,
    eliminated_round: tp.eliminated_round,
  });

  private mapTournamentMatch = (tm: any) => ({
    id: tm.id,
    tournament_id: tm.tournament_id,
    match_number: tm.match_number,
    round_number: tm.round_number,
    match_order_in_round: tm.match_order_in_round,
    bracket_type: tm.bracket_type,
    player_1_id: tm.player_1_id,
    player_2_id: tm.player_2_id,
    player_1_partner_id: tm.player_1_partner_id,
    player_2_partner_id: tm.player_2_partner_id,
    player_1_seed: tm.player_1_seed,
    player_2_seed: tm.player_2_seed,
    player_1_score: tm.player_1_score,
    player_2_score: tm.player_2_score,
    winner_id: tm.winner_id,
    is_bye: tm.is_bye,
    status: tm.status,
    completed_at: tm.completed_at,
    next_winner_match_id: tm.next_winner_match_id,
    next_winner_slot: tm.next_winner_slot,
    next_loser_match_id: tm.next_loser_match_id,
    next_loser_slot: tm.next_loser_slot,
    local_updated_at: tm.local_updated_at,
  });

  private mapTournamentGame = (tg: any) => ({
    id: tg.id,
    tournament_match_id: tg.tournament_match_id,
    game_number: tg.game_number,
    winner_id: tg.winner_id,
    completed_at: tg.completed_at,
  });

  private mapTeam = (t: any) => ({
    id: t.id,
    player_1_id: t.player_1_id,
    player_2_id: t.player_2_id,
    team_name: t.team_name,
    created_at: t.created_at,
    venue_id: t.venue_id,
  });
}

// Singleton
let syncEngine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!syncEngine) {
    syncEngine = new SyncEngine();
  }
  return syncEngine;
}
