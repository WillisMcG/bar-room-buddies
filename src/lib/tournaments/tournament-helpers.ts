import { db } from '@/lib/db/dexie';
import type {
  LocalTournament,
  LocalTournamentMatch,
  LocalTournamentParticipant,
  LocalTournamentGame,
  BracketType,
} from '@/lib/db/dexie';

// ---------- Advancement ----------

/**
 * After a match completes, advance the winner to the next bracket slot
 * and (for double elim) drop the loser to the losers bracket.
 */
export async function advanceWinner(
  match: LocalTournamentMatch,
  winnerId: string,
  winnerPartnerId: string | null,
  tournament: LocalTournament,
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Mark this match as completed
  await db.tournamentMatches.update(match.id, {
    winner_id: winnerId,
    status: 'completed',
    completed_at: now,
    local_updated_at: now,
  });

  // 2. Advance winner to next match
  if (match.next_winner_match_id) {
    const nextMatch = await db.tournamentMatches.get(match.next_winner_match_id);
    if (nextMatch) {
      const winnerSeed = match.player_1_id === winnerId ? match.player_1_seed : match.player_2_seed;
      const update: Partial<LocalTournamentMatch> = {
        local_updated_at: now,
      };

      if (match.next_winner_slot === 'player_1') {
        update.player_1_id = winnerId;
        update.player_1_partner_id = winnerPartnerId;
        update.player_1_seed = winnerSeed;
      } else {
        update.player_2_id = winnerId;
        update.player_2_partner_id = winnerPartnerId;
        update.player_2_seed = winnerSeed;
      }

      // Check if next match now has both players → ready
      const updated = { ...nextMatch, ...update };
      if (updated.player_1_id && updated.player_2_id) {
        update.status = 'ready';
      }

      await db.tournamentMatches.update(nextMatch.id, update);
    }
  }

  // 3. For double elimination: drop loser to losers bracket
  if (tournament.format === 'double_elimination' && match.next_loser_match_id) {
    const loserId = match.player_1_id === winnerId ? match.player_2_id : match.player_1_id;
    const loserPartnerId = match.player_1_id === winnerId ? match.player_2_partner_id : match.player_1_partner_id;
    const loserSeed = match.player_1_id === winnerId ? match.player_2_seed : match.player_1_seed;

    if (loserId) {
      const loserMatch = await db.tournamentMatches.get(match.next_loser_match_id);
      if (loserMatch) {
        const update: Partial<LocalTournamentMatch> = {
          local_updated_at: now,
        };

        if (match.next_loser_slot === 'player_1') {
          update.player_1_id = loserId;
          update.player_1_partner_id = loserPartnerId;
          update.player_1_seed = loserSeed;
        } else {
          update.player_2_id = loserId;
          update.player_2_partner_id = loserPartnerId;
          update.player_2_seed = loserSeed;
        }

        const updated = { ...loserMatch, ...update };
        if (updated.player_1_id && updated.player_2_id) {
          update.status = 'ready';
        }

        await db.tournamentMatches.update(loserMatch.id, update);
      }
    }
  }

  // 4. For single elimination or losers bracket: eliminate the loser
  if (match.bracket_type !== 'winners' || tournament.format === 'single_elimination') {
    const loserId = match.player_1_id === winnerId ? match.player_2_id : match.player_1_id;
    if (loserId) {
      const participant = await db.tournamentParticipants
        .where('tournament_id').equals(tournament.id)
        .filter(p => p.player_id === loserId)
        .first();
      if (participant) {
        await db.tournamentParticipants.update(participant.id, {
          status: 'eliminated',
          eliminated_round: match.round_number,
        });
      }
    }
  }

  // 5. Auto-advance bye matches in next round if they became ready
  if (match.next_winner_match_id) {
    await processAutoAdvanceByes(match.next_winner_match_id, tournament);
  }

  // 6. Check if tournament is complete
  await checkTournamentCompletion(tournament);
}

/**
 * If a match has only one player (other is null/bye), auto-advance.
 */
