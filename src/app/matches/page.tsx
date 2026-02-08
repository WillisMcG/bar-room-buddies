'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Clock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { db } from '@/lib/db/dexie';
import { formatDateTime, matchFormatLabel } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import type { LocalMatch, LocalProfile, LocalGameType } from '@/lib/db/dexie';

interface EnrichedMatch extends LocalMatch {
  player1?: LocalProfile;
  player2?: LocalProfile;
  gameType?: LocalGameType;
}

export default function MatchesPage() {
  const { venueId } = useAuth();
  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMatches = async () => {
      const allMatches = await db.matches
        .orderBy('started_at')
        .reverse()
        .toArray();
      const filtered = venueId
        ? allMatches.filter((m) => m.venue_id === venueId || !m.venue_id)
        : allMatches;

      const enriched = await Promise.all(
        filtered.map(async (m) => {
          const [player1, player2, gameType] = await Promise.all([
            db.profiles.get(m.player_1_id),
            db.profiles.get(m.player_2_id),
            db.gameTypes.get(m.game_type_id),
          ]);
          return { ...m, player1, player2, gameType };
        })
      );

      setMatches(enriched);
      setIsLoading(false);
    };

    loadMatches();
  }, [venueId]);

  return (
    <div className="min-h-screen pb-20 pt-2">
      <div className="max-w-lg mx-auto px-4">
        <div className="flex items-center gap-2 mb-4 mt-2">
          <button onClick={() => window.history.back()} className="p-1">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">All Matches</h1>
          <span className="text-sm text-gray-400 ml-auto">{matches.length} total</span>
        </div>

        {isLoading ? (
          <Card>
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </Card>
        ) : matches.length === 0 ? (
          <Card className="text-center py-8">
            <Clock className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 dark:text-gray-400">No matches yet</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {matches.map((match) => (
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
                      ) : match.status === 'in_progress' ? (
                        <Badge variant="warning">Live</Badge>
                      ) : (
                        <Badge variant="default">Abandoned</Badge>
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
    </div>
  );
}
