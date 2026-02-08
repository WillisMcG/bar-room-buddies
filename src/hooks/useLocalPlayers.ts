'use client';

import { useState, useEffect, useCallback } from 'react';
import { db, getDeviceId } from '@/lib/db/dexie';
import type { LocalProfile } from '@/lib/db/dexie';
import { v4 as uuidv4 } from 'uuid';

export function useLocalPlayers() {
  const [players, setPlayers] = useState<LocalProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPlayers = useCallback(async () => {
    const all = await db.profiles.toArray();
    const active = all.filter((p) => !p.merged_into);
    active.sort((a, b) => a.display_name.localeCompare(b.display_name));
    setPlayers(active);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const addPlayer = useCallback(async (name: string): Promise<LocalProfile> => {
    const newPlayer: LocalProfile = {
      id: uuidv4(),
      email: null,
      display_name: name.trim(),
      avatar_url: null,
      avatar_blob: null,
      is_local: true,
      device_id: getDeviceId(),
      merged_into: null,
      venue_id: null,
      created_at: new Date().toISOString(),
      synced: false,
    };
    await db.profiles.add(newPlayer);
    await loadPlayers();
    return newPlayer;
  }, [loadPlayers]);

  const updatePlayer = useCallback(async (id: string, updates: Partial<LocalProfile>) => {
    await db.profiles.update(id, { ...updates, synced: false });
    await loadPlayers();
  }, [loadPlayers]);

  const deletePlayer = useCallback(async (id: string) => {
    await db.profiles.delete(id);
    await loadPlayers();
  }, [loadPlayers]);

  return { players, isLoading, addPlayer, updatePlayer, deletePlayer, reload: loadPlayers };
}