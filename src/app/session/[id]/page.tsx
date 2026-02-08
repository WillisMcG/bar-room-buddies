'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Undo2, Flag, Users, ArrowRight, Trophy, Shuffle } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { db } from '@/lib/db/dexie';
import type { LocalSession, LocalSessionGame, LocalProfile, LocalGameType, MatchMode } from '@/lib/db/dexie';
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
          <span>||||
                  </span>
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
  const [pickTeam1, setPickTeam1] = useState<[string, string] | null>(null);
  const [pickTeam2, setPickTeam2] = useState<[string, string] | null>(null);

  // Helper to check if session is doubles mode
  const isDoubles = session?.session_mode === 'doubles' || session?.session_mode === 'scotch_doubles';

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

  // Compute wins per player (singles) or per team (doubles)
  const winCounts = useMemo(() => {
    const counts = new Map<string, number>();

    if (isDoubles && session) {
      // For doubles, count wins per team member
      session.teams?.forEach(team => {
        counts.set(team[0], 0);
        counts.set(team[1], 0);
      });
      games.forEach(g => {
        counts.set(g.winner_id, (counts.get(g.winner_id) || 0) + 1);
      });
    } else if (session) {
      // Singles mode
      session.participant_ids.forEach(id => counts.set(id, 0));
      games.forEach(g => {
        counts.set(g.winner_id, (counts.get(g.winner_id) || 0) + 1);
      });
    }
    return counts;
  }, [session, games, isDoubles]);

  // Sorted leaderboard
  const leaderboard = useMemo(() => {
    if (!session) return [];

    if (isDoubles && session.teams) {
      // Doubles: show teams as units
      return [...session.teams]
        .map(team => {
          const p1Name = profiles.get(team[0])?.display_name || 'Unknown';
          const p2Name = profiles.get(team[1])?.display_name || 'Unknown';
          const teamName = `${p1Name} & ${p2Name}`;
          const p1Wins = winCounts.get(team[0]) || 0;
          const p2Wins = winCounts.get(team[1]) || 0;
          // Team wins = wins of first team member (they both have same count if tracking correctly)
          return {
            id: `${team[0]}-${team[1]}`, // unique team id
            name: teamName,
            team,
            avatarUrl: profiles.get(team[0])?.avatar_url || null,
            avatar2Url: profiles.get(team[1])?.avatar_url || null,
            wins: p1Wins,
          };
        })
        .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
    } else {
      // Singles mode
      return [...session.participant_ids]
        .map(id => ({
          id,
          name: profiles.get(id)?.display_name || 'Unknown',
          avatarUrl: profiles.get(id)?.avatar_url || null,
          wins: winCounts.get(id) || 0,
        }))
        .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
    }
  }, [session, profiles, winCounts, isDoubles]);

  const scoreGameSingles = async (winnerId: string) => {
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
      player_1_partner_id: null,
      player_2_partner_id: null,
      winner_id: winnerId,
      completed_at: new Date().toISOString(),
      prev_table_players: [p1, p2],
      prev_queue: [...session.waiting_queue],
      prev_table_teams: null,
      prev_team_queue: [],
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

  const scoreGameDoubles = async (winnerTeamIndex: 0 | 1) => {
    if (!session || session.status !== 'active' || !session.table_team_ids) return;

    const winnerTeam = session.table_team_ids[winnerTeamIndex];
    const loserTeam = session.table_team_ids[winnerTeamIndex === 0 ? 1 : 0];
    const nextGameNumber = games.length + 1;

    // Record the game with undo snapshot
    const newGame: LocalSessionGame = {
      id: uuidv4(),
      session_id: sessionId,
      game_number: nextGameNumber,
      player_1_id: winnerTeam[0],
      player_2_id: loserTeam[0],
      player_1_partner_id: winnerTeam[1],
      player_2_partner_id: loserTeam[1],
      winner_id: winnerTeam[0], // First player of winning team
      completed_at: new Date().toISOString(),
      prev_table_teams: session.table_team_ids,
      prev_team_queue: [...session.waiting_team_queue],
      prev_table_players: session.table_player_ids, // Keep for backwards compat
      prev_queue: session.waiting_queue, // Keep for backwards compat
      synced: false,
    };
    await db.sessionGames.add(newGame);

    // Rotate: winning team stays, losing team → back of queue, next from queue → table
    const newTeamQueue = [...session.waiting_team_queue];
    const nextTeam = newTeamQueue.shift(); // Take from front of queue
    newTeamQueue.push(loserTeam);          // Losing team goes to back

    const newTableTeams: [[string, string], [string, string]] = nextTeam
      ? [winnerTeam, nextTeam]
      : [winnerTeam, loserTeam]; // Edge case: no one in queue

    await db.sessions.update(sessionId, {
      table_team_ids: newTableTeams,
      waiting_team_queue: newTeamQueue,
      local_updated_at: new Date().toISOString(),
      synced: false,
    });

    await loadSession();
  };

  const scoreGame = async (winnerId: string) => {
    if (!session || session.status !== 'active') return;

    if (isDoubles && session.table_team_ids) {
      // Determine which team the winner belongs to
      const winnerTeamIndex = session.table_team_ids[0].includes(winnerId) ? 0 : 1;
      await scoreGameDoubles(winnerTeamIndex);
    } else {
      await scoreGameSingles(winnerId);
    }
  };

  const undoLastGame = async () => {
    if (!session || games.length === 0) return;

    const lastGame = games[games.length - 1];

    if (isDoubles && lastGame.prev_table_teams && lastGame.prev_team_queue !== undefined) {
      // Restore doubles state
      await db.sessions.update(sessionId, {
        table_team_ids: lastGame.prev_table_teams,
        waiting_team_queue: lastGame.prev_team_queue,
        local_updated_at: new Date().toISOString(),
        synced: false,
      });
    } else {
      // Restore singles state
      await db.sessions.update(sessionId, {
        table_player_ids: lastGame.prev_table_players,
        waiting_queue: lastGame.prev_queue,
        local_updated_at: new Date().toISOString(),
        synced: false,
      });
    }

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
    if (!session) return;

    if (isDoubles) {
      if (!pickTeam1 || !pickTeam2) return;

      // Build new queue from all non-table teams
      const selectedTeamIds = new Set([
        `${pickTeam1[0]}-${pickTeam1[1]}`,
        `${pickTeam2[0]}-${pickTeam2[1]}`,
      ]);
      const newTeamQueue = session.teams.filter(
        team => !selectedTeamIds.has(`${team[0]}-${team[1]}`)
      );

      await db.sessions.update(sessionId, {
        table_team_ids: [pickTeam1, pickTeam2],
        waiting_team_queue: newTeamQueue,
        local_updated_at: new Date().toISOString(),
        synced: false,
      });

      setShowPickPlayers(false);
      setPickTeam1(null);
      setPickTeam2(null);
    } else {
      if (!pickPlayer1 || !pickPlayer2 || pickPlayer1 === pickPlayer2) return;

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
    }

    await loadSession();
  };

  if (isLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading session...</div>
      </div>
    );
  }

  const isActive = session.status === 'active';

  // Completed view
  if (!isActive) {
    const winner = leaderboard[0];
    const durationStr = session.completed_at
      ? formatDuration(session.started_at, session.completed_at)
      : '';

    const modeLabel = isDoubles
      ? session.session_mode === 'scotch_doubles'
        ? 'Scotch Doubles'
        : 'Doubles'
      : 'Singles';

    return (
      <div className="min-h-screen pb-20 max-w-lg mx-auto px-4 pt-2">
        <div className="text-center py-6">
          <Trophy className="w-12 h-12 mx-auto text-yellow-500 mb-2" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Session Complete</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {gameType?.name} &middot; {modeLabel} &middot; {games.length} games{durationStr ? ` · ${durationStr}` : ''}
          </p>
        </div>

        {winner && (
          <Card className="mb-4 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Winner</div>
            {isDoubles && 'team' in winner ? (
              <div className="flex justify-center gap-3 mb-2">
                <Avatar name={profiles.get((winner as any).team[0])?.display_name || ''} imageUrl={winner.avatarUrl} size="lg" />
                <Avatar name={profiles.get((winner as any).team[1])?.display_name || ''} imageUrl={(winner as any).avatar2Url} size="lg" />
              </div>
            ) : (
              <Avatar name={winner.name} imageUrl={winner.avatarUrl} size="xl" className="mx-auto mb-2" />
            )}
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
                {isDoubles && 'team' in p ? (
                  <div className="flex gap-1.5">
                    <Avatar name={profiles.get((p as any).team[0])?.display_name || ''} imageUrl={p.avatarUrl} size="sm" />
                    <Avatar name={profiles.get((p as any).team[1])?.display_name || ''} imageUrl={(p as any).avatar2Url} size="sm" />
                  </div>
                ) : (
                  <Avatar name={p.name} imageUrl={p.avatarUrl} size="sm" />
                )}
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
  const modeLabel = isDoubles
    ? session.session_mode === 'scotch_doubles'
      ? 'Scotch Doubles'
      : 'Doubles'
    : 'Singles';

  const participantCount = isDoubles
    ? (session.teams?.length || 0) * 2
    : session.participant_ids.length;

  return (
    <div className="min-h-screen pb-20 max-w-lg mx-auto px-4">
      {/* Header */}
      <div className="text-center py-3">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {gameType?.name} &middot; {modeLabel} &middot; Open Table
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          Game #{games.length + 1} &middot; {participantCount} players
        </div>
      </div>

      {/* Current Table — Tap to score */}
      {isDoubles && session.table_team_ids ? (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Team 1 */}
          <button
            onClick={() => scoreGame(session.table_team_ids![0][0])}
            className="relative p-4 rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 transition-all active:scale-95 active:bg-blue-100 dark:active:bg-blue-900/50"
          >
            <div className="text-center">
              <div className="flex justify-center gap-2 mb-2">
                <Avatar
                  name={profiles.get(session.table_team_ids[0][0])?.display_name || ''}
                  imageUrl={profiles.get(session.table_team_ids[0][0])?.avatar_url}
                  size="md"
                />
                <Avatar
                  name={profiles.get(session.table_team_ids[0][1])?.display_name || ''}
                  imageUrl={profiles.get(session.table_team_ids[0][1])?.avatar_url}
                  size="md"
                />
              </div>
              <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {profiles.get(session.table_team_ids[0][0])?.display_name} &<br />
                {profiles.get(session.table_team_ids[0][1])?.display_name}
              </div>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                {winCounts.get(session.table_team_ids[0][0]) || 0}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">TAP IF WON</div>
            </div>
          </button>

          {/* Team 2 */}
          <button
            onClick={() => scoreGame(session.table_team_ids![1][0])}
            className="relative p-4 rounded-xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 transition-all active:scale-95 active:bg-red-100 dark:active:bg-red-900/50"
          >
            <div className="text-center">
              <div className="flex justify-center gap-2 mb-2">
                <Avatar
                  name={profiles.get(session.table_team_ids[1][0])?.display_name || ''}
                  imageUrl={profiles.get(session.table_team_ids[1][0])?.avatar_url}
                  size="md"
                />
                <Avatar
                  name={profiles.get(session.table_team_ids[1][1])?.display_name || ''}
                  imageUrl={profiles.get(session.table_team_ids[1][1])?.avatar_url}
                  size="md"
                />
              </div>
              <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {profiles.get(session.table_team_ids[1][0])?.display_name} &<br />
                {profiles.get(session.table_team_ids[1][1])?.display_name}
              </div>
              <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">
                {winCounts.get(session.table_team_ids[1][0]) || 0}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">TAP IF WON</div>
            </div>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Singles mode */}
          {(() => {
            const [tableP1, tableP2] = session.table_player_ids;
            const p1Profile = profiles.get(tableP1);
            const p2Profile = profiles.get(tableP2);
            const p1Wins = winCounts.get(tableP1) || 0;
            const p2Wins = winCounts.get(tableP2) || 0;

            return (
              <>
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
              </>
            );
          })()}
        </div>
      )}

      {/* Next Up */}
      {isDoubles && session.waiting_team_queue.length > 0 ? (
        <Card padding="sm" className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Next:</span>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {session.waiting_team_queue.map((team, i) => {
                const p1 = profiles.get(team[0]);
                const p2 = profiles.get(team[1]);
                return (
                  <span key={`${team[0]}-${team[1]}`} className="flex items-center gap-1 flex-shrink-0">
                    {i > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                    <div className="flex gap-0.5">
                      <Avatar name={p1?.display_name || ''} imageUrl={p1?.avatar_url} size="sm" />
                      <Avatar name={p2?.display_name || ''} imageUrl={p2?.avatar_url} size="sm" />
                    </div>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      {p1?.display_name} &amp; {p2?.display_name}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </Card>
      ) : !isDoubles && session.waiting_queue.length > 0 ? (
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
      ) : null}

      {/* Scoreboard */}
      <Card className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide">Scoreboard</h3>
        <div className="space-y-2">
          {leaderboard.map((p, i) => {
            const pAny = p as any;
            const isOnTable = isDoubles && 'team' in p
              ? session.table_team_ids && (
                  (pAny.team[0] === session.table_team_ids[0][0] || pAny.team[1] === session.table_team_ids[0][1]) ||
                  (pAny.team[0] === session.table_team_ids[1][0] || pAny.team[1] === session.table_team_ids[1][1])
                )
              : !isDoubles && (
                  p.id === session.table_player_ids[0] || p.id === session.table_player_ids[1]
                );
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
                {isDoubles && 'team' in p ? (
                  <div className="flex gap-1.5">
                    <Avatar name={profiles.get((p as any).team[0])?.display_name || ''} imageUrl={p.avatarUrl} size="sm" />
                    <Avatar name={profiles.get((p as any).team[1])?.display_name || ''} imageUrl={(p as any).avatar2Url} size="sm" />
                  </div>
                ) : (
                  <Avatar name={p.name} imageUrl={p.avatarUrl} size="sm" />
                )}
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
            if (isDoubles && session.table_team_ids) {
              setPickTeam1(session.table_team_ids[0]);
              setPickTeam2(session.table_team_ids[1]);
            } else {
              setPickPlayer1(session.table_player_ids[0]);
              setPickPlayer2(session.table_player_ids[1]);
            }
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

      {/* Pick Players/Teams Modal */}
      {isDoubles ? (
        <Modal isOpen={showPickPlayers} onClose={() => setShowPickPlayers(false)} title="Pick Teams">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose which teams play next
            </p>
            <div className="space-y-1">
              {session.teams?.map((team) => {
                const p1 = profiles.get(team[0]);
                const p2 = profiles.get(team[1]);
                const isTeam1 = pickTeam1 && pickTeam1[0] === team[0] && pickTeam1[1] === team[1];
                const isTeam2 = pickTeam2 && pickTeam2[0] === team[0] && pickTeam2[1] === team[1];
                return (
                  <button
                    key={`${team[0]}-${team[1]}`}
                    onClick={() => {
                      const teamStr = `${team[0]}-${team[1]}`;
                      const pickTeam1Str = pickTeam1 ? `${pickTeam1[0]}-${pickTeam1[1]}` : '';
                      const pickTeam2Str = pickTeam2 ? `${pickTeam2[0]}-${pickTeam2[1]}` : '';

                      if (isTeam1) {
                        setPickTeam1(null);
                      } else if (isTeam2) {
                        setPickTeam2(null);
                      } else if (!pickTeam1) {
                        setPickTeam1(team);
                      } else if (!pickTeam2) {
                        setPickTeam2(team);
                      } else {
                        setPickTeam2(team);
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                      isTeam1 ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700'
                      : isTeam2 ? 'bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                    }`}
                  >
                    <div className="flex gap-1.5">
                      <Avatar name={p1?.display_name || ''} imageUrl={p1?.avatar_url} size="sm" />
                      <Avatar name={p2?.display_name || ''} imageUrl={p2?.avatar_url} size="sm" />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {p1?.display_name} & {p2?.display_name}
                      </span>
                    </div>
                    {isTeam1 && <span className="text-xs text-blue-600">Team 1</span>}
                    {isTeam2 && <span className="text-xs text-red-600">Team 2</span>}
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
                disabled={!pickTeam1 || !pickTeam2}
              >
                Apply
              </Button>
            </div>
          </div>
        </Modal>
      ) : (
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
      )}
    </div>
  );
}
