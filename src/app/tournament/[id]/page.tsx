'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Trophy, Crown, ChevronLeft, ChevronRight } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import BracketMatch from '@/components/tournament/BracketMatch';
import { db } from '@/lib/db/dexie';
import type {
  LocalTournament,
  LocalTournamentMatch,
  LocalTournamentParticipant,
  LocalProfile,
  LocalGameType,
  BracketType,
} from '@/lib/db/dexie';
import {
  getTournamentProgress,
  getRoundLabel,
  getWinnersRoundCount,
  getFinalStandings,
} from '@/lib/tournaments/tournament-helpers';
import type { TournamentStanding } from '@/lib/tournaments/tournament-helpers';
import { formatDuration } from '@/lib/utils';

export default function TournamentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [tournament, setTournament] = useState<LocalTournament | null>(null);
  const [matches, setMatches] = useState<LocalTournamentMatch[]>([]);
  const [participants, setParticipants] = useState<LocalTournamentParticipant[]>([]);
  const [profiles, setProfiles] = useState<Map<string, LocalProfile>>(new Map());
  const [gameType, setGameType] = useState<LocalGameType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // View state
  const [selectedBracket, setSelectedBracket] = useState<BracketType>('winners');
  const [selectedRound, setSelectedRound] = useState(1);

  const loadData = useCallback(async () => {
    if (!params.id) return;

    const t = await db.tournaments.get(params.id);
    if (!t) {
      router.push('/play');
      return;
    }
    setTournament(t);

    const gt = await db.gameTypes.get(t.game_type_id);
    setGameType(gt || null);

    const m = await db.tournamentMatches
      .where('tournament_id').equals(params.id)
      .toArray();
    m.sort((a, b) => a.match_number - b.match_number);
    setMatches(m);

    const p = await db.tournamentParticipants
      .where('tournament_id').equals(params.id)
      .toArray();
    setParticipants(p);

    // Load profiles
    const allProfiles = await db.profiles.toArray();
    const profileMap = new Map<string, LocalProfile>();
    allProfiles.forEach(pr => profileMap.set(pr.id, pr));
    setProfiles(profileMap);

    setIsLoading(false);
  }, [params.id, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived data
  const isDoubleElim = tournament?.format === 'double_elimination';
  const isDoubles = tournament?.match_mode === 'doubles' || tournament?.match_mode === 'scotch_doubles';
  const isCompleted = tournament?.status === 'completed';

  const progress = useMemo(() => getTournamentProgress(matches), [matches]);

  const winnersRoundCount = useMemo(
    () => tournament ? getWinnersRoundCount(tournament.total_participants) : 0,
    [tournament],
  );

  const standings = useMemo(
    () => getFinalStandings(participants, matches),
    [participants, matches],
  );

  // Get rounds for current bracket view
  const bracketRounds = useMemo(() => {
    const bracketMatches = matches.filter(m => m.bracket_type === selectedBracket);
    const rounds = new Set(bracketMatches.map(m => m.round_number));
    return Array.from(rounds).sort((a, b) => a - b);
  }, [matches, selectedBracket]);

  const currentRoundMatches = useMemo(() => {
    return matches
      .filter(m => m.bracket_type === selectedBracket && m.round_number === selectedRound)
      .sort((a, b) => a.match_order_in_round - b.match_order_in_round);
  }, [matches, selectedBracket, selectedRound]);

  // Find the first round with playable matches
  useEffect(() => {
    if (bracketRounds.length > 0 && matches.length > 0) {
      const roundWithReady = bracketRounds.find(r =>
        matches.some(m =>
          m.bracket_type === selectedBracket &&
          m.round_number === r &&
          (m.status === 'ready' || m.status === 'in_progress')
        )
      );
      if (roundWithReady) {
        setSelectedRound(roundWithReady);
      } else {
        setSelectedRound(bracketRounds[bracketRounds.length - 1] || 1);
      }
    }
  }, [bracketRounds, matches, selectedBracket]);

  const handlePlayMatch = (matchId: string) => {
    router.push(`/tournament/${params.id}/match/${matchId}`);
  };

  const handleEndTournament = async () => {
    if (!tournament) return;
    const now = new Date().toISOString();
    await db.tournaments.update(tournament.id, {
      status: 'completed',
      completed_at: now,
      local_updated_at: now,
    });
    loadData();
  };

  if (isLoading || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  // ===== COMPLETED TOURNAMENT =====
  if (isCompleted) {
    const winner = tournament.winner_id ? profiles.get(tournament.winner_id) : null;
    const winnerParticipant = participants.find(p => p.player_id === tournament.winner_id);
    const winnerPartner = winnerParticipant?.partner_id ? profiles.get(winnerParticipant.partner_id) : null;

    return (
      <PageWrapper
        title={tournament.name}
        subtitle="Tournament Complete"
        action={
          <button onClick={() => router.push('/play')} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        }
      >
        <div className="space-y-4 mt-4">
          {/* Winner Card */}
          <Card padding="lg" className="text-center">
            <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Champion</h2>
            <div className="flex items-center justify-center gap-2 mb-2">
              {winner && <Avatar name={winner.display_name} size="lg" />}
              {winnerPartner && <Avatar name={winnerPartner.display_name} size="lg" />}
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {winner?.display_name}{winnerPartner ? ` & ${winnerPartner.display_name}` : ''}
            </p>
            {tournament.started_at && tournament.completed_at && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Duration: {formatDuration(tournament.started_at, tournament.completed_at)}
              </p>
            )}
          </Card>

          {/* Final Standings */}
          <Card padding="md">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Final Standings</h3>
            <div className="space-y-2">
              {standings.map(s => {
                const player = profiles.get(s.playerId);
                const partner = s.partnerId ? profiles.get(s.partnerId) : null;
                return (
                  <div key={s.playerId} className={`flex items-center gap-2 p-2 rounded-lg ${
                    s.placement === 1 ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                    s.placement === 2 ? 'bg-gray-100 dark:bg-gray-800' : ''
                  }`}>
                    <span className="text-sm font-bold text-gray-400 w-6 text-right">
                      {s.placement === 1 ? '🥇' : s.placement === 2 ? '🥈' : s.placement === 3 ? '🥉' : `#${s.placement}`}
                    </span>
                    <Avatar name={player?.display_name || '?'} size="xs" />
                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                      {player?.display_name}{partner ? ` & ${partner.display_name}` : ''}
                    </span>
                    <span className="text-xs text-gray-500">
                      Seed #{s.seed}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push('/')} className="flex-1">
              Home
            </Button>
            <Button onClick={() => router.push('/tournament/new')} className="flex-1">
              New Tournament
            </Button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  // ===== IN-PROGRESS TOURNAMENT =====
  return (
    <PageWrapper
      title={tournament.name}
      subtitle={`${gameType?.name || ''} • ${tournament.format === 'single_elimination' ? 'Single' : 'Double'} Elim`}
      action={
        <button onClick={() => router.push('/play')} className="p-2 -ml-2">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
      }
    >
      <div className="space-y-4 mt-2">
        {/* Progress bar */}
        <Card padding="sm">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">
              {progress.completedMatches}/{progress.totalPlayableMatches} matches played
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              {Math.round((progress.completedMatches / Math.max(progress.totalPlayableMatches, 1)) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${(progress.completedMatches / Math.max(progress.totalPlayableMatches, 1)) * 100}%` }}
            />
          </div>
        </Card>

        {/* Bracket type tabs (double elim only) */}
        {isDoubleElim && (
          <div className="flex gap-1">
            {(['winners', 'losers', 'grand_final'] as BracketType[]).map(bt => {
              const label = bt === 'winners' ? 'Winners' : bt === 'losers' ? 'Losers' : 'Final';
              const count = matches.filter(m => m.bracket_type === bt && !m.is_bye).length;
              return (
                <button
                  key={bt}
                  onClick={() => {
                    setSelectedBracket(bt);
                    setSelectedRound(1);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    selectedBracket === bt
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Round navigation */}
        {bracketRounds.length > 0 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const idx = bracketRounds.indexOf(selectedRound);
                if (idx > 0) setSelectedRound(bracketRounds[idx - 1]);
              }}
              disabled={bracketRounds.indexOf(selectedRound) <= 0}
              className="p-1 disabled:opacity-30"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="flex gap-1 overflow-x-auto px-2">
              {bracketRounds.map(r => {
                const label = getRoundLabel(r, winnersRoundCount, selectedBracket);
                const hasReady = matches.some(
                  m => m.bracket_type === selectedBracket && m.round_number === r && m.status === 'ready',
                );
                return (
                  <button
                    key={r}
                    onClick={() => setSelectedRound(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      selectedRound === r
                        ? 'bg-green-500 text-white'
                        : hasReady
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                const idx = bracketRounds.indexOf(selectedRound);
                if (idx < bracketRounds.length - 1) setSelectedRound(bracketRounds[idx + 1]);
              }}
              disabled={bracketRounds.indexOf(selectedRound) >= bracketRounds.length - 1}
              className="p-1 disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        )}

        {/* Match cards for selected round */}
        <div className="space-y-2">
          {currentRoundMatches.length === 0 ? (
            <Card padding="md" className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">No matches in this round</p>
            </Card>
          ) : (
            currentRoundMatches.map(match => (
              <BracketMatch
                key={match.id}
                match={match}
                profiles={profiles}
                isDoubles={!!isDoubles}
                onPlay={handlePlayMatch}
              />
            ))
          )}
        </div>

        {/* Standings */}
        <Card padding="md">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Standings</h3>
          <div className="space-y-1">
            {standings.map(s => {
              const player = profiles.get(s.playerId);
              const partner = s.partnerId ? profiles.get(s.partnerId) : null;
              return (
                <div key={s.playerId} className={`flex items-center gap-2 py-1 ${
                  !s.isActive ? 'opacity-50' : ''
                }`}>
                  <span className="text-xs text-gray-400 w-4 text-right">#{s.seed}</span>
                  <Avatar name={player?.display_name || '?'} size="xs" />
                  <span className="text-xs text-gray-900 dark:text-white truncate flex-1">
                    {player?.display_name}{partner ? ` & ${partner.display_name}` : ''}
                  </span>
                  {!s.isActive && (
                    <span className="text-[10px] text-red-500 font-medium">OUT R{s.eliminatedRound}</span>
                  )}
                  {s.isActive && (
                    <span className="text-[10px] text-green-500 font-medium">ACTIVE</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* End Tournament */}
        <Button
          variant="secondary"
          onClick={handleEndTournament}
          className="w-full"
        >
          End Tournament
        </Button>
      </div>
    </PageWrapper>
  );
}