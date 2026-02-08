'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Undo2, Flag, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { db } from '@/lib/db/dexie';
import { matchFormatLabel, formatDuration } from '@/lib/utils';
import type { LocalMatch, LocalProfile, LocalGameType, LocalGame } from '@/lib/db/dexie';
import { v4 as uuidv4 } from 'uuid';

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<LocalMatch | null>(null);
  const [player1, setPlayer1] = useState<LocalProfile | null>(null);
  const [player2, setPlayer2] = useState<LocalProfile | null>(null);
  const [gameType, setGameType] = useState<LocalGameType | null>(null);
  const [games, setGames] = useState<LocalGame[]>([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadMatch = useCallback(async () => {
    if (!id) return;
    const m = await db.matches.get(id);
    if (!m) return;

    const [p1, p2, gt, g] = await Promise.all([
      db.profiles.get(m.player_1_id),
      db.profiles.get(m.player_2_id),
      db.gameTypes.get(m.game_type_id),
      db.games.where('match_id').equals(id).sortBy('game_number'),
    ]);

    setMatch(m);
    setPlayer1(p1 || null);
    setPlayer2(p2 || null);
    setGameType(gt || null);
    setGames(g);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  const checkMatchComplete = useCallback(
    (p1Score: number, p2Score: number, matchData: LocalMatch) => {
      if (matchData.format === 'single') {
        return p1Score === 1 || p2Score === 1;
      }
      if (matchData.format === 'race_to') {
        return p1Score >= (matchData.format_target || 1) || p2Score >= (matchData.format_target || 1);
      }
      if (matchData.format === 'best_of') {
        const needed = Math.ceil((matchData.format_target || 1) / 2);
        return p1Score >= needed || p2Score >= needed;
      }
      return false;
    },
    []
  );

  const scoreGame = async (winnerPlayerId: string) => {
    if (!match || match.status !== 'in_progress') return;

    const newGameNumber = games.length + 1;
    const newGame: LocalGame = {
      id: uuidv4(),
      match_id: match.id,
      game_number: newGameNumber,
      winner_id: winnerPlayerId,
      completed_at: new Date().toISOString(),
      synced: false,
    };

    await db.games.add(newGame);

    const newP1Score = match.player_1_score + (winnerPlayerId === match.player_1_id ? 1 : 0);
    const newP2Score = match.player_2_score + (winnerPlayerId === match.player_2_id ? 1 : 0);

    const isComplete = checkMatchComplete(newP1Score, newP2Score, match);
    const updates: Partial<LocalMatch> = {
      player_1_score: newP1Score,
      player_2_score: newP2Score,
      local_updated_at: new Date().toISOString(),
      synced: false,
    };

    if (isComplete) {
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
      updates.winner_id = newP1Score > newP2Score ? match.player_1_id : match.player_2_id;
    }

    await db.matches.update(match.id, updates);
    await loadMatch();
  };

  const undoLastGame = async () => {
    if (!match || games.length === 0) return;
    const lastGame = games[games.length - 1];

    await db.games.delete(lastGame.id);

    const newP1Score = match.player_1_score - (lastGame.winner_id === match.player_1_id ? 1 : 0);
    const newP2Score = match.player_2_score - (lastGame.winner_id === match.player_2_id ? 1 : 0);

    await db.matches.update(match.id, {
      player_1_score: newP1Score,
      player_2_score: newP2Score,
      status: 'in_progress',
      completed_at: null,
      winner_id: null,
      local_updated_at: new Date().toISOString(),
      synced: false,
    });

    await loadMatch();
  };

  const abandonMatch = async () => {
    if (!match) return;
    await db.matches.update(match.id, {
      status: 'abandoned',
      completed_at: new Date().toISOString(),
      local_updated_at: new Date().toISOString(),
      synced: false,
    });
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!match || !player1 || !player2) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <div>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Match not found</p>
          <Button variant="primary" onClick={() => router.push('/')}>Go Home</Button>
        </div>
      </div>
    );
  }

  const isComplete = match.status === 'completed';
  const isAbandoned = match.status === 'abandoned';

  // Completed match summary view
  if (isComplete || isAbandoned) {
    const winner = match.winner_id === player1.id ? player1 : player2;
    return (
      <div className="min-h-screen pb-20 pt-2">
        <div className="max-w-lg mx-auto px-4">
          <div className="flex items-center gap-2 mb-4 mt-2">
            <button onClick={() => router.push('/')} className="p-1">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Match Result</h1>
          </div>

          <Card className="text-center mb-4">
            {isComplete && (
              <div className="mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Winner</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <Avatar name={winner.display_name} imageUrl={winner.avatar_url} size="md" />
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{winner.display_name}</span>
                </div>
              </div>
            )}
            {isAbandoned && (
              <div className="mb-4">
                <Badge variant="warning" className="text-base px-4 py-1">Abandoned</Badge>
              </div>
            )}

            {/* Score display */}
            <div className="flex items-center justify-center gap-6 py-4">
              <div className="text-center">
                <Avatar name={player1.display_name} imageUrl={player1.avatar_url} size="lg" className="mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">{player1.display_name}</p>
              </div>
              <div className="text-3xl font-black text-gray-900 dark:text-white">
                {match.player_1_score} <span className="text-gray-400">-</span> {match.player_2_score}
              </div>
              <div className="text-center">
                <Avatar name={player2.display_name} imageUrl={player2.avatar_url} size="lg" className="mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">{player2.display_name}</p>
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700">
              <p>{gameType?.name} &middot; {matchFormatLabel(match.format, match.format_target)}</p>
              {match.completed_at && (
                <p>Duration: {formatDuration(match.started_at, match.completed_at)}</p>
              )}
            </div>
          </Card>

          {/* Game log */}
          {games.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Game Log</h3>
              <div className="space-y-1">
                {games.map((g) => (
                  <div key={g.id} className="flex items-center justify-between text-sm py-1">
                    <span className="text-gray-500 dark:text-gray-400">Game {g.game_number}</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {g.winner_id === player1.id ? player1.display_name : player2.display_name}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="mt-4 space-y-2">
            <Button variant="accent" className="w-full" onClick={() => router.push('/match/new')}>
              New Match
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push('/')}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Live scorekeeping view
  return (
    <div className="min-h-screen pb-20">
      {/* Game info bar */}
      <div className="bg-gray-100 dark:bg-gray-900 px-4 py-2 text-center">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {gameType?.name} &middot; {matchFormatLabel(match.format, match.format_target)}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex items-stretch" style={{ minHeight: '55vh' }}>
        {/* Player 1 side */}
        <button
          onClick={() => scoreGame(match.player_1_id)}
          className="flex-1 flex flex-col items-center justify-center p-4 bg-blue-50 dark:bg-blue-950/30 active:bg-blue-100 dark:active:bg-blue-900/40 transition-colors select-none"
        >
          <Avatar name={player1.display_name} imageUrl={player1.avatar_url} size="xl" className="mb-3" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{player1.display_name}</span>
          <span className="text-7xl font-black text-gray-900 dark:text-white">{match.player_1_score}</span>
          <span className="text-xs text-gray-400 mt-2">Tap to score</span>
        </button>

        {/* Divider */}
        <div className="w-px bg-gray-300 dark:bg-gray-700 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-300 dark:bg-gray-700 text-gray-500 text-xs font-bold px-1 py-2 rounded">
            VS
          </div>
        </div>

        {/* Player 2 side */}
        <button
          onClick={() => scoreGame(match.player_2_id)}
          className="flex-1 flex flex-col items-center justify-center p-4 bg-red-50 dark:bg-red-950/30 active:bg-red-100 dark:active:bg-red-900/40 transition-colors select-none"
        >
          <Avatar name={player2.display_name} imageUrl={player2.avatar_url} size="xl" className="mb-3" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{player2.display_name}</span>
          <span className="text-7xl font-black text-gray-900 dark:text-white">{match.player_2_score}</span>
          <span className="text-xs text-gray-400 mt-2">Tap to score</span>
        </button>
      </div>

      {/* Controls */}
      <div className="px-4 py-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={undoLastGame}
          disabled={games.length === 0}
          className="text-gray-500"
        >
          <Undo2 className="w-4 h-4 mr-1" /> Undo
        </Button>

        <div className="text-xs text-gray-400">
          Game {games.length + 1}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEndConfirm(true)}
          className="text-red-500"
        >
          <Flag className="w-4 h-4 mr-1" /> End
        </Button>
      </div>

      {/* End Match Confirmation */}
      <Modal isOpen={showEndConfirm} onClose={() => setShowEndConfirm(false)} title="End Match?">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          This match will be marked as abandoned. Are you sure?
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setShowEndConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={abandonMatch}>
            End Match
          </Button>
        </div>
      </Modal>
    </div>
  );
}
