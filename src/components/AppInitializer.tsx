'use client';

import { useEffect } from 'react';
import { seedSystemGameTypes } from '@/lib/db/dexie';

/**
 * Runs one-time app initialization tasks on mount:
 * - Seeds system game types into local IndexedDB if not present
 */
export default function AppInitializer() {
  useEffect(() => {
    seedSystemGameTypes().catch((err) => {
      console.error('Failed to seed system game types:', err);
    });
  }, []);

  return null;
}
