'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Target, Users, Trophy, Clock, ChevronRight, Plus } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { db } from '@/lib/db/dexie';
import { seedSystemGameTypes } from '@/lib/db/dexie';
import { formatDateTime, matchFormatLabel } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import type { LocalMatch, LocalProfile, LocalGameType, LocalSession } from '@/lib/db/dexie';

interface RecentMatch extends LocalMatch {
  player1?: LocalProfile;
  player2?: LocalProfile;
  gameType?: LocalGameType;
}

export default function HomePage() {
  const { venueId } = useAuth();
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [activeSessions, setActiveSessions] = useState<(LocalSession & { gameType?: LocalGameType; playerNames: string[] })[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      await seedSystemGameTypes();

      const allMatches = await db.matches
        .orderBy('started_at')
        .reverse()
        .toArray();
      const filteredMatches = venueId ? allMatches.filter(m => m.venue_id === venueId || !m.venue_id) : allMatches;
      const matches = filteredMatches.slice(0, 5);

      const enriched = await Promise.all(
        matches.map(async (m) => {
          const [player1, player2, gameType] = await Promise.all([
            db.profiles.get(m.player_1_id),
            db.profiles.get(m.player_2_id),
            db.gameTypes.get(m.game_type_id),
          ]);
          return { ...m, player1, player2, gameType };
        })
      );

      setRecentMatches(enriched);

      // Load active sessions
      const allSessions = await db.sessions.where('status').equals('active').toArray();
      const sessions = venueId ? allSessions.filter(s => s.venue_id === venueId || !s.venue_id) : allSessions;
      const enrichedSessions = await Promise.all(
        sessions.map(async (s) => {
          const gt = await db.gameTypes.get(s.game_type_id);
          const names: string[] = [];
          for (const pid of s.participant_ids) {
            const p = await db.profiles.get(pid);
            if (p) names.push(p.display_name);
          }
          return { ...s, gameType: gt, playerNames: names };
        })
      );
      setActiveSessions(enrichedSessions);

      // Get player count filtered by venue
      const allProfiles = await db.profiles.toArray();
      const venueProfiles = venueId ? allProfiles.filter(p => p.venue_id === venueId || !p.venue_id) : allProfiles;
      setPlayerCount(venueProfiles.length);

      // Get match count filtered by venue
      const allCompletedMatches = await db.matches.where('status').equals('completed').toArray();
      const venueMatches = venueId ? allCompletedMatches.filter(m => m.venue_id === venueId || !m.venue_id) : allCompletedMatches;
      setMatchCount(venueMatches.length);

      setIsLoading(false);
    };

    loadData();
  }, [venueId]);

  return (
    <PageWrapper>
      {/* Hero / Quick Start */}
      <div className="mb-6">
        <div className="text-center py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            Bar Room Buddies
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pool scorekeeping &amp; stats
          </p>
        </div>
        <Link href="/play">
          <Button variant="accent" size="xl" className="w-full rounded-xl">
            <Target className="w-5 h-5 mr-2" />
            Play
          </Button>
        </Link>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-3">
            Active Sessions
          </h2>
          <div className="space-y-2">
            {activeSessions.map((s) => (
              <Link key={s.id} href={`/session/${s.id}`}>
                <Card padding="sm" className="hover:border-orange-500/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {s.gameType?.name || 'Session'}
                        </span>
                        <Badge variant="warning">Live</Badge>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {s.playerNames.join(', ')}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card padding="sm" className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{playerCount}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Players</div>
        </Card>
        <Card padding="sm" className="text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{matchCount}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Matches</div>
        </Card>
        <Link href="/leaderboard">
          <Card padding="sm" className="text-center hover:border-green-500 transition-colors cursor-pointer h-full flex flex-col justify-center">
            <Trophy className="w-5 h-5 mx-auto text-yellow-500 mb-1" />
            <div className="text-xs text-gray-500 dark:text-gray-400">Leaderboard</div>
          </Card>
        </Link>
      </div>

      {/* Recent Matches */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
            Recent Matches
          </h2>
          {recentMatches.length > 0 && (
            <Link href="/matches" className="text-xs text-green-600 dark:text-green-400 hover:underline">
              View All
            </Link>
          )}
        </div>

        {isLoading ? (
          <Card>
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </Card>
        ) : recentMatches.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Clock className="w-10 h-10" />}
              title="No matches yet"
              description="Start your first match to begin tracking stats!"
              action={
                <Link href="/match/new">
                  <Button variant="primary" size="sm">
                    <Plus className="w-4 h-4 mr-1" /> New Match
                  </Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {recentMatches.map((match) => (
              <Link key={match.id} href={`/match/${match.id}`}>
                <Card padding="sm" className="hover:border-green-500/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex -space-x-2 flex-shrink-0">
                        <Avatar name={match.player1?.display_name || 'P1'} imageUrl={match.player1?.avatar_url} size="sm" />
                        <Avatar name={match.player2?.display_name || 'P2'} imageUrl={match.player2?.avatar_url} size="sm" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {match.player1?.display_name || 'Player 1'} vs {match.player2?.display_name || 'Player 2'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {match.gameType?.name} &middot; {matchFormatLabel(match.format, match.format_target)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {match.status === 'completed' ? (
                        <div className="text-right">
                          <div className="text-sm font-bold text-gray-900 dark:text-white">
                            {match.player_1_score} - {match.player_2_score}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {formatDateTime(match.started_at)}
                          </div>
                        </div>
                      ) : (
                        <Badge variant="warning">Live</Badge>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/players">
          <Card padding="sm" className="hover:border-green-500/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Players</span>
            </div>
          </Card>
        </Link>
        <Link href="/game-types">
          <Card padding="sm" className="hover:border-green-500/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Game Types</span>
            </div>
          </Card>
        </Link>
      </div>
    </PageWrapper>
  );
}