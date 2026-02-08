'use client';

import Link from 'next/link';
import { Target, Users, UsersRound, Trophy } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';

export default function PlayPage() {
  return (
    <PageWrapper title="Play" subtitle="Choose your game mode">
      <div className="space-y-4 mt-2">
        <Link href="/match/new">
          <Card padding="md" className="hover:border-green-500 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Target className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">1v1 Match</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Two players, set format (race to, best of, or single game)
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/match/new?mode=doubles">
          <Card padding="md" className="hover:border-green-500 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <UsersRound className="w-7 h-7 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Doubles</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  2v2 teams — straight doubles or scotch doubles
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/session/new">
          <Card padding="md" className="hover:border-green-500 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                <Users className="w-7 h-7 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Open Table</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Group session — winner stays, track tallies for everyone
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/tournament/new">
          <Card padding="md" className="hover:border-green-500 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-7 h-7 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Tournament</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Bracket tournament — single or double elimination
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </PageWrapper>
  );
}