import { db } from '@/lib/db/dexie';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export class SyncEngine {
  private isRunning = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

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
    if (!navigator.onLine) return;

    try {
      await Promise.allSettled([
        this.syncProfiles(),
        this.syncMatches(),
        this.syncGames(),
      ]);

      await db.syncMeta.put({
        key: 'lastSynced',
        value: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Sync error:', error);
    }
  }

  async getPendingCount(): Promise<number> {
    const [profiles, matches, games] = await Promise.all([
      db.profiles.where('synced').equals(0).count(),
      db.matches.where('synced').equals(0).count(),
      db.games.where('synced').equals(0).count(),
    ]);
    return profiles + matches + games;
  }

  // ---------- Profile Sync ----------

  private async syncProfiles() {
    // Push unsynced local profiles to Supabase
    const unsynced = await db.profiles
      .where('synced')
      .equals(0)
      .filter((p) => !p.is_local) // Only sync account-linked profiles
      .toArray();

    for (const profile of unsynced) {
      try {
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: profile.id,
            email: profile.email,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            is_local: profile.is_local,
            device_id: profile.device_id,
            merged_into: profile.merged_into,
            created_at: profile.created_at,
          }, {
            onConflict: 'id',
          });

        if (!error) {
          await db.profiles.update(profile.id, { synced: true });
        }
      } catch (e) {
        console.error('Profile sync error:', e);
      }
    }

    // Pull profiles from Supabase
    try {
      const lastSync = await db.syncMeta.get('lastProfileSync');
      let query = supabase.from('profiles').select('*');

      if (lastSync?.value) {
        query = query.gte('updated_at', lastSync.value);
      }

      const { data, error } = await query;

      if (!error && data) {
        for (const profile of data) {
          const existing = await db.profiles.get(profile.id);
          if (!existing || !existing.synced === false) {
            await db.profiles.put({
              ...profile,
              avatar_blob: existing?.avatar_blob || null,
              synced: true,
            });
          }
        }

        await db.syncMeta.put({
          key: 'lastProfileSync',
          value: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('Profile pull error:', e);
    }
  }

  // ---------- Match Sync ----------

  private async syncMatches() {
    // Push unsynced matches
    const unsynced = await db.matches
      .where('synced')
      .equals(0)
      .toArray();

    for (const match of unsynced) {
      try {
        const { error } = await supabase
          .from('matches')
          .upsert({
            id: match.id,
            game_type_id: match.game_type_id,
            player_1_id: match.player_1_id,
            player_2_id: match.player_2_id,
            format: match.format,
            format_target: match.format_target,
            player_1_score: match.player_1_score,
            player_2_score: match.player_2_score,
            winner_id: match.winner_id,
            started_at: match.started_at,
            completed_at: match.completed_at,
            status: match.status,
            venue_id: match.venue_id,
            synced: true,
            local_updated_at: match.local_updated_at,
          }, {
            onConflict: 'id',
          });

        if (!error) {
          await db.matches.update(match.id, { synced: true });
        }
      } catch (e) {
        console.error('Match sync error:', e);
      }
    }

    // Pull matches from Supabase
    try {
      const lastSync = await db.syncMeta.get('lastMatchSync');
      let query = supabase.from('matches').select('*');

      if (lastSync?.value) {
        query = query.gte('local_updated_at', lastSync.value);
      }

      const { data, error } = await query.order('started_at', { ascending: false }).limit(100);

      if (!error && data) {
        for (const match of data) {
          const existing = await db.matches.get(match.id);
          
          // Use last-write-wins: remote wins if local is already synced
          if (!existing) {
            await db.matches.put({ ...match, synced: true });
          } else if (existing.synced) {
            // Remote is newer or same, update local
            const remoteTime = new Date(match.local_updated_at).getTime();
            const localTime = new Date(existing.local_updated_at).getTime();
            if (remoteTime >= localTime) {
              await db.matches.put({ ...match, synced: true });
            }
          }
          // If local is unsynced, keep local version (it will push on next sync)
        }

        await db.syncMeta.put({
          key: 'lastMatchSync',
          value: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('Match pull error:', e);
    }
  }

  // ---------- Game Sync ----------

  private async syncGames() {
    // Push unsynced games
    const unsynced = await db.games
      .where('synced')
      .equals(0)
      .toArray();

    for (const game of unsynced) {
      try {
        const { error } = await supabase
          .from('games')
          .upsert({
            id: game.id,
            match_id: game.match_id,
            game_number: game.game_number,
            winner_id: game.winner_id,
            completed_at: game.completed_at,
          }, {
            onConflict: 'id',
          });

        if (!error) {
          await db.games.update(game.id, { synced: true });
        }
      } catch (e) {
        console.error('Game sync error:', e);
      }
    }
  }
}

// Singleton
let syncEngine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!syncEngine) {
    syncEngine = new SyncEngine();
  }
  return syncEngine;
}
