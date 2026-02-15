import type { LocalTournamentMatch, BracketType } from '@/lib/db/dexie';

// Match card dimensions (pixels)
export const MATCH_HEIGHT = 68;
export const MATCH_WIDTH = 180;
export const MATCH_GAP = 12;
export const ROUND_GAP = 40;
export const BYE_HEIGHT = 36;

/**
 * Group matches by round number for a given bracket type.
 * Returns a Map sorted by round, each value sorted by match_order_in_round.
 */
export function groupMatchesByRound(
  matches: LocalTournamentMatch[],
  bracketType: BracketType,
): Map<number, LocalTournamentMatch[]> {
  const filtered = matches.filter(m => m.bracket_type === bracketType);
  const grouped = new Map<number, LocalTournamentMatch[]>();

  for (const m of filtered) {
    const list = grouped.get(m.round_number) || [];
    list.push(m);
    grouped.set(m.round_number, list);
  }

  // Sort each round by match_order_in_round
  grouped.forEach((list, round) => {
    grouped.set(round, list.sort((a, b) => a.match_order_in_round - b.match_order_in_round));
  });

  // Return sorted by round number
  const sortedRounds = Array.from(grouped.keys()).sort((a, b) => a - b);
  const sorted = new Map<number, LocalTournamentMatch[]>();
  for (const r of sortedRounds) {
    sorted.set(r, grouped.get(r)!);
  }
  return sorted;
}

/**
 * Compute layout positions for all matches in a bracket.
 * Returns a Map of match.id → { top: number } (Y offset in pixels).
 *
 * Strategy:
 * - First round: matches are evenly spaced sequentially.
 * - Subsequent rounds: each match centers vertically between the two matches
 *   that feed into it (via next_winner_match_id).
 * - If a match has no known feeders, fall back to even spacing within the
 *   available height for that round.
 */
export function computeLayout(
  roundMap: Map<number, LocalTournamentMatch[]>,
  allMatches: LocalTournamentMatch[],
  matchHeight: number = MATCH_HEIGHT,
  gap: number = MATCH_GAP,
): Map<string, { top: number }> {
  const layout = new Map<string, { top: number }>();
  const stride = matchHeight + gap;

  const rounds = Array.from(roundMap.keys()).sort((a, b) => a - b);
  if (rounds.length === 0) return layout;

  // Build a reverse lookup: matchId → list of feeder match IDs
  const feeders = new Map<string, string[]>();
  for (const m of allMatches) {
    if (m.next_winner_match_id) {
      const list = feeders.get(m.next_winner_match_id) || [];
      list.push(m.id);
      feeders.set(m.next_winner_match_id, list);
    }
  }

  // First round: sequential
  const firstRound = roundMap.get(rounds[0]);
  if (firstRound) {
    firstRound.forEach((m, idx) => {
      layout.set(m.id, { top: idx * stride });
    });
  }

  // Subsequent rounds: center between feeders, fall back to even spacing
  for (let ri = 1; ri < rounds.length; ri++) {
    const roundMatches = roundMap.get(rounds[ri]);
    if (!roundMatches) continue;

    // Determine total bracket height from first round
    const firstRoundCount = firstRound?.length || 1;
    const totalHeight = (firstRoundCount - 1) * stride + matchHeight;

    roundMatches.forEach((m, idx) => {
      const feederIds = feeders.get(m.id);
      if (feederIds && feederIds.length >= 2) {
        // Find positions of the two feeders and center between them
        const positions = feederIds
          .map(fid => layout.get(fid))
          .filter((p): p is { top: number } => p != null);

        if (positions.length >= 2) {
          const minTop = Math.min(...positions.map(p => p.top));
          const maxTop = Math.max(...positions.map(p => p.top));
          const center = (minTop + maxTop + matchHeight) / 2 - matchHeight / 2;
          layout.set(m.id, { top: center });
          return;
        }
      }

      if (feederIds && feederIds.length === 1) {
        // Single feeder: align vertically
        const feederPos = layout.get(feederIds[0]);
        if (feederPos) {
          layout.set(m.id, { top: feederPos.top });
          return;
        }
      }

      // Fallback: evenly distribute within the total height
      if (roundMatches.length === 1) {
        layout.set(m.id, { top: totalHeight / 2 - matchHeight / 2 });
      } else {
        const spacing = totalHeight / roundMatches.length;
        layout.set(m.id, { top: idx * spacing + spacing / 2 - matchHeight / 2 });
      }
    });
  }

  return layout;
}

/**
 * Calculate connector lines for a round column.
 * For each pair of matches that feed into the same next-round match,
 * returns the vertical line data.
 */
export function getConnectors(
  roundMatches: LocalTournamentMatch[],
  layout: Map<string, { top: number }>,
  matchHeight: number = MATCH_HEIGHT,
): Array<{ top: number; bottom: number; midY: number }> {
  const connectors: Array<{ top: number; bottom: number; midY: number }> = [];
  const visited = new Set<string>();

  for (const match of roundMatches) {
    if (!match.next_winner_match_id || visited.has(match.next_winner_match_id)) continue;

    // Find the sibling that also feeds the same next match
    const sibling = roundMatches.find(
      m => m.id !== match.id && m.next_winner_match_id === match.next_winner_match_id,
    );
    if (!sibling) continue;

    visited.add(match.next_winner_match_id);

    const pos1 = layout.get(match.id);
    const pos2 = layout.get(sibling.id);
    if (!pos1 || !pos2) continue;

    const y1 = Math.min(pos1.top, pos2.top) + matchHeight / 2;
    const y2 = Math.max(pos1.top, pos2.top) + matchHeight / 2;
    const midY = (y1 + y2) / 2;

    connectors.push({ top: y1, bottom: y2, midY });
  }

  return connectors;
}

/**
 * Get the maximum height across all positioned matches.
 */
export function getBracketHeight(
  layout: Map<string, { top: number }>,
  matchHeight: number = MATCH_HEIGHT,
): number {
  let maxBottom = 0;
  layout.forEach(({ top }) => {
    const bottom = top + matchHeight;
    if (bottom > maxBottom) maxBottom = bottom;
  });
  return maxBottom;
}
