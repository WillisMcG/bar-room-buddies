import type { LocalTournamentMatch, BracketType } from '@/lib/db/dexie';

// ---------- Helpers ----------

export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Fisher-Yates shuffle (returns new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Seeding ----------

export interface SeedEntry {
  id: string;          // player ID or "team key"
  partnerId: string | null;
  seed: number;        // 1-based
}

/**
 * Assign seed positions. "random" shuffles first, "manual" keeps provided order.
 */
export function assignSeeds(
  participantIds: string[],
  partnerIds: (string | null)[],
  method: 'random' | 'manual',
): SeedEntry[] {
  const indices = participantIds.map((_, i) => i);
  const order = method === 'random' ? shuffle(indices) : indices;
  return order.map((idx, seed) => ({
    id: participantIds[idx],
    partnerId: partnerIds[idx],
    seed: seed + 1,
  }));
}

// ---------- Bracket Layout ----------

/**
 * Standard seeding matchup: seed 1 vs seed N, 2 vs N-1, etc.
 * Returns array of [seedA, seedB] for the first round.
 * Handles non-power-of-2 sizes by placing byes.
 */
function firstRoundMatchups(bracketSize: number): Array<[number, number]> {
  // Build recursive matchup map for power-of-2 bracket
  function buildMatchups(seeds: number[]): Array<[number, number]> {
    if (seeds.length === 2) return [[seeds[0], seeds[1]]];
    const pairs: Array<[number, number]> = [];
    const half = seeds.length / 2;
    const top: number[] = [];
    const bottom: number[] = [];
    for (let i = 0; i < half; i++) {
      top.push(seeds[i]);
      bottom.push(seeds[seeds.length - 1 - i]);
    }
    pairs.push(...buildMatchups(top));
    pairs.push(...buildMatchups(bottom));
    return pairs;
  }

  const allSeeds = Array.from({ length: bracketSize }, (_, i) => i + 1);
  return buildMatchups(allSeeds);
}

// ---------- Single Elimination ----------

interface MatchShell {
  matchNumber: number;
  roundNumber: number;
  matchOrderInRound: number;
  bracketType: BracketType;
  seed1: number | null;
  seed2: number | null;
  isBye: boolean;
  nextWinnerMatch: number | null;  // matchNumber of next
  nextWinnerSlot: 'player_1' | 'player_2' | null;
}

export function generateSingleElimBracket(
  participantCount: number,
): MatchShell[] {
  const bracketSize = nextPowerOf2(participantCount);
  const totalRounds = Math.log2(bracketSize);
  const matchups = firstRoundMatchups(bracketSize);

  const matches: MatchShell[] = [];
  let matchNum = 1;

  // Build each round
  let prevRoundMatches: number[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    const roundMatches: number[] = [];

    for (let m = 0; m < matchesInRound; m++) {
      const mn = matchNum++;
      roundMatches.push(mn);

      if (round === 1) {
        // First round: assign seeds from matchups
        const [s1, s2] = matchups[m];
        const isBye = s1 > participantCount || s2 > participantCount;
        matches.push({
          matchNumber: mn,
          roundNumber: round,
          matchOrderInRound: m + 1,
          bracketType: 'winners',
          seed1: s1 <= participantCount ? s1 : null,
          seed2: s2 <= participantCount ? s2 : null,
          isBye,
          nextWinnerMatch: null,  // filled later
          nextWinnerSlot: null,
        });
      } else {
        matches.push({
          matchNumber: mn,
          roundNumber: round,
          matchOrderInRound: m + 1,
          bracketType: 'winners',
          seed1: null,
          seed2: null,
          isBye: false,
          nextWinnerMatch: null,
          nextWinnerSlot: null,
        });
      }
    }

    // Link previous round winners to this round
    if (round > 1) {
      for (let m = 0; m < prevRoundMatches.length; m++) {
        const targetMatchIdx = Math.floor(m / 2);
        const slot: 'player_1' | 'player_2' = m % 2 === 0 ? 'player_1' : 'player_2';
        const prevMatch = matches.find(x => x.matchNumber === prevRoundMatches[m]);
        if (prevMatch) {
          prevMatch.nextWinnerMatch = roundMatches[targetMatchIdx];
          prevMatch.nextWinnerSlot = slot;
        }
      }
    }

    prevRoundMatches = roundMatches;
  }

  return matches;
}

// ---------- Double Elimination ----------

export function generateDoubleElimBracket(
  participantCount: number,
): MatchShell[] {
  // Generate the winners bracket first
  const winnersMatches = generateSingleElimBracket(participantCount);
  const bracketSize = nextPowerOf2(participantCount);
  const winnersRounds = Math.log2(bracketSize);

  let matchNum = winnersMatches.length + 1;
  const losersMatches: MatchShell[] = [];

  // Losers bracket: roughly (2 * winnersRounds - 1) rounds
  // Structure: alternating "drop-down" rounds (receive losers from winners)
  // and "play-off" rounds (losers bracket internal)
  const losersRoundCount = 2 * (winnersRounds - 1);

  // Build losers bracket round by round
  let prevLosersMatches: number[] = [];

  for (let lr = 1; lr <= losersRoundCount; lr++) {
    const isDropRound = lr % 2 === 1; // odd rounds receive losers from winners bracket
    let matchesInRound: number;

    if (lr <= 2) {
      matchesInRound = bracketSize / 4;
    } else {
      matchesInRound = prevLosersMatches.length;
      if (!isDropRound) {
        matchesInRound = Math.ceil(matchesInRound / 2);
      }
    }

    if (matchesInRound < 1) matchesInRound = 1;

    const roundMatches: number[] = [];
    for (let m = 0; m < matchesInRound; m++) {
      const mn = matchNum++;
      roundMatches.push(mn);
      losersMatches.push({
        matchNumber: mn,
        roundNumber: lr,
        matchOrderInRound: m + 1,
        bracketType: 'losers',
        seed1: null,
        seed2: null,
        isBye: false,
        nextWinnerMatch: null,
        nextWinnerSlot: null,
      });
    }

    // Link from previous losers round
    if (lr > 1 && !isDropRound) {
      for (let m = 0; m < prevLosersMatches.length; m++) {
        const targetIdx = Math.floor(m / 2);
        const slot: 'player_1' | 'player_2' = m % 2 === 0 ? 'player_1' : 'player_2';
        const prev = losersMatches.find(x => x.matchNumber === prevLosersMatches[m]);
        if (prev && targetIdx < roundMatches.length) {
          prev.nextWinnerMatch = roundMatches[targetIdx];
          prev.nextWinnerSlot = slot;
        }
      }
    } else if (lr > 1 && isDropRound) {
      // In drop rounds, previous losers winners go to player_1 slot
      for (let m = 0; m < prevLosersMatches.length && m < roundMatches.length; m++) {
        const prev = losersMatches.find(x => x.matchNumber === prevLosersMatches[m]);
        if (prev) {
          prev.nextWinnerMatch = roundMatches[m];
          prev.nextWinnerSlot = 'player_1';
        }
      }
    }

    prevLosersMatches = roundMatches;
  }

  // Grand final: losers bracket winner vs winners bracket winner
  const grandFinalNum = matchNum++;
  const grandFinal: MatchShell = {
    matchNumber: grandFinalNum,
    roundNumber: 1,
    matchOrderInRound: 1,
    bracketType: 'grand_final',
    seed1: null,
    seed2: null,
    isBye: false,
    nextWinnerMatch: null,
    nextWinnerSlot: null,
  };

  // Link winners bracket final → grand final player_1
  const winnersFinal = winnersMatches[winnersMatches.length - 1];
  winnersFinal.nextWinnerMatch = grandFinalNum;
  winnersFinal.nextWinnerSlot = 'player_1';

  // Link losers bracket final → grand final player_2
  if (losersMatches.length > 0) {
    const losersFinal = losersMatches[losersMatches.length - 1];
    losersFinal.nextWinnerMatch = grandFinalNum;
    losersFinal.nextWinnerSlot = 'player_2';
  }

  // Set next_loser links: Winners bracket round losers drop to losers bracket
  // Round 1 losers → Losers round 1, Round 2 losers → Losers round 3, etc.
  for (let wr = 1; wr <= winnersRounds - 1; wr++) {
    const winnersRoundMatches = winnersMatches.filter(m => m.roundNumber === wr);
    const losersTargetRound = wr === 1 ? 1 : (wr - 1) * 2 + 1;
    const losersRoundTargetMatches = losersMatches.filter(m => m.roundNumber === losersTargetRound);

    for (let m = 0; m < winnersRoundMatches.length && m < losersRoundTargetMatches.length; m++) {
      // Losers from winners bracket go to player_2 in drop rounds
      // (player_1 is from previous losers round survivors)
      const slot: 'player_1' | 'player_2' = wr === 1 ?
        (m % 2 === 0 ? 'player_1' : 'player_2') : 'player_2';

      // Store as extra data - we'll handle this in tournament creation
      (winnersRoundMatches[m] as MatchShell & { nextLoserMatch?: number; nextLoserSlot?: string }).nextLoserMatch = losersRoundTargetMatches[m].matchNumber;
      (winnersRoundMatches[m] as MatchShell & { nextLoserSlot?: string }).nextLoserSlot = slot;
    }
  }

  return [...winnersMatches, ...losersMatches, grandFinal];
}

// ---------- Build Tournament Matches ----------

/**
 * Convert bracket shells + seeded participants into LocalTournamentMatch records.
 */
export function buildTournamentMatches(
  tournamentId: string,
  shells: MatchShell[],
  seeds: SeedEntry[],
): Omit<LocalTournamentMatch, 'synced' | 'local_updated_at'>[] {
  // Create a map of seed → entry
  const seedMap = new Map<number, SeedEntry>();
  seeds.forEach(s => seedMap.set(s.seed, s));

  // Create match ID map (matchNumber → id)
  const idMap = new Map<number, string>();
  shells.forEach(s => {
    idMap.set(s.matchNumber, crypto.randomUUID());
  });

  return shells.map(shell => {
    const id = idMap.get(shell.matchNumber)!;
    const seed1Entry = shell.seed1 ? seedMap.get(shell.seed1) : null;
    const seed2Entry = shell.seed2 ? seedMap.get(shell.seed2) : null;

    const isBye = shell.isBye;
    let status: LocalTournamentMatch['status'] = 'pending';
    let winnerId: string | null = null;

    if (isBye) {
      status = 'completed';
      // The actual player gets the bye win
      winnerId = seed1Entry?.id || seed2Entry?.id || null;
    } else if (seed1Entry && seed2Entry) {
      status = 'ready';
    }

    const nextWinnerMatchId = shell.nextWinnerMatch ? idMap.get(shell.nextWinnerMatch) || null : null;
    const loserData = shell as MatchShell & { nextLoserMatch?: number; nextLoserSlot?: string };
    const nextLoserMatchId = loserData.nextLoserMatch ? idMap.get(loserData.nextLoserMatch) || null : null;

    return {
      id,
      tournament_id: tournamentId,
      match_number: shell.matchNumber,
      round_number: shell.roundNumber,
      match_order_in_round: shell.matchOrderInRound,
      bracket_type: shell.bracketType,
      player_1_id: seed1Entry?.id || null,
      player_2_id: seed2Entry?.id || null,
      player_1_partner_id: seed1Entry?.partnerId || null,
      player_2_partner_id: seed2Entry?.partnerId || null,
      player_1_seed: shell.seed1,
      player_2_seed: shell.seed2,
      player_1_score: 0,
      player_2_score: 0,
      winner_id: winnerId,
      is_bye: isBye,
      status,
      completed_at: isBye ? new Date().toISOString() : null,
      next_winner_match_id: nextWinnerMatchId,
      next_winner_slot: shell.nextWinnerSlot,
      next_loser_match_id: nextLoserMatchId || null,
      next_loser_slot: (loserData.nextLoserSlot as 'player_1' | 'player_2' | null) || null,
    };
  });
}