async function processAutoAdvanceByes(
  matchId: string,
  tournament: LocalTournament,
): Promise<void> {
  const match = await db.tournamentMatches.get(matchId);
  if (!match || match.status === 'completed') return;

  // Only auto-advance if exactly one player is set and it's a bye scenario
  if (match.is_bye && match.player_1_id && !match.player_2_id) {
    await advanceWinner(match, match.player_1_id, match.player_1_partner_id, tournament);
  } else if (match.is_bye && !match.player_1_id && match.player_2_id) {
    await advanceWinner(match, match.player_2_id, match.player_2_partner_id, tournament);
  }
}

/**
 * Check if all matches are completed; if so, mark tournament complete.
 */
async function checkTournamentCompletion(
  tournament: LocalTournament,
): Promise<void> {
  const allMatches = await db.tournamentMatches
    .where('tournament_id').equals(tournament.id)
    .toArray();

  const allCompleted = allMatches.every(m => m.status === 'completed');
  if (!allCompleted) return;

  // Find the final match to get the winner
  let finalMatch: LocalTournamentMatch | undefined;
  if (tournament.format === 'double_elimination') {
    finalMatch = allMatches.find(m => m.bracket_type === 'grand_final');
  } else {
    // Single elim: final is the last round match
    const maxRound = Math.max(...allMatches.map(m => m.round_number));
    finalMatch = allMatches.find(m => m.round_number === maxRound && m.bracket_type === 'winners');
  }

  if (finalMatch?.winner_id) {
    const now = new Date().toISOString();
    await db.tournaments.update(tournament.id, {
      status: 'completed',
      completed_at: now,
      winner_id: finalMatch.winner_id,
      local_updated_at: now,
    });
  }
}

// ---------- Undo Advancement ----------

/**
 * Reverse everything advanceWinner() did for a completed match.
 * Clears winner from next match, loser from losers bracket match,
 * un-eliminates the loser, and un-completes the tournament if needed.
 * Only safe to call if the next match(es) haven't been played yet.
 */
export async function reverseAdvancement(
  match: LocalTournamentMatch,
  tournament: LocalTournament,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  // Safety: can't undo if the next winner match has already been played
  if (match.next_winner_match_id) {
    const nextMatch = await db.tournamentMatches.get(match.next_winner_match_id);
    if (nextMatch && (nextMatch.status === 'in_progress' || nextMatch.status === 'completed')) {
      return { success: false, error: 'Cannot undo — the next match has already started.' };
    }
  }

  // Safety: can't undo if the next loser match has already been played
  if (match.next_loser_match_id) {
    const loserMatch = await db.tournamentMatches.get(match.next_loser_match_id);
    if (loserMatch && (loserMatch.status === 'in_progress' || loserMatch.status === 'completed')) {
      return { success: false, error: 'Cannot undo — a match in the losers bracket has already started.' };
    }
  }

  const winnerId = match.winner_id;
  if (!winnerId) return { success: false, error: 'No winner to undo.' };

  // 1. Un-complete the tournament if it was marked complete
  if (tournament.status === 'completed') {
    await db.tournaments.update(tournament.id, {
      status: 'in_progress',
      completed_at: null,
      winner_id: null,
      local_updated_at: now,
    });
  }

  // 2. Remove winner from the next match
  if (match.next_winner_match_id) {
    const nextMatch = await db.tournamentMatches.get(match.next_winner_match_id);
    if (nextMatch) {
      const update: Partial<LocalTournamentMatch> = {
        local_updated_at: now,
      };
      if (match.next_winner_slot === 'player_1') {
        update.player_1_id = null;
        update.player_1_partner_id = null;
        update.player_1_seed = null;
      } else {
        update.player_2_id = null;
        update.player_2_partner_id = null;
        update.player_2_seed = null;
      }
      // If the match was set to ready because both players were filled, revert to pending
      if (nextMatch.status === 'ready') {
        update.status = 'pending';
      }
      await db.tournamentMatches.update(nextMatch.id, update);
    }
  }

  // 3. Remove loser from the losers bracket match (double elim)
  if (tournament.format === 'double_elimination' && match.next_loser_match_id) {
    const loserId = match.player_1_id === winnerId ? match.player_2_id : match.player_1_id;
    if (loserId) {
      const loserMatch = await db.tournamentMatches.get(match.next_loser_match_id);
      if (loserMatch) {
        const update: Partial<LocalTournamentMatch> = {
          local_updated_at: now,
        };
        if (match.next_loser_slot === 'player_1') {
          update.player_1_id = null;
          update.player_1_partner_id = null;
          update.player_1_seed = null;
        } else {
          update.player_2_id = null;
          update.player_2_partner_id = null;
          update.player_2_seed = null;
        }
        if (loserMatch.status === 'ready') {
          update.status = 'pending';
        }
        await db.tournamentMatches.update(loserMatch.id, update);
      }
    }
  }

  // 4. Un-eliminate the loser
  if (match.bracket_type !== 'winners' || tournament.format === 'single_elimination') {
    const loserId = match.player_1_id === winnerId ? match.player_2_id : match.player_1_id;
    if (loserId) {
      const participant = await db.tournamentParticipants
        .where('tournament_id').equals(tournament.id)
        .filter(p => p.player_id === loserId)
        .first();
      if (participant && participant.status === 'eliminated') {
        await db.tournamentParticipants.update(participant.id, {
          status: 'active',
          eliminated_round: null,
        });
      }
    }
  }

  // 5. Reset this match to in_progress with no winner
  await db.tournamentMatches.update(match.id, {
    status: 'in_progress',
    winner_id: null,
    completed_at: null,
    local_updated_at: now,
  });

  return { success: true };
}

