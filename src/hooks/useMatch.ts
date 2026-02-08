'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db/dexie';
import type { LocalMatch, LocalProfile, LocalGameType, LocalGame } from '@/lib/db/dexie';

export interface MatchState {
  match: LocalMatch | null;
  player1: LocalProfile | null;
  player2: LocalProfile | null;
  gameType: LocalGameType | null;
  games: LocalGame[];
  isLoading: boolean;
}

export function useMatch(matchId: string | undefined) {
  const [state, setState] = useState<MatchState>({
    match: null,
    player1: null,
    player2: null,
    gameType: null,
    games: [],
    isLoading: true,
  });

  const loadMatch = useCallback(async () => {
    if (!matchId) return;

    const match = await db.matches.get(matchId);
    if (!match) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    const [player1, player2, gameType, games] = await Promise.all([
      db.profiles.get(match.player_1_id),
      db.profiles.get(match.player_2_id),
      db.gameTypes.get(match.game_type_id),
      db.games.where('match_id').equals(matchId).sortBy('game_number'),
    ]);

    setState({
      match,
      player1: player1 || null,
      player2: player2 || null,
      gameType: gameType || null,
      games,
      isLoading: false,
    });
  }, [matchId]);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  return { ...state, reload: loadMatch };
}
