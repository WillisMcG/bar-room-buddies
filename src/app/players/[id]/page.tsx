'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Zap, Pencil } from 'lucide-react';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { db } from '@/lib/db/dexie';
import { getWinPercentage, getStreakText, formatDateTime, matchFormatLabel } from '@/lib/utils';
import type { LocalProfile, LocalMatch, LocalGameType, LocalSessionGame } from '@/lib/db/dexie';

interface HeadToHeadRecord {
  opponent: LocalProfile;
  wins: number;
  losses: number;
}

interface GameTypeStatRecord {
  gameType: LocalGameType;
  wins: number;
  losses: number;
  winPct: number;
  longestStreak: number;
}

interface MatchHistoryItem extends LocalMatch {
  opponent?: LocalProfile;
  gameType?: LocalGameType;
}

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [player, setPlayer] = useState<LocalProfile | null>(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0, winPct: 0, currentStreak: 0, streakType: 'none' as string, longestStreak: 0 });
  const [gameTypeStats, setGameTypeStats] = useState<GameTypeStatRecord[]>([]);
  const [h2h, setH2h] = useState<HeadToHeadRecord[]>([]);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [tab, setTab] = useState<'stats' | 'h2h' | 'history'>('stats');
  const [isLoading, setIsLoading] = useState(true);
  const [showEditName, setShowEditName] = useState(false);
  const [editName, setEditName] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    const p = await db.profiles.get(id);
    if (!p) return;
    setPlayer(p);

    // Get completed matches (includes doubles — check partner IDs too)
    const matches = await db.matches
      .where('status')
      .equals('completed')
      .filter((m) =>
        m.player_1_id === id || m.player_2_id === id ||
        m.player_1_partner_id === id || m.player_2_partner_id === id
      )
      .toArray();

    matches.sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

    // Helper: did this player win a given match/game?
    const didWinMatch = (m: { player_1_id: string; player_1_partner_id?: string | null; winner_id: string | null }) => {
      const onTeam1 = m.player_1_id === id || m.player_1_partner_id === id;
      const team1Won = m.winner_id === m.player_1_id;
      return onTeam1 ? team1Won : !team1Won;
    };

    // Get session games (includes doubles — check partner IDs too)
    const allSessionGames = await db.sessionGames.toArray();
    const sessionGames = allSessionGames
      .filter((g) =>
        g.player_1_id === id || g.player_2_id === id ||
        g.player_1_partner_id === id || g.player_2_partner_id === id
      )
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

    // Get tournament matches (includes doubles — check partner IDs too)
    const allTournamentMatches = await db.tournamentMatches
      .where('status')
      .equals('completed')
      .filter((m) =>
        (m.player_1_id === id || m.player_2_id === id ||
         m.player_1_partner_id === id || m.player_2_partner_id === id) &&
        !m.is_bye
      )
      .toArray();
    allTournamentMatches.sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

    const matchWins = matches.filter((m) => didWinMatch(m)).length;
    const matchLosses = matches.length - matchWins;
    const sessionWins = sessionGames.filter((g) => didWinMatch(g)).length;
    const sessionLosses = sessionGames.length - sessionWins;
    const tournamentWins = allTournamentMatches.filter((m) => {
      const onTeam1 = m.player_1_id === id || m.player_1_partner_id === id;
      const team1Won = m.winner_id === m.player_1_id;
      return onTeam1 ? team1Won : !team1Won;
    }).length;
    const tournamentLosses = allTournamentMatches.length - tournamentWins;

    const wins = matchWins + sessionWins + tournamentWins;
    const losses = matchLosses + sessionLosses + tournamentLosses;

    // Combine all games chronologically for streak calculation
    type GameResult = { won: boolean; date: string };
    const allGames: GameResult[] = [
      ...matches.map((m) => ({ won: didWinMatch(m), date: m.completed_at || m.started_at })),
      ...sessionGames.map((g) => ({ won: didWinMatch(g), date: g.completed_at })),
      ...allTournamentMatches.map((m) => {
        const onTeam1 = m.player_1_id === id || m.player_1_partner_id === id;
        const team1Won = m.winner_id === m.player_1_id;
        return { won: onTeam1 ? team1Won : !team1Won, date: m.completed_at || m.local_updated_at };
      }),
    ];
    allGames.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate streaks from combined games
    let currentStreak = 0;
    let streakType = 'none';
    let longestStreak = 0;
    let tempStreak = 0;

    for (const g of allGames) {
      if (currentStreak === 0) {
        streakType = g.won ? 'win' : 'loss';
      }
      if ((g.won && streakType === 'win') || (!g.won && streakType === 'loss')) {
        currentStreak++;
      } else if (currentStreak > 0) {
        break;
      }
    }

    // Longest win streak
    for (const g of [...allGames].reverse()) {
      if (g.won) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    setStats({ wins, losses, winPct: getWinPercentage(wins, losses), currentStreak, streakType, longestStreak });

    // Per-game-type stats
    const allGameTypes = await db.gameTypes.toArray();
    const gameTypeMap = new Map(allGameTypes.map(gt => [gt.id, gt]));
    const allSessions = await db.sessions.toArray();
    const sessionMap = new Map(allSessions.map(s => [s.id, s]));
    const allTournaments = await db.tournaments.toArray();
    const tournamentMap = new Map(allTournaments.map(t => [t.id, t]));

    const perType = new Map<string, { wins: number; losses: number; games: GameResult[] }>();

    for (const m of matches) {
      const gtId = m.game_type_id;
      const entry = perType.get(gtId) || { wins: 0, losses: 0, games: [] };
      const won = didWinMatch(m);
      if (won) entry.wins++; else entry.losses++;
      entry.games.push({ won, date: m.completed_at || m.started_at });
      perType.set(gtId, entry);
    }

    for (const g of sessionGames) {
      const session = sessionMap.get(g.session_id);
      const gtId = session?.game_type_id || 'unknown';
      const entry = perType.get(gtId) || { wins: 0, losses: 0, games: [] };
      const won = didWinMatch(g);
      if (won) entry.wins++; else entry.losses++;
      entry.games.push({ won, date: g.completed_at });
      perType.set(gtId, entry);
    }

    for (const tm of allTournamentMatches) {
      const tournament = tournamentMap.get(tm.tournament_id);
      const gtId = tournament?.game_type_id || 'unknown';
      const entry = perType.get(gtId) || { wins: 0, losses: 0, games: [] };
      const onTeam1 = tm.player_1_id === id || tm.player_1_partner_id === id;
      const team1Won = tm.winner_id === tm.player_1_id;
      const won = onTeam1 ? team1Won : !team1Won;
      if (won) entry.wins++; else entry.losses++;
      entry.games.push({ won, date: tm.completed_at || tm.local_updated_at });
      perType.set(gtId, entry);
    }

    const gtStats: GameTypeStatRecord[] = [];
    const perTypeEntries = Array.from(perType.entries());
    for (const [gtId, data] of perTypeEntries) {
      const gt = gameTypeMap.get(gtId);
      if (!gt) continue;
      // Calculate longest win streak for this game type
      data.games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let gtLongest = 0;
      let gtTemp = 0;
      for (const g of data.games) {
        if (g.won) { gtTemp++; gtLongest = Math.max(gtLongest, gtTemp); }
        else { gtTemp = 0; }
      }
      gtStats.push({
        gameType: gt,
        wins: data.wins,
        losses: data.losses,
        winPct: getWinPercentage(data.wins, data.losses),
        longestStreak: gtLongest,
      });
    }
    gtStats.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
    setGameTypeStats(gtStats);

    // Head to head — combine matches + session games (including doubles opponents)
    const opponentMap = new Map<string, { wins: number; losses: number }>();
    const addH2H = (oppId: string, won: boolean) => {
      if (!oppId || oppId === id) return;
      const existing = opponentMap.get(oppId) || { wins: 0, losses: 0 };
      if (won) existing.wins++; else existing.losses++;
      opponentMap.set(oppId, existing);
    };
    for (const m of matches) {
      const won = didWinMatch(m);
      const onTeam1 = m.player_1_id === id || m.player_1_partner_id === id;
      // Opponents are on the other team
      addH2H(onTeam1 ? m.player_2_id : m.player_1_id, won);
      if (m.player_1_partner_id || m.player_2_partner_id) {
        addH2H(onTeam1 ? (m.player_2_partner_id || '') : (m.player_1_partner_id || ''), won);
      }
    }
    for (const g of sessionGames) {
      const won = didWinMatch(g);
      const onTeam1 = g.player_1_id === id || g.player_1_partner_id === id;
      addH2H(onTeam1 ? g.player_2_id : g.player_1_id, won);
      if (g.player_1_partner_id || g.player_2_partner_id) {
        addH2H(onTeam1 ? (g.player_2_partner_id || '') : (g.player_1_partner_id || ''), won);
      }
    }
    for (const tm of allTournamentMatches) {
      const onTeam1 = tm.player_1_id === id || tm.player_1_partner_id === id;
      const team1Won = tm.winner_id === tm.player_1_id;
      const won = onTeam1 ? team1Won : !team1Won;
      addH2H(onTeam1 ? (tm.player_2_id || '') : (tm.player_1_id || ''), won);
      if (tm.player_1_partner_id || tm.player_2_partner_id) {
        addH2H(onTeam1 ? (tm.player_2_partner_id || '') : (tm.player_1_partner_id || ''), won);
      }
    }

    const h2hRecords: HeadToHeadRecord[] = [];
    const opponentEntries = Array.from(opponentMap.entries());
    for (const [oppId, record] of opponentEntries) {
      const opp = await db.profiles.get(oppId);
      if (opp) h2hRecords.push({ opponent: opp, ...record });
    }
    h2hRecords.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
    setH2h(h2hRecords);

    // Match history — combine 1v1 matches + session games
    type HistoryEntry = MatchHistoryItem;
    const combinedHistory: HistoryEntry[] = [];

    // Add matches (for doubles, find the primary opponent on the other team)
    for (const m of matches) {
      const onTeam1 = m.player_1_id === id || m.player_1_partner_id === id;
      const oppId = onTeam1 ? m.player_2_id : m.player_1_id;
      const [opponent, gameType] = await Promise.all([
        db.profiles.get(oppId),
        db.gameTypes.get(m.game_type_id),
      ]);
      combinedHistory.push({ ...m, opponent, gameType });
    }

    // Add session games as match-like history entries
    for (const g of sessionGames) {
      const onTeam1 = g.player_1_id === id || g.player_1_partner_id === id;
      const oppId = onTeam1 ? g.player_2_id : g.player_1_id;
      const session = sessionMap.get(g.session_id);
      const [opponent, gameType] = await Promise.all([
        db.profiles.get(oppId),
        session ? db.gameTypes.get(session.game_type_id) : Promise.resolve(undefined),
      ]);
      // Create a match-like object for display
      combinedHistory.push({
        id: g.id,
        game_type_id: session?.game_type_id || '',
        match_mode: (session as any)?.session_mode || 'singles',
        player_1_id: g.player_1_id,
        player_2_id: g.player_2_id,
        player_1_partner_id: g.player_1_partner_id || null,
        player_2_partner_id: g.player_2_partner_id || null,
        player_1_score: g.winner_id === g.player_1_id ? 1 : 0,
        player_2_score: g.winner_id === g.player_2_id ? 1 : 0,
        format: 'single' as const,
        format_target: 1,
        winner_id: g.winner_id,
        status: 'completed' as const,
        started_at: g.completed_at,
        completed_at: g.completed_at,
        venue_id: null,
        synced: g.synced,
        local_updated_at: g.completed_at,
        opponent,
        gameType,
      });
    }

    // Add tournament matches as match-like history entries
    for (const tm of allTournamentMatches) {
      const onTeam1 = tm.player_1_id === id || tm.player_1_partner_id === id;
      const oppId = onTeam1 ? tm.player_2_id : tm.player_1_id;
      const tournament = tournamentMap.get(tm.tournament_id);
      const [opponent, tGameType] = await Promise.all([
        oppId ? db.profiles.get(oppId) : Promise.resolve(undefined),
        tournament ? db.gameTypes.get(tournament.game_type_id) : Promise.resolve(undefined),
      ]);
      combinedHistory.push({
        id: tm.id,
        game_type_id: tournament?.game_type_id || '',
        match_mode: tournament?.match_mode || 'singles',
        player_1_id: tm.player_1_id || '',
        player_2_id: tm.player_2_id || '',
        player_1_partner_id: tm.player_1_partner_id || null,
        player_2_partner_id: tm.player_2_partner_id || null,
        player_1_score: tm.player_1_score,
        player_2_score: tm.player_2_score,
        format: tournament?.match_format || 'single',
        format_target: tournament?.match_format_target || 1,
        winner_id: tm.winner_id,
        status: 'completed' as const,
        started_at: tm.completed_at || tm.local_updated_at,
        completed_at: tm.completed_at,
        venue_id: tournament?.venue_id || null,
        synced: tm.synced,
        local_updated_at: tm.local_updated_at,
        opponent,
        gameType: tGameType,
      });
    }

    combinedHistory.sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
    setHistory(combinedHistory.slice(0, 30));
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEditName = async () => {
    if (!editName.trim() || !id) return;
    await db.profiles.update(id, { display_name: editName.trim() });
    setShowEditName(false);
    await loadData();
  };

  if (isLoading || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 pt-2">
      <div className="max-w-lg mx-auto px-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 mb-4 mt-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Player Header */}
        <Card className="text-center mb-4">
          <Avatar name={player.display_name} imageUrl={player.avatar_url} size="xl" className="mx-auto mb-3" />
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{player.display_name}</h1>
            <button
              onClick={() => { setEditName(player.display_name); setShowEditName(true); }}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 mt-1">
            {player.is_local && <Badge>Local</Badge>}
            {player.email && <Badge variant="info">{player.email}</Badge>}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{stats.wins}</div>
              <div className="text-[10px] text-gray-500">Wins</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{stats.losses}</div>
              <div className="text-[10px] text-gray-500">Losses</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{stats.winPct}%</div>
              <div className="text-[10px] text-gray-500">Win %</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white flex items-center justify-center gap-0.5">
                {stats.currentStreak}
                {stats.streakType === 'win' && <TrendingUp className="w-3 h-3 text-green-500" />}
                {stats.streakType === 'loss' && <TrendingDown className="w-3 h-3 text-red-500" />}
              </div>
              <div className="text-[10px] text-gray-500">Streak</div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {(['stats', 'h2h', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                tab === t
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {t === 'stats' ? 'Stats' : t === 'h2h' ? 'Head to Head' : 'History'}
            </button>
          ))}
        </div>

        {/* Stats Tab */}
        {tab === 'stats' && (
          <div className="space-y-3">
            {gameTypeStats.length === 0 ? (
              <Card><p className="text-sm text-center text-gray-500 py-4">No games played yet</p></Card>
            ) : (
              gameTypeStats.map((gt) => (
                <Card key={gt.gameType.id}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{gt.gameType.name}</h3>
                    <span className="text-xs text-gray-500">{gt.wins + gt.losses} games</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center mb-3">
                    <div>
                      <div className="text-base font-bold text-green-600">{gt.wins}</div>
                      <div className="text-[10px] text-gray-500">Wins</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-red-500">{gt.losses}</div>
                      <div className="text-[10px] text-gray-500">Losses</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-gray-900 dark:text-white">{gt.winPct}%</div>
                      <div className="text-[10px] text-gray-500">Win %</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-gray-900 dark:text-white">{gt.longestStreak}</div>
                      <div className="text-[10px] text-gray-500">Best Run</div>
                    </div>
                  </div>
                  {/* Win rate bar */}
                  <div className="flex gap-1 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-green-500 rounded-l-full transition-all"
                      style={{ width: `${gt.winPct}%` }}
                    />
                    <div
                      className="bg-red-400 rounded-r-full transition-all"
                      style={{ width: `${100 - gt.winPct}%` }}
                    />
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Head to Head Tab */}
        {tab === 'h2h' && (
          <div className="space-y-2">
            {h2h.length === 0 ? (
              <Card><p className="text-sm text-center text-gray-500 py-4">No opponents yet</p></Card>
            ) : (
              h2h.map((record) => (
                <Card key={record.opponent.id} padding="sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar name={record.opponent.display_name} imageUrl={record.opponent.avatar_url} size="sm" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{record.opponent.display_name}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-bold ${record.wins > record.losses ? 'text-green-500' : record.wins < record.losses ? 'text-red-500' : 'text-gray-500'}`}>
                        {record.wins} - {record.losses}
                      </span>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <div className="space-y-2">
            {history.length === 0 ? (
              <Card><p className="text-sm text-center text-gray-500 py-4">No game history</p></Card>
            ) : (
              history.map((m) => {
                const onTeam1 = m.player_1_id === id || m.player_1_partner_id === id;
                const team1Won = m.winner_id === m.player_1_id;
                const won = onTeam1 ? team1Won : !team1Won;
                const score = onTeam1
                  ? `${m.player_1_score} - ${m.player_2_score}`
                  : `${m.player_2_score} - ${m.player_1_score}`;
                return (
                  <Card key={m.id} padding="sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={won ? 'success' : 'danger'}>{won ? 'W' : 'L'}</Badge>
                        <div>
                          <span className="text-sm text-gray-900 dark:text-white">vs {m.opponent?.display_name}</span>
                          <div className="text-xs text-gray-500">{m.gameType?.name} &middot; {formatDateTime(m.completed_at || m.started_at)}</div>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{score}</span>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Edit Name Modal */}
        <Modal isOpen={showEditName} onClose={() => setShowEditName(false)} title="Edit Player Name">
          <div className="space-y-4">
            <Input
              label="Player Name"
              placeholder="Enter player name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEditName()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowEditName(false)}>Cancel</Button>
              <Button variant="primary" className="flex-1" onClick={handleEditName} disabled={!editName.trim()}>Save</Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}