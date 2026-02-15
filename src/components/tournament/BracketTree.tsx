'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Trophy } from 'lucide-react';
import BracketMatchCard from './BracketMatchCard';
import type { LocalTournamentMatch, LocalProfile, BracketType } from '@/lib/db/dexie';
import { getRoundLabel, getWinnersRoundCount } from '@/lib/tournaments/tournament-helpers';
import {
  groupMatchesByRound,
  computeLayout,
  getConnectors,
  getBracketHeight,
  MATCH_HEIGHT,
  MATCH_WIDTH,
  ROUND_GAP,
  BYE_HEIGHT,
} from '@/lib/tournaments/bracket-layout';

interface BracketTreeProps {
  matches: LocalTournamentMatch[];
  bracketType: BracketType;
  totalParticipants: number;
  profiles: Map<string, LocalProfile>;
  isDoubles: boolean;
  onPlayMatch: (matchId: string) => void;
}

export default function BracketTree({
  matches,
  bracketType,
  totalParticipants,
  profiles,
  isDoubles,
  onPlayMatch,
}: BracketTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const winnersRoundCount = getWinnersRoundCount(totalParticipants);

  // Filter to this bracket type
  const bracketMatches = useMemo(
    () => matches.filter(m => m.bracket_type === bracketType),
    [matches, bracketType],
  );

  const roundMap = useMemo(
    () => groupMatchesByRound(matches, bracketType),
    [matches, bracketType],
  );

  const layout = useMemo(
    () => computeLayout(roundMap, bracketMatches),
    [roundMap, bracketMatches],
  );

  const bracketHeight = useMemo(() => getBracketHeight(layout), [layout]);
  const rounds = useMemo(() => Array.from(roundMap.entries()), [roundMap]);

  // Auto-scroll to first round with ready matches
  useEffect(() => {
    if (!scrollRef.current || rounds.length === 0) return;

    const readyRoundIdx = rounds.findIndex(([, rMatches]) =>
      rMatches.some(m => m.status === 'ready' || m.status === 'in_progress'),
    );

    if (readyRoundIdx > 0) {
      const scrollX = readyRoundIdx * (MATCH_WIDTH + ROUND_GAP);
      scrollRef.current.scrollTo({ left: scrollX - 16, behavior: 'smooth' });
    }
  }, [rounds]);

  // Grand final: special centered layout
  if (bracketType === 'grand_final') {
    const grandFinalMatch = matches.find(m => m.bracket_type === 'grand_final');
    if (!grandFinalMatch) {
      return (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Grand final not yet available
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Grand Final
          </h2>
          <Trophy className="w-5 h-5 text-yellow-500" />
        </div>
        <BracketMatchCard
          match={grandFinalMatch}
          profiles={profiles}
          isDoubles={isDoubles}
          onPlay={onPlayMatch}
        />
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No matches in this bracket
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto no-scrollbar pb-4"
    >
      <div
        className="inline-flex px-4 pt-2"
        style={{
          gap: ROUND_GAP,
          minHeight: bracketHeight + 40,
        }}
      >
        {rounds.map(([roundNum, roundMatches], roundIdx) => {
          const label = getRoundLabel(roundNum, winnersRoundCount, bracketType);
          const connectors = roundIdx < rounds.length - 1
            ? getConnectors(roundMatches, layout)
            : [];
          const isLastRound = roundIdx === rounds.length - 1;

          return (
            <div
              key={roundNum}
              className="relative shrink-0"
              style={{ width: MATCH_WIDTH }}
            >
              {/* Round header */}
              <div className="mb-3">
                <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
                  {label}
                </h3>
              </div>

              {/* Match cards */}
              <div
                className="relative"
                style={{ height: bracketHeight }}
              >
                {roundMatches.map((match) => {
                  const pos = layout.get(match.id);
                  const top = pos?.top ?? 0;
                  const isBye = match.is_bye;
                  const byeOffset = isBye ? (MATCH_HEIGHT - BYE_HEIGHT) / 2 : 0;

                  return (
                    <div
                      key={match.id}
                      className="absolute left-0"
                      style={{ top: top + byeOffset }}
                    >
                      <BracketMatchCard
                        match={match}
                        profiles={profiles}
                        isDoubles={isDoubles}
                        onPlay={onPlayMatch}
                      />
                    </div>
                  );
                })}

                {/* Connector lines to next round */}
                {!isLastRound && connectors.map((conn, i) => (
                  <div key={`conn-${i}`}>
                    {/* Horizontal stub from top match */}
                    <div
                      className="absolute bracket-hline"
                      style={{
                        left: MATCH_WIDTH,
                        top: conn.top,
                        width: ROUND_GAP / 2,
                        height: 0,
                      }}
                    />
                    {/* Horizontal stub from bottom match */}
                    <div
                      className="absolute bracket-hline"
                      style={{
                        left: MATCH_WIDTH,
                        top: conn.bottom,
                        width: ROUND_GAP / 2,
                        height: 0,
                      }}
                    />
                    {/* Vertical connector */}
                    <div
                      className="absolute bracket-vline"
                      style={{
                        left: MATCH_WIDTH + ROUND_GAP / 2,
                        top: conn.top,
                        width: 0,
                        height: conn.bottom - conn.top,
                      }}
                    />
                    {/* Horizontal bridge to next round */}
                    <div
                      className="absolute bracket-hline"
                      style={{
                        left: MATCH_WIDTH + ROUND_GAP / 2,
                        top: conn.midY,
                        width: ROUND_GAP / 2,
                        height: 0,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
