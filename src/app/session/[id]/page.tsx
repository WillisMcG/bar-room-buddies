'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Undo2, Flag, Users, ArrowRight, Trophy, Shuffle } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { db } from '@/lib/db/dexie';
import type { LocalSession, LocalSessionGame, LocalProfile, LocalGameType } from '@/lib/db/dexie';
import { v4 as uuidv4 } from 'uuid';
import { formatDuration } from '@/lib/utils';

function TallyMarks({ count }: { count: number }) {
  const groups = Math.floor(count / 5);
  const remainder = count % 5;

  if (count === 0) {
    return <span className="text-gray-400 dark:text-gray-600 text-sm">-</span>;
  }

  return (
    <span className="font-mono text-sm tracking-wider text-gray-700 dark:text-gray-300">
      {Array(groups).fill(null).map((_, i) => (
        <span key={`g${i}`} className="mr-1.5 inline-block relative">
          <span>||||</span>
          <span className="absolute inset-0 flex items-center justify-center text-green-600 dark:text-green-400 font-bold">/</span>
        </span>
      ))}
      {'|'.repeat(remainder)}
    </span>
  );
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<LocalSession | null>(null);
  const [games, setGames] = useState<LocalSessionGame[]>([]);
  const [profiles, setProfiles] = useState<Map<string, LocalProfile>>(new Map());
  const [gameType, setGameType] = useState<LocalGameType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showPickPlayers, setShowPickPlayers] = useState(false);
  const [pickPlayer1, setPickPlayer1] = useState('');
  const [pickPlayer2, setPickPlayer2] = useState('');

  const loadSession = useCallback(async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    setSession(s);

    const sg = await db.sessionGames
      .where('session_id')
      .equals(sessionId)
      .sortBy('game_number');
    setGames(sg);

    const gt = await db.gameTypes.get(s.game_type_id);
    setGameType(gt || null);

    const profileMap = new Map<string, LocalProfile>();
    for (const pid of s.participant_ids) {
      const p = await db.profiles.get(pid);
      if (p) profileMap.set(pid, p);
    }
    setProfiles(profileMap);
    setIsLoading(false);
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Compute wins per player
  const winCounts = useMemo(() => {
    const counts = new Map<string, number>();
    session?.participant_ids.forEach(id => counts.set(id, 0));
    games.forEach(g => {
      counts.set(g.winner_id, (counts.get(g.winner_id) || 0) + 1);
    });
    return counts;
  }, [session, games]);

  // Sorted leaderboard
  const leaderboard = useMemo(() => {
    if (!session) return [];
    return [...session.participant_ids]
      .map(id => ({
        id,
        name: profiles.get(id)?.display_name || 'Unknown',
        avatarUrl: profiles.get(id)?.avatar_url || null,
        wins: winCounts.get(id) || 0,
      }))
      .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  }, [session, profiles, winCounts]);

  const scoreGame = async (winnerId: string) => {
    if (!session || session.status !== 'active') return;

    const [p1, p2] = session.table_player_ids;
    const loserId = winnerId === p1 ? p2 : p1;
    const nextGameNumber = games.length + 1;

    // Record the game with undo snapshot
    const newGame: LocalSessionGame = {
      id: uuidv4(),
      session_id: sessionId,
      game_number: nextGameNumber,
      player_1_id: p1,
      player_2_id: p2,
      winner_id: winnerId,
      completed_at: new Date().toISOString(),
      prev_table_players: [p1, p2],
      prev_queue: [...session.waiting_queue],
      synced: false,
    };
    await db.sessionGames.add(newGame);

    // Rotate: winner stays, loser → back of queue, next from queue → table
    const newQueue = [...session.waiting_queue];
    const nextPlayer = newQueue.shift(); // Take from front of queue
    newQueue.push(loserId);              // Loser goes to back

    const newTablePlayers: [string, string] = nextPlayer
      ? [winnerId, nextPlayer]
      : [winnerId, loserId]; // Edge case: no one in queue

    await db.sessions.update(sessionId, {
      table_player_ids: newTablePlayers,
      waiting_queue: newQueue,
      local_updated_at: new Date().toISOString(),
      synced: false,
    });

    await loadSession();
  };

  const undoLastGame = async () => {
    if (!session || games.length === 0) return;

    const lastGame = games[games.length - 1];

    // Restore previous state from snapshot
    await db.sessions.update(sessionId, {
      table_player_ids: lastGame.prev_table_players,
      waiting_queue: lastGame.prev_queue,
      local_updated_at: new Date().toISOString(),
      synced: false,
    });

    await db.sessionGames.delete(lastGame.id);
    await loadSession();
  };

  const endSession = async () => {
    if (!session) return;
    await db.sessions.update(sessionId, {
      status: 'completed' as const,
      completed_at: new Date().toISOString(),
      local_updated_at: new Date().toISOString(),
      synced: false,
    });
    await loadSession();
    setShowEndConfirm(false);
  };

  const applyPickPlayers = async () => {
    if (!session || !pickPlayer1 || !pickPlayer2 || pickPlayer1 === pickPlayer2) return;

    // Build new queue from all non-table participants
    const newQueue = session.participant_ids.filter(
      id => id !== pickPlayer1 && id !== pickPlayer2
    );

    await db.sessions.update(sessionId, {
      table_player_ids: [pickPlayer1, pickPlayer2] as [string, string],
      waiting_queue: newQueue,
      local_updated_at: new Date().toISOString(),
      synced: false,
    });

    setShowPickPlayers(false);
    setPickPlayer1('');
    setPickPlayer2('');
    await loadSession();
  };

  if (isLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading session...</div>
      </div>
    );
  }

  const [tableP1, tableP2] = session.table_player_ids;
  const p1Profile = profiles.get(tableP1);
  const p2Profile = profiles.get(tableP2);
  const p1Wins = winCounts.get(tableP1) || 0;
  const p2Wins = winCounts.get(tableP2) || 0;
  const isActive = session.status === 'active';

  // Completed view
  if (!isActive) {
    const winner = leaderboard[0];
    const durationStr = session.completed_at
      ? formatDuration(session.started_at, session.completed_at)
      : '';

    return (
      <div className="min-h-screen pb-20 max-w-lg mx-auto px-4 pt-2">
        <div className="text-center py-6">
          <Trophy className="w-12 h-12 mx-auto text-yellow-500 mb-2" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Session Complete</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {gameType?.name} &middot; {games.length} games{durationStr ? ` \u00B7 ${durationStr}` : ''}
          </p>
        </div>

        {winner && (
          <Card className="mb-4 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Winner</div>
            <Avatar name={winner.name} imageUrl={winner.avatarUrl} size="xl" className="mx-auto mb-2" />
            <div className="text-lg font-bold text-gray-900 dark:text-white">{winner.name}</div>
            <div className="text-sm text-green-600 dark:text-green-400">{winner.wins} wins</div>
          </Card>
        )}

        <Card className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Final Scores</h3>
          <div className="space-y-2">
            {leaderboard.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 py-1">
                <div className="w-6 text-center">
                  {i === 0 ? <span className="text-yellow-500 font-bold">1</span>
                    : <span className="text-xs text-gray-400">{i + 1}</span>}
                </div>
                <Avatar name={p.name} imageUrl={p.avatarUrl} size="sm" />
                <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{p.name}</span>
                <div className="flex items-center gap-2">
                  <TallyMarks count={p.wins} />
                  <span className="text-sm font-bold text-gray-900 dark:text-white w-6 text-right">{p.wins}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => router.push('/')}>
            Home
          </Button>
          <Button variant="accent" className="flex-1" onClick={() => router.push('/session/new')}>
            New Session
          </Button>
        </div>
      </div>
    );
  }

  // Active session view
  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto px-4">
      {/* Header */}
      <div className="text-center py-3">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {gameType?.name} &middot; Open Table
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          Game #{games.length + 1} &middot; {session.participant_ids.length} players
        </div>
      </div>

      {/* Current Table — Tap to score */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => scoreGame(tableP1)}
          className="relative p-4 rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 transition-all active:scale-95 active:bg-blue-100 dark:active:bg-blue-900/50"
        >
          <div className="text-center">
            <Avatar
              name={p1Profile?.display_name || ''}
              imageUrl={p1Profile?.avatar_url}
              size="lg"
              className="mx-auto mb-2"
            />
            <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {p1Profile?.display_name}
            </div>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {p1Wins}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">TAP IF WON</div>
          </div>
        </button>

        <button
          onClick={() => scoreGame(tableP2)}
          className="relative p-4 rounded-xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 transition-all active:scale-95 active:bg-red-100 dark:active:bg-red-900/50"
        >
          <div className="text-center">
            <Avatar
              name={p2Profile?.display_name || ''}
              imageUrl={p2Profile?.avatar_url}
              size="lg"
              className="mx-auto mb-2"
            />
            <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {p2Profile?.display_name}
            </div>
            <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">
              {p2Wins}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">TAP IF WON</div>
          </div>
        </button>
      </div>

      {/* Next Up */}
      {session.waiting_queue.length > 0 && (
        <Card padding="sm" className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Next up:</span>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {session.waiting_queue.map((pid, i) => {
                const p = profiles.get(pid);
                return (
                  <span key={pid} className="flex items-center gap-1 flex-shrink-0">
                    {i > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                    <Avatar name={p?.display_name || ''} imageUrl={p?.avatar_url} size="sm" />
                    <span className="text-xs text-gray-700 dark:text-gray-300">{p?.display_name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Scoreboard */}
      <Card className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide">Scoreboard</h3>
        <div className="space-y-2">
          {leaderboard.map((p, i) => {
            const isOnTable = p.id === tableP1 || p.id === tableP2;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 py-1.5 px-2 rounded-lg ${
                  isOnTable ? 'bg-gray-50 dark:bg-gray-800/50' : ''
                }`}
              >
                <div className="w-5 text-center">
                  {i === 0 && p.wins > 0 ? (
                    <Trophy className="w-4 h-4 text-yellow-500 mx-auto" />
                  ) : (
                    <span className="text-xs text-gray-400">{i + 1}</span>
                  )}
                </div>
                <Avatar name={p.name} imageUrl={p.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">
                    {p.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <TallyMarks count={p.wins} />
                  <span className="text-sm font-bold text-gray-900 dark:text-white w-6 text-right">{p.wins}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Controls */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={undoLastGame}
          disabled={games.length === 0}
        >
          <Undo2 className="w-4 h-4 mr-1" /> Undo
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => {
            setPickPlayer1(tableP1);
            setPickPlayer2(tableP2);
            setShowPickPlayers(true);
          }}
        >
          <Shuffle className="w-4 h-4 mr-1" /> Pick
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="flex-1"
          onClick={() => setShowEndConfirm(true)}
        >
          <Flag className="w-4 h-4 mr-1" /> End
        </Button>
      </div>

      {/* End Session Modal */}
      <Modal isOpen={showEndConfirm} onClose={() => setShowEndConfirm(false)} title="End Session?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            End this session after {games.length} game{games.length !== 1 ? 's' : ''}?
          </p>
          {leaderboard[0] && leaderboard[0].wins > 0 && (
            <div className="text-center py-2">
              <div className="text-xs text-gray-500 mb-1">Leader</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">
                {leaderboard[0].name} — {leaderboard[0].wins} wins
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowEndConfirm(false)}>
              Keep Playing
            </Button>
            <Button variant="danger" className="flex-1" onClick={endSession}>
              End Session
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pick Players Modal */}
      <Modal isOpen={showPickPlayers} onClose={() => setShowPickPlayers(false)} title="Pick Players">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose who plays next
          </p>
          <div className="space-y-1">
            {session.participant_ids.map(pid => {
              const p = profiles.get(pid);
              const isP1 = pickPlayer1 === pid;
              const isP2 = pickPlayer2 === pid;
              return (
                <button
                  key={pid}
                  onClick={() => {
                    if (isP1) {
                      setPickPlayer1('');
                    } else if (isP2) {
                      setPickPlayer2('');
                    } else if (!pickPlayer1) {
                      setPickPlayer1(pid);
                    } else if (!pickPlayer2) {
                      setPickPlayer2(pid);
                    } else {
                      setPickPlayer2(pid);
                    }
                  }}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isP1 ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700'
                    : isP2 ? 'bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                  }`}
                >
                  <Avatar name={p?.display_name || ''} imageUrl={p?.avatar_url} size="sm" />
                  <span className="text-sm text-gray-900 dark:text-white flex-1 text-left">{p?.display_name}</span>
                  {isP1 && <span className="text-xs text-blue-600">Player 1</span>}
                  {isP2 && <span className="text-xs text-red-600">Player 2</span>}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowPickPlayers(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={applyPickPlayers}
              disabled={!pickPlayer1 || !pickPlayer2 || pickPlayer1 === pickPlayer2}
            >
              Apply
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}