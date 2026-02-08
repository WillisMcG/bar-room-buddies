'use client';

import { useEffect, useState } from 'react';
import { Trophy, Filter } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import { useTheme } from '@/contexts/ThemeContext';
import { db } from '@/lib/db/dexie';
import { getWinPercentage } from '@/lib/utils';
import type { LocalProfile, LocalGameType } from '@/lib/db/dexie';

interface LeaderboardEntry {
  profile: LocalProfile;
  wins: number;
  losses: number;
  winPct: number;
  totalMatches: number;
}

type TimePeriod = 'all' | '30' | '90';

export default function LeaderboardPage() {
  const { venue } = useTheme();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [gameTypes, setGameTypes] = useState<LocalGameType[]>([]);
  const [selectedGameType, setSelectedGameType] = useState<string>('all');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadGameTypes = async () => {
      const types = await db.gameTypes.toArray();
      setGameTypes(types);
    };
    loadGameTypes();
  }, []);

  useEffect(() => {
    const loadLeaderboard = async () => {
      setIsLoading(true);
      const profiles = (await db.profiles.toArray()).filter((p) => !p.merged_into);

      const cutoff = timePeriod !== 'all'
        ? new Date(Date.now() - parseInt(timePeriod) * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const results: LeaderboardEntry[] = [];

      for (const p of profiles) {
        let matches = await db.matches
          .where('status')
          .equals('completed')
          .filter((m) => m.player_1_id === p.id || m.player_2_id === p.id)
          .toArray();

        if (selectedGameType !== 'all') {
          matches = matches.filter((m) => m.game_type_id === selectedGameType);
        }

        if (cutoff) {
          matches = matches.filter((m) => (m.completed_at || '') >= cutoff);
        }

        if (matches.length < 3) continue;

        const wins = matches.filter((m) => m.winner_id === p.id).length;
        const losses = matches.length - wins;

        results.push({
          profile: p,
          wins,
          losses,
          winPct: getWinPercentage(wins, losses),
          totalMatches: matches.length,
        });
      }

      results.sort((a, b) => b.winPct - a.winPct || b.totalMatches - a.totalMatches);
      setEntries(results);
      setIsLoading(false);
    };

    loadLeaderboard();
  }, [selectedGameType, timePeriod]);

  const getRankStyle = (rank: number) => {
    if (rank === 0) return 'text-yellow-500';
    if (rank === 1) return 'text-gray-400';
    if (rank === 2) return 'text-orange-600';
    return 'text-gray-500 dark:text-gray-400';
  };

  const getRankIcon = (rank: number) => {
    if (rank < 3) return <Trophy className={`w-5 h-5 ${getRankStyle(rank)}`} />;
    return <span className={`text-sm font-bold ${getRankStyle(rank)}`}>{rank + 1}</span>;
  };

  return (
    <PageWrapper title={venue.name ? `${venue.name} Rankings` : 'Leaderboard'} subtitle="Minimum 3 matches to qualify">
      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        <select
          value={selectedGameType}
          onChange={(e) => setSelectedGameType(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
        >
          <option value="all">All Games</option>
          {gameTypes.map((gt) => (
            <option key={gt.id} value={gt.id}>{gt.name}</option>
          ))}
        </select>

        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {([['all', 'All Time'], ['30', '30 Days'], ['90', '90 Days']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTimePeriod(val as TimePeriod)}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${
                timePeriod === val
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} padding="sm">
              <div className="animate-pulse flex items-center gap-3">
                <div className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </Card>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="w-10 h-10" />}
            title="No rankings yet"
            description="Players need at least 3 completed matches to appear on the leaderboard."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => (
            <Card key={entry.profile.id} padding="sm" className={idx === 0 ? 'border-yellow-500/50' : ''}>
              <div className="flex items-center gap-3">
                <div className="w-7 flex items-center justify-center">
                  {getRankIcon(idx)}
                </div>
                <Avatar name={entry.profile.display_name} imageUrl={entry.profile.avatar_url} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {entry.profile.display_name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {entry.wins}W - {entry.losses}L &middot; {entry.totalMatches} matches
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{entry.winPct}%</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
