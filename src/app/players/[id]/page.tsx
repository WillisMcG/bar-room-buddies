'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { db } from '@/lib/db/dexie';
import { getWinPercentage, getStreakText, formatDateTime, matchFormatLabel } from '@/lib/utils';
import type { LocalProfile, LocalMatch, LocalGameType } from '@/lib/db/dexie';

interface HeadToHeadRecord {
  opponent: LocalProfile;
  wins: number;
  losses: number;
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
  const [h2h, setH2h] = useState<HeadToHeadRecord[]>([]);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [tab, setTab] = useState<'stats' | 'h2h' | 'history'>('stats');
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    const p = await db.profiles.get(id);
    if (!p) return;
    setPlayer(p);

    // Get completed matches
    const matches = await db.matches
      .where('status')
      .equals('completed')
      .filter((m) => m.player_1_id === id || m.player_2_id === id)
      .toArray();

    matches.sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

    const wins = matches.filter((m) => m.winner_id === id).length;
    const losses = matches.length - wins;

    // Calculate streaks
    let currentStreak = 0;
    let streakType = 'none';
    let longestStreak = 0;
    let tempStreak = 0;

    for (const m of matches) {
      if (currentStreak === 0) {
        streakType = m.winner_id === id ? 'win' : 'loss';
      }
      if ((m.winner_id === id && streakType === 'win') || (m.winner_id !== id && streakType === 'loss')) {
        currentStreak++;
      } else if (currentStreak > 0) {
        break;
      }
    }

    // Longest win streak
    for (const m of [...matches].reverse()) {
      if (m.winner_id === id) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    setStats({ wins, losses, winPct: getWinPercentage(wins, losses), currentStreak, streakType, longestStreak });

    // Head to head
    const opponentMap = new Map<string, { wins: number; losses: number }>();
    for (const m of matches) {
      const oppId = m.player_1_id === id ? m.player_2_id : m.player_1_id;
      const existing = opponentMap.get(oppId) || { wins: 0, losses: 0 };
      if (m.winner_id === id) existing.wins++;
      else existing.losses++;
      opponentMap.set(oppId, existing);
    }

    const h2hRecords: HeadToHeadRecord[] = [];
    const opponentEntries = Array.from(opponentMap.entries());
    for (const [oppId, record] of opponentEntries) {
      const opp = await db.profiles.get(oppId);
      if (opp) h2hRecords.push({ opponent: opp, ...record });
    }
    h2hRecords.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
    setH2h(h2hRecords);

    // Match history
    const historyItems = await Promise.all(
      matches.slice(0, 20).map(async (m) => {
        const oppId = m.player_1_id === id ? m.player_2_id : m.player_1_id;
        const [opponent, gameType] = await Promise.all([
          db.profiles.get(oppId),
          db.gameTypes.get(m.game_type_id),
        ]);
        return { ...m, opponent, gameType };
      })
    );
    setHistory(historyItems);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{player.display_name}</h1>
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
          <Card>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">Total Matches</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{stats.wins + stats.losses}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">Win Rate</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{stats.winPct}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">Current Streak</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {getStreakText(stats.currentStreak, stats.streakType as any)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">Longest Win Streak</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{stats.longestStreak}</span>
              </div>

              {/* Win rate bar */}
              {stats.wins + stats.losses > 0 && (
                <div className="pt-2">
                  <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-green-500 rounded-l-full transition-all"
                      style={{ width: `${stats.winPct}%` }}
                    />
                    <div
                      className="bg-red-400 rounded-r-full transition-all"
                      style={{ width: `${100 - stats.winPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-green-600">{stats.wins}W</span>
                    <span className="text-[10px] text-red-500">{stats.losses}L</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
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
              <Card><p className="text-sm text-center text-gray-500 py-4">No match history</p></Card>
            ) : (
              history.map((m) => {
                const won = m.winner_id === id;
                const score = m.player_1_id === id
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
      </div>
    </div>
  );
}
