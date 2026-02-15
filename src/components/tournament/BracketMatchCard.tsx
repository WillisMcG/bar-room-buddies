'use client';

import Avatar from '@/components/ui/Avatar';
import type { LocalTournamentMatch, LocalProfile } from '@/lib/db/dexie';
import { MATCH_WIDTH } from '@/lib/tournaments/bracket-layout';

interface BracketMatchCardProps {
  match: LocalTournamentMatch;
  profiles: Map<string, LocalProfile>;
  isDoubles: boolean;
  onPlay?: (matchId: string) => void;
}

export default function BracketMatchCard({
  match,
  profiles,
  isDoubles,
  onPlay,
}: BracketMatchCardProps) {
  const p1 = match.player_1_id ? profiles.get(match.player_1_id) : null;
  const p2 = match.player_2_id ? profiles.get(match.player_2_id) : null;
  const p1Partner = match.player_1_partner_id
    ? profiles.get(match.player_1_partner_id)
    : null;
  const p2Partner = match.player_2_partner_id
    ? profiles.get(match.player_2_partner_id)
    : null;

  const isCompleted = match.status === 'completed';
  const isReady = match.status === 'ready';
  const isInProgress = match.status === 'in_progress';
  const isPending = match.status === 'pending';
  const isBye = match.is_bye;

  const p1Won = isCompleted && match.winner_id === match.player_1_id;
  const p2Won = isCompleted && match.winner_id === match.player_2_id;

  // Bye: collapsed, dimmed
  if (isBye) {
    const byePlayer = p1 || p2;
    const byePartner = p1 ? p1Partner : p2Partner;
    const byeSeed = match.player_1_seed || match.player_2_seed;
    return (
      <div
        className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-50"
        style={{ width: MATCH_WIDTH, height: 36 }}
      >
        <div className="flex items-center gap-1.5 px-2 h-full">
          <span className="text-[10px] font-bold text-gray-400 w-4 text-right shrink-0">
            {byeSeed || ''}
          </span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate flex-1">
            {byePlayer?.display_name || 'TBD'}
            {byePartner ? ` & ${byePartner.display_name}` : ''}
          </span>
          <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 shrink-0">
            BYE
          </span>
        </div>
      </div>
    );
  }

  // Border color by status
  const borderLeft = isInProgress
    ? 'border-l-yellow-500'
    : isReady
    ? 'border-l-green-500'
    : isCompleted
    ? 'border-l-gray-300 dark:border-l-gray-600'
    : 'border-l-transparent';

  const borderStyle = isPending ? 'border-dashed' : 'border-solid';

  return (
    <button
      onClick={() => isReady && onPlay?.(match.id)}
      disabled={!isReady}
      className={`rounded-md border border-gray-200 dark:border-gray-700 border-l-[3px] ${borderLeft} ${borderStyle} overflow-hidden bg-white dark:bg-gray-900 transition-all ${
        isReady
          ? 'hover:border-green-400 dark:hover:border-green-500 cursor-pointer shadow-sm hover:shadow-md'
          : ''
      } ${
        isInProgress ? 'animate-pulse-subtle shadow-sm' : ''
      }`}
      style={{ width: MATCH_WIDTH }}
    >
      {/* Player 1 */}
      <div
        className={`flex items-center gap-1.5 px-2 h-[28px] ${
          p1Won ? 'bg-green-50 dark:bg-green-900/20' : ''
        }`}
      >
        <span className="text-[10px] font-bold text-gray-400 w-4 text-right shrink-0">
          {match.player_1_seed || ''}
        </span>
        {p1 ? (
          <>
            <Avatar name={p1.display_name} size="xs" className="!w-5 !h-5 !text-[8px]" />
            <span
              className={`text-[11px] truncate flex-1 text-left ${
                p1Won
                  ? 'font-bold text-green-700 dark:text-green-300'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {p1.display_name}
              {p1Partner ? ` & ${p1Partner.display_name}` : ''}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-gray-400 italic flex-1 text-left">
            TBD
          </span>
        )}
        {(isCompleted || isInProgress) && (
          <span
            className={`text-xs font-bold w-5 text-right shrink-0 ${
              p1Won
                ? 'text-green-600 dark:text-green-400'
                : isInProgress
                ? 'text-gray-600 dark:text-gray-300'
                : 'text-gray-400'
            }`}
          >
            {match.player_1_score}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 dark:border-gray-800" />

      {/* Player 2 */}
      <div
        className={`flex items-center gap-1.5 px-2 h-[28px] ${
          p2Won ? 'bg-green-50 dark:bg-green-900/20' : ''
        }`}
      >
        <span className="text-[10px] font-bold text-gray-400 w-4 text-right shrink-0">
          {match.player_2_seed || ''}
        </span>
        {p2 ? (
          <>
            <Avatar name={p2.display_name} size="xs" className="!w-5 !h-5 !text-[8px]" />
            <span
              className={`text-[11px] truncate flex-1 text-left ${
                p2Won
                  ? 'font-bold text-green-700 dark:text-green-300'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {p2.display_name}
              {p2Partner ? ` & ${p2Partner.display_name}` : ''}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-gray-400 italic flex-1 text-left">
            TBD
          </span>
        )}
        {(isCompleted || isInProgress) && (
          <span
            className={`text-xs font-bold w-5 text-right shrink-0 ${
              p2Won
                ? 'text-green-600 dark:text-green-400'
                : isInProgress
                ? 'text-gray-600 dark:text-gray-300'
                : 'text-gray-400'
            }`}
          >
            {match.player_2_score}
          </span>
        )}
      </div>

      {/* Status bar */}
      {isReady && (
        <div className="bg-green-500 text-white text-[9px] font-bold text-center py-0.5 tracking-wide">
          TAP TO PLAY
        </div>
      )}
      {isInProgress && (
        <div className="bg-yellow-500 text-white text-[9px] font-bold text-center py-0.5 tracking-wide">
          IN PROGRESS
        </div>
      )}
    </button>
  );
}