// ---------- Progress & Labels ----------

export function getTournamentProgress(
  matches: LocalTournamentMatch[],
): {
  currentRound: number;
  completedMatches: number;
  totalMatches: number;
  totalPlayableMatches: number;
  isComplete: boolean;
} {
  const playable = matches.filter(m => !m.is_bye);
  const completed = playable.filter(m => m.status === 'completed');
  const inProgress = matches.filter(m => m.status === 'in_progress' || m.status === 'ready');

  let currentRound = 1;
  if (inProgress.length > 0) {
    currentRound = Math.min(...inProgress.map(m => m.round_number));
  } else if (completed.length > 0) {
    currentRound = Math.max(...completed.map(m => m.round_number));
  }

  return {
    currentRound,
    completedMatches: completed.length,
    totalMatches: matches.length,
    totalPlayableMatches: playable.length,
    isComplete: playable.length > 0 && completed.length === playable.length,
  };
}

export function getRoundLabel(
  round: number,
  totalRounds: number,
  bracketType: BracketType,
): string {
  if (bracketType === 'grand_final') return 'Grand Final';

  if (bracketType === 'losers') {
    return `Losers Round ${round}`;
  }

  // Winners bracket / single elim
  const roundsFromEnd = totalRounds - round;
  switch (roundsFromEnd) {
    case 0: return 'Final';
    case 1: return 'Semi-Finals';
    case 2: return 'Quarter-Finals';
    default: return `Round ${round}`;
  }
}

export function getWinnersRoundCount(participantCount: number): number {
  return Math.ceil(Math.log2(participantCount));
}

// ---------- Standings ----------

export interface TournamentStanding {
  playerId: string;
  partnerId: string | null;
  seed: number;
  placement: number;        // 1 = champion, 2 = runner-up, etc.
  eliminatedRound: number | null;
  isActive: boolean;
}

export function getFinalStandings(
  participants: LocalTournamentParticipant[],
  matches: LocalTournamentMatch[],
): TournamentStanding[] {
  const standings: TournamentStanding[] = participants.map(p => ({
    playerId: p.player_id,
    partnerId: p.partner_id,
    seed: p.seed_position,
    placement: 0,
    eliminatedRound: p.eliminated_round,
    isActive: p.status === 'active',
  }));

  // Sort: active players first (they went furthest), then by elimination round desc
  standings.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    if (a.eliminatedRound !== null && b.eliminatedRound !== null) {
      return b.eliminatedRound - a.eliminatedRound; // later round = better
    }
    return a.seed - b.seed;
  });

  // Assign placements
  standings.forEach((s, i) => {
    s.placement = i + 1;
  });

  return standings;
}

// ---------- Match Scoring ----------

export function checkMatchComplete(
  p1Score: number,
  p2Score: number,
  format: 'single' | 'race_to' | 'best_of',
  target: number | null,
): boolean {
  if (format === 'single') {
    return p1Score === 1 || p2Score === 1;
  }
  if (format === 'race_to' && target) {
    return p1Score >= target || p2Score >= target;
  }
  if (format === 'best_of' && target) {
    const needed = Math.ceil(target / 2);
    return p1Score >= needed || p2Score >= needed;
  }
  return false;
}
