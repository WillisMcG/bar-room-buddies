'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Undo2, CheckCircle2 } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { db } from '@/lib/db/dexie';
import type {
  LocalTournament,
  LocalTournamentMatch,
  LocalTournamentGame,
  LocalProfile,
  LocalGameType,
} from '@/lib/db/dexie';
import {
  advanceWinner,
  reverseAdvancement,
  checkMatchComplete,
  getRoundLabel,
  getWinnersRoundCount,
} from '@/lib/tournaments/tournament-helpers';

export default function TournamentMatchPage() {
  const params = useParams<{ id: string; matchId: string }>();
  const router = useRouter();

  const [tournament, setTournament] = useState<LocalTournament | null>(null);
  const [match, setMatch] = useState<LocalTournamentMatch | null>(null);
  const [games, setGames] = useState<LocalTournamentGame[]>([]);
  const [gameType, setGameType] = useState<LocalGameType | null>(null);
  const [profiles, setProfiles] = useState<Map<string, LocalProfile>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!params.id || !params.matchId) return;

    const t = await db.tournaments.get(params.id);
    if (!t) { router.push('/play'); return; }
    setTournament(t);

    const gt = await db.gameTypes.get(t.game_type_id);
    setGameType(gt || null);

    const m = await db.tournamentMatches.get(params.matchId);
    if (!m) { router.push(`/tournament/${params.id}`); return; }
    setMatch(m);

    const g = await db.tournamentGames
      .where('tournament_match_id').equals(params.matchId)
      .toArray();
    g.sort((a, b) => a.game_number - b.game_number);
    setGames(g);

    const allProfiles = await db.profiles.toArray();
    const profileMap = new Map<string, LocalProfile>();
    allProfiles.forEach(pr => profileMap.set(pr.id, pr));
    setProfiles(profileMap);

    // Mark match as in_progress if it was ready
    if (m.status === 'ready') {
      await db.tournamentMatches.update(m.id, {
        status: 'in_progress',
        local_updated_at: new Date().toISOString(),
      });
      setMatch({ ...m, status: 'in_progress' });
    }

    setIsLoading(false);
  }, [params.id, params.matchId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Score a game
  const scoreGame = async (winnerId: string) => {
    if (!match || !tournament || match.status === 'completed') return;

    const now = new Date().toISOString();
    const isP1 = winnerId === match.player_1_id;
    const newP1Score = match.player_1_score + (isP1 ? 1 : 0);
    const newP2Score = match.player_2_score + (isP1 ? 0 : 1);

    // Record the game
    const game: LocalTournamentGame = {
      id: crypto.randomUUID(),
      tournament_match_id: match.id,
      game_number: games.length + 1,
      winner_id: winnerId,
      completed_at: now,
      synced: false,
    };
    await db.tournamentGames.add(game);

    // Update match scores
    await db.tournamentMatches.update(match.id, {
      player_1_score: newP1Score,
      player_2_score: newP2Score,
      local_updated_at: now,
    });

    // Check if match is complete
    const isComplete = checkMatchComplete(
      newP1Score,
      newP2Score,
      tournament.match_format,
      tournament.match_format_target,
    );

    if (isComplete) {
      const winnerPartnerId = isP1 ? match.player_1_partner_id : match.player_2_partner_id;
      const updatedMatch = await db.tournamentMatches.get(match.id);
      if (updatedMatch) {
        await advanceWinner(updatedMatch, winnerId, winnerPartnerId, tournament);
      }
    }

    loadData();
  };

  const [undoError, setUndoError] = useState<string | null>(null);

  // Undo last game (including reversing bracket advancement if match was completed)
  const handleUndo = async () => {
    if (!match || !tournament || games.length === 0) return;
    setUndoError(null);

    const lastGame = games[games.length - 1];
    const now = new Date().toISOString();

    // If the match is completed, we need to reverse advancement first
    if (match.status === 'completed') {
      const result = await reverseAdvancement(match, tournament);
      if (!result.success) {
        setUndoError(result.error || 'Cannot undo this match.');
        return;
      }
    }

    // Delete the game
    await db.tournamentGames.delete(lastGame.id);

    // Recalculate scores
    const isP1Win = lastGame.winner_id === match.player_1_id;
    const newP1Score = match.player_1_score - (isP1Win ? 1 : 0);
    const newP2Score = match.player_2_score - (isP1Win ? 0 : 1);

    await db.tournamentMatches.update(match.id, {
      player_1_score: newP1Score,
      player_2_score: newP2Score,
      status: 'in_progress',
      winner_id: null,
      completed_at: null,
      local_updated_at: now,
    });

    loadData();
  };

  if (isLoading || !match || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  const p1 = match.player_1_id ? profiles.get(match.player_1_id) : null;
  const p2 = match.player_2_id ? profiles.get(match.player_2_id) : null;
  const p1Partner = match.player_1_partner_id ? profiles.get(match.player_1_partner_id) : null;
  const p2Partner = match.player_2_partner_id ? profiles.get(match.player_2_partner_id) : null;
  const isCompleted = match.status === 'completed';
  const isDoubles = tournament.match_mode === 'doubles' || tournament.match_mode === 'scotch_doubles';

  const winnersRounds = getWinnersRoundCount(tournament.total_participants);
  const roundLabel = getRoundLabel(match.round_number, winnersRounds, match.bracket_type);

  const formatLabel = tournament.match_format === 'single'
    ? 'Single Game'
    : tournament.match_format === 'race_to'
    ? `Race to ${tournament.match_format_target}`
    : `Best of ${tournament.match_format_target}`;

  // ===== COMPLETED MATCH =====
  if (isCompleted) {
    const winner = match.winner_id === match.player_1_id ? p1 : p2;
    const winnerPartner = match.winner_id === match.player_1_id ? p1Partner : p2Partner;
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
        <div className="p-4">
          <button onClick={() => router.push(`/tournament/${params.id}`)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{roundLabel}</p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {winner?.display_name}{winnerPartner ? ` & ${winnerPartner.display_name}` : ''} wins!
          </h2>
          <p className="text-4xl font-black text-gray-900 dark:text-white mb-6">
            {match.player_1_score} \u2013 {match.player_2_score}
          </p>

          {/* Game log */}
          <div className="w-full max-w-xs space-y-1 mb-6">
            {games.map(g => {
              const gWinner = profiles.get(g.winner_id);
              return (
                <div key={g.id} className="flex items-center justify-between text-sm px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded">
                  <span className="text-gray-500">Game {g.game_number}</span>
                  <span className="text-gray-900 dark:text-white font-medium">{gWinner?.display_name}</span>
                </div>
              );
            })}
          </div>

          {undoError && (
            <p className="text-sm text-red-500 mb-2">{undoError}</p>
          )}

          <div className="w-full max-w-xs space-y-2">
            <Button onClick={() => router.push(`/tournament/${params.id}`)} className="w-full">
              Back to Bracket
            </Button>
            <Button
              variant="ghost"
              onClick={handleUndo}
              className="w-full"
            >
              <Undo2 className="w-4 h-4 mr-1.5" /> Undo Result
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== IN-PROGRESS MATCH =====
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <button onClick={() => router.push(`/tournament/${params.id}`)} className="p-1">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">{roundLabel}</p>
          <p className="text-xs text-gray-400">{formatLabel}</p>
        </div>
        <Badge variant="info">
          {match.bracket_type === 'winners' ? 'W' : match.bracket_type === 'losers' ? 'L' : 'GF'}
        </Badge>
      </div>

      {/* Scoring area */}
      <div className="flex-1 flex items-stretch" style={{ minHeight: '55vh' }}>
        {/* Player 1 side */}
        <button
          onClick={() => match.player_1_id && scoreGame(match.player_1_id)}
          className="flex-1 flex flex-col items-center justify-center p-4 transition-colors active:bg-blue-50 dark:active:bg-blue-900/20 border-r border-gray-200 dark:border-gray-800"
        >
          <div className="mb-2">
            {match.player_1_seed && (
              <span className="text-xs text-gray-400 block mb-1">#{match.player_1_seed} seed</span>
            )}
            <Avatar name={p1?.display_name || '?'} size="lg" />
            {isDoubles && p1Partner && (
              <Avatar name={p1Partner.display_name} size="md" className="mt-1" />
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[120px]">
            {p1?.display_name || 'TBD'}
          </p>
          {isDoubles && p1Partner && (
            <p className="text-xs text-gray-500 truncate max-w-[120px]">{p1Partner.display_name}</p>
          )}
          <p className="text-7xl font-black text-blue-600 dark:text-blue-400 my-4">
            {match.player_1_score}
          </p>
          <p className="text-xs text-gray-400">Tap to score</p>
        </button>

        {/* VS */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="w-10 h-10 rounded-full bg-gray-900 dark:bg-gray-100 flex items-center justify-center">
            <span className="text-xs font-bold text-white dark:text-gray-900">VS</span>
          </div>
        </div>

        {/* Player 2 side */}
        <button
          onClick={() => match.player_2_id && scoreGame(match.player_2_id)}
          className="flex-1 flex flex-col items-center justify-center p-4 transition-colors active:bg-red-50 dark:active:bg-red-900/20"
        >
          <div className="mb-2">
            {match.player_2_seed && (
              <span className="text-xs text-gray-400 block mb-1">#{match.player_2_seed} seed</span>
            )}
            <Avatar name={p2?.display_name || '?'} size="lg" />
            {isDoubles && p2Partner && (
              <Avatar name={p2Partner.display_name} size="md" className="mt-1" />
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[120px]">
            {p2?.display_name || 'TBD'}
          </p>
          {isDoubles && p2Partner && (
            <p className="text-xs text-gray-500 truncate max-w-[120px]">{p2Partner.display_name}</p>
          )}
          <p className="text-7xl font-black text-red-600 dark:text-red-400 my-4">
            {match.player_2_score}
          </p>
          <p className="text-xs text-gray-400">Tap to score</p>
        </button>
      </div>

      {/* Controls */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between safe-area-bottom">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={games.length === 0}
        >
          <Undo2 className="w-4 h-4 mr-1" /> Undo
        </Button>

        <span className="text-sm text-gray-500 dark:text-gray-400">
          Game {games.length + 1}
        </span>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/tournament/${params.id}`)}
        >
          Back
        </Button>
      </div>
    </div>
  );
}
