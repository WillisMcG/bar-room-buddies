import { db, type LocalTeam } from '@/lib/db/dexie';
import { generateTeamName } from '@/lib/team-names';
import { v4 as uuidv4 } from 'uuid';

/**
 * Normalize a team key so that the smaller UUID is always player_1_id.
 * This ensures order-independent lookups.
 */
export function normalizeTeamKey(
  playerA: string,
  playerB: string
): [string, string] {
  return playerA < playerB ? [playerA, playerB] : [playerB, playerA];
}

/**
 * Find an existing team for these two players, or create one with a generated name.
 * Always uses normalized (lexicographic) ordering for consistent lookups.
 */
export async function findOrCreateTeam(
  playerA: string,
  playerB: string,
  venueId: string | null
): Promise<LocalTeam> {
  const [p1, p2] = normalizeTeamKey(playerA, playerB);

  // Look up by compound index
  const existing = await db.teams
    .where('[player_1_id+player_2_id]')
    .equals([p1, p2])
    .first();

  if (existing) return existing;

  // Create new team with a goofy name
  const team: LocalTeam = {
    id: uuidv4(),
    player_1_id: p1,
    player_2_id: p2,
    team_name: generateTeamName(),
    created_at: new Date().toISOString(),
    venue_id: venueId,
    synced: false,
  };

  await db.teams.add(team);
  return team;
}

/**
 * Update a team's display name.
 */
export async function updateTeamName(
  teamId: string,
  newName: string
): Promise<void> {
  await db.teams.update(teamId, { team_name: newName.trim() });
}

/**
 * Get win/loss stats for a team across both matches and session games.
 */
export async function getTeamStats(
  teamId: string
): Promise<{ wins: number; losses: number; totalGames: number }> {
  const team = await db.teams.get(teamId);
  if (!team) return { wins: 0, losses: 0, totalGames: 0 };

  const { player_1_id: p1, player_2_id: p2 } = team;

  // --- Matches (doubles) ---
  const allMatches = await db.matches
    .where('status')
    .equals('completed')
    .filter(
      (m) =>
        m.match_mode !== 'singles' &&
        ((m.player_1_id === p1 && m.player_1_partner_id === p2) ||
          (m.player_1_id === p2 && m.player_1_partner_id === p1) ||
          (m.player_2_id === p1 && m.player_2_partner_id === p2) ||
          (m.player_2_id === p2 && m.player_2_partner_id === p1))
    )
    .toArray();

  let matchWins = 0;
  for (const m of allMatches) {
    const onTeam1 =
      (m.player_1_id === p1 && m.player_1_partner_id === p2) ||
      (m.player_1_id === p2 && m.player_1_partner_id === p1);
    const team1Won = m.winner_id === m.player_1_id;
    if (onTeam1 ? team1Won : !team1Won) matchWins++;
  }
  const matchLosses = allMatches.length - matchWins;

  // --- Session games (doubles) ---
  const allSessionGames = await db.sessionGames.toArray();
  const teamSessionGames = allSessionGames.filter(
    (g) =>
      (g.player_1_partner_id !== null || g.player_2_partner_id !== null) &&
      ((g.player_1_id === p1 && g.player_1_partner_id === p2) ||
        (g.player_1_id === p2 && g.player_1_partner_id === p1) ||
        (g.player_2_id === p1 && g.player_2_partner_id === p2) ||
        (g.player_2_id === p2 && g.player_2_partner_id === p1))
  );

  let sessionWins = 0;
  for (const g of teamSessionGames) {
    const onTeam1 =
      (g.player_1_id === p1 && g.player_1_partner_id === p2) ||
      (g.player_1_id === p2 && g.player_1_partner_id === p1);
    const team1Won = g.winner_id === g.player_1_id;
    if (onTeam1 ? team1Won : !team1Won) sessionWins++;
  }
  const sessionLosses = teamSessionGames.length - sessionWins;

  const wins = matchWins + sessionWins;
  const losses = matchLosses + sessionLosses;

  return { wins, losses, totalGames: wins + losses };
}

/**
 * Get all teams that include a given player, sorted by most games played.
 */
export async function getTeamsForPlayer(
  playerId: string
): Promise<(LocalTeam & { wins: number; losses: number; totalGames: number })[]> {
  // Query both indexes
  const [asP1, asP2] = await Promise.all([
    db.teams.where('player_1_id').equals(playerId).toArray(),
    db.teams.where('player_2_id').equals(playerId).toArray(),
  ]);

  const allTeams = [...asP1, ...asP2];

  // Compute stats for each team
  const withStats = await Promise.all(
    allTeams.map(async (team) => {
      const stats = await getTeamStats(team.id);
      return { ...team, ...stats };
    })
  );

  // Sort by total games played (most first)
  withStats.sort((a, b) => b.totalGames - a.totalGames);
  return withStats;
}