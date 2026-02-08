'use client';

import Avatar from '@/components/ui/Avatar';
import type { LocalTournamentMatch, LocalProfile } from '@/lib/db/dexie';

interface BracketMatchProps {
  match: LocalTournamentMatch;
  profiles: Map<string, LocalProfile>;
  isDoubles: boolean;
  onPlay?: (matchId: string) => void;
}

export default function BracketMatch({ match, profiles, isDoubles, onPlay }: BracketMatchProps) {
  const p1 = match.player_1_id ? profiles.get(match.player_1_id) : null;
  const p2 = match.player_2_id ? profiles.get(match.player_2_id) : null;
  const p1Partner = match.player_1_partner_id ? profiles.get(match.player_1_partner_id) : null;
  const p2Partner = match.player_2_partner_id ? profiles.get(match.player_2_partner_id) : null;

  const isCompleted = match.status === 'completed';
  const isReady = match.status === 'ready';
  const isInProgress = match.status === 'in_progress';
  const isPending = match.status === 'pending';
  const isBye = match.is_bye;

  const p1Won = isCompleted && match.winner_id === match.player_1_id;
  const p2Won = isCompleted && match.winner_id === match.player_2_id;

  if (isBye) {
    const byePlayer = p1 || p2;
    const byePartner = p1 ? p1Partner : p2Partner;
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-2 opacity-60">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-5 text-right">
            {match.player_1_seed || match.player_2_seed || ''}
          </span>
          <Avatar name={byePlayer?.display_name || '?'} size="xs" />
          <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">
            {byePlayer?.display_name}{byePartner ? ` & ${byePartner.display_name}` : ''}
          </span>
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">BYE</span>
        </div>
      </div>
    );
  }

  const borderColor = isInProgress
    ? 'border-yellow-500'
    : isReady
    ? 'border-green-500'
    : isCompleted
    ? 'border-gray-300 dark:border-gray-600'
    : 'border-gray-200 dark:border-gray-700';

  return (
    <button
      onClick={() => isReady && onPlay?.(match.id)}
      disabled={!isReady}
      className={`w-full rounded-lg border-2 ${borderColor} overflow-hidden transition-colors ${
        isReady ? 'hover:border-green-400 cursor-pointer' : ''
      }`}
    >
      {/* Player 1 row */}
      <div className={`flex items-center gap-2 px-2 py-1.5 ${
        p1Won ? 'bg-green-50 dark:bg-green-900/20' : ''
      }`}>
        <span className="text-[10px] text-gray-400 w-4 text-right shrink-0">
          {match.player_1_seed || ''}
        </span>
        {p1 ? (
          <>
            <Avatar name={p1.display_name} size="xs" />
            <span className={`text-xs truncate flex-1 text-left ${
              p1Won ? 'font-bold text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-white'
            }`}>
              {p1.display_name}{p1Partner ? ` & ${p1Partner.display_name}` : ''}
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-400 italic flex-1 text-left">TBD</span>
        )}
        {isCompleted && (
          <span className={`text-xs font-bold w-6 text-right ${p1Won ? 'text-green-600' : 'text-gray-400'}`}>
            {match.player_1_score}
          </span>
        )}
        {isInProgress && (
          <span className="text-xs font-bold w-6 text-right text-gray-600 dark:text-gray-300">
            {match.player_1_score}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700" />

      {/* Player 2 row */}
      <div className={`flex items-center gap-2 px-2 py-1.5 ${
        p2Won ? 'bg-green-50 dark:bg-green-900/20' : ''
      }`}>
        <span className="text-[10px] text-gray-400 w-4 text-right shrink-0">
          {match.player_2_seed || ''}
        </span>
        {p2 ? (
          <>
            <Avatar name={p2.display_name} size="xs" />
            <span className={`text-xs truncate flex-1 text-left ${
              p2Won ? 'font-bold text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-white'
            }`}>
              {p2.display_name}{p2Partner ? ` & ${p2Partner.display_name}` : ''}
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-400 italic flex-1 text-left">TBD</span>
        )}
        {isCompleted && (
          <span className={`text-xs font-bold w-6 text-right ${p2Won ? 'text-green-600' : 'text-gray-400'}`}>
            {match.player_2_score}
          </span>
        )}
        {isInProgress && (
          <span className="text-xs font-bold w-6 text-right text-gray-600 dark:text-gray-300">
            {match.player_2_score}
          </span>
        )}
      </div>

      {/* Ready indicator */}
      {isReady && (
        <div className="bg-green-500 text-white text-[10px] font-bold text-center py-0.5">
          TAP TO PLAY
        </div>
      )}
      {isInProgress && (
        <div className="bg-yellow-500 text-white text-[10px] font-bold text-center py-0.5">
          IN PROGRESS
        </div>
      )}
    </button>
  );
}