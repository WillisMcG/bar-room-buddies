'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSyncEngine } from '@/lib/sync/sync-engine';
import { db } from '@/lib/db/dexie';

export function useSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const engine = getSyncEngine();
    engine.start();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll for sync status
    const statusInterval = setInterval(async () => {
      try {
        const meta = await db.syncMeta.get('lastSynced');
        setLastSynced(meta?.value || null);

        const pending = await engine.getPendingCount();
        setPendingChanges(pending);
      } catch {
        // Ignore errors during status check
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(statusInterval);
    };
  }, []);

  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      const engine = getSyncEngine();
      await engine.syncAll();
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    isOnline,
    isSyncing,
    lastSynced,
    pendingChanges,
    syncNow,
  };
}
