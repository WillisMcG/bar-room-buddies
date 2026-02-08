'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Plus, Shuffle, UserPlus } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import { db, getDeviceId } from '@/lib/db/dexie';
import type { LocalProfile, LocalGameType, MatchMode } from '@/lib/db/dexie';
import { shuffleTeams } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

type DoublesType = 'doubles' | 'scotch_doubles';

export default function NewMatchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" /></div>}>
      <NewMatchContent />
    </Suspense>
  );
}

function NewMatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDoublesMode = searchParams.get('mode') === 'doubles';

  const [gameTypes, setGameTypes] = useState<LocalGameType[]>([]);
  const [players, setPlayers] = useState<LocalProfile[]>([]);
  const [selectedGameType, setSelectedGameType] = useState<string>('');
  const [selectedPlayer1, setSelectedPlayer1] = useState<string>('');
  const [selectedPlayer2, setSelectedPlayer2] = useState<string>('');
  // Doubles: multi-select players then assign to teams
  const [doublesSelectedIds, setDoublesSelectedIds] = useState<Set<string>>(new Set());
  const [team1, setTeam1] = useState<[string, string] | null>(null);
  const [team2, setTeam2] = useState<[string, string] | null>(null);
  const [doublesType, setDoublesType] = useState<DoublesType>('doubles');
  const [format, setFormat] = useState<string>('race_to');
  const [formatTarget, setFormatTarget] = useState<number>(5);
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      // Ensure system game types are seeded (uses singleton promise, safe to call multiple times)
      const { seedSystemGameTypes } = await import('@/lib/db/dexie');
      await seedSystemGameTypes();

      const types = await db.gameTypes.toArray();
      // Get all profiles and filter in JS — querying for null in IndexedDB is unreliable
      const allPlayers = await db.profiles.toArray();
      const activePlayers = allPlayers.filter(p => !p.merged_into);
      activePlayers.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setGameTypes(types);
      setPlayers(activePlayers);
      if (types.length > 0) {
        setSelectedGameType(types[0].id);
        if (types[0].default_format) setFormat(types[0].default_format);
        if (types[0].default_format_target) setFormatTarget(types[0].default_format_target);
      }
      setIsLoading(false);
    };
    loadData();
  }, []);

  const handleGameTypeChange = (id: string) => {
    setSelectedGameType(id);
    const gt = gameTypes.find((g) => g.id === id);
    if (gt) {
      setFormat(gt.default_format);
      if (gt.default_format_target) setFormatTarget(gt.default_format_target);
    }
  };

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return;
    const newPlayer: LocalProfile = {
      id: uuidv4(),
      email: null,
      display_name: newPlayerName.trim(),
      avatar_url: null,
      avatar_blob: null,
      is_local: true,
      device_id: getDeviceId(),
      merged_into: null,
      created_at: new Date().toISOString(),
      synced: false,
    };
    await db.profiles.add(newPlayer);
    setPlayers((prev) => [...prev, newPlayer]);
    setNewPlayerName('');
    setShowNewPlayer(false);
  };

  // Doubles helpers
  const toggleDoublesPlayer = (id: string) => {
    setDoublesSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Clear teams if a team member was deselected
        if (team1 && (team1[0] === id || team1[1] === id)) setTeam1(null);
        if (team2 && (team2[0] === id || team2[1] === id)) setTeam2(null);
      } else {
        if (next.size < 4) next.add(id);
      }
      return next;
    });
  };

  const handleRandomizeTeams = () => {
    const ids = Array.from(doublesSelectedIds);
    if (ids.length !== 4) return;
    const teams = shuffleTeams(ids);
    setTeam1(teams[0]);
    setTeam2(teams[1]);
  };

  const assignToTeam = (playerId: string) => {
    // If already on a team, remove them
    if (team1 && (team1[0] === playerId || team1[1] === playerId)) {
      if (team1[0] === playerId) setTeam1(team1[1] ? [team1[1], ''] as any : null);
      else setTeam1([team1[0], ''] as any);
      // Clean up incomplete teams
      setTeam1(prev => {
        if (!prev) return null;
        const filtered = [prev[0], prev[1]].filter(Boolean);
        if (filtered.length === 0) return null;
        return filtered.length === 1 ? null : prev;
      });
      return;
    }
    if (team2 && (team2[0] === playerId || team2[1] === playerId)) {
      setTeam2(prev => {
        if (!prev) return null;
        const filtered = [prev[0], prev[1]].filter(id => id !== playerId);
        if (filtered.length === 0) return null;
        return filtered.length === 1 ? null : prev;
      });
      return;
    }
    // Add to team 1 if it needs players
    if (!team1) {
      setTeam1([playerId, ''] as any);
      return;
    }
    if (team1 && !team1[1]) {
      setTeam1([team1[0], playerId]);
      return;
    }
    // Add to team 2 if it needs players
    if (!team2) {
      setTeam2([playerId, ''] as any);
      return;
    }
    if (team2 && !team2[1]) {
      setTeam2([team2[0], playerId]);
      return;
    }
  };

  const teamsComplete = team1 && team2 && team1[0] && team1[1] && team2[0] && team2[1];

  const handleStartMatch = async () => {
    if (isDoublesMode) {
      if (!selectedGameType || !teamsComplete) return;
    } else {
      if (!selectedGameType || !selectedPlayer1 || !selectedPlayer2) return;
      if (selectedPlayer1 === selectedPlayer2) return;
    }
    setIsCreating(true);

    const matchId = uuidv4();
    const matchMode: MatchMode = isDoublesMode ? doublesType : 'singles';

    await db.matches.add({
      id: matchId,
      game_type_id: selectedGameType,
      match_mode: matchMode,
      player_1_id: isDoublesMode ? team1![0] : selectedPlayer1,
      player_2_id: isDoublesMode ? team2![0] : selectedPlayer2,
      player_1_partner_id: isDoublesMode ? team1![1] : null,
      player_2_partner_id: isDoublesMode ? team2![1] : null,
      format: format as any,
      format_target: format === 'single' ? null : formatTarget,
      player_1_score: 0,
      player_2_score: 0,
      winner_id: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'in_progress',
      venue_id: null,
      synced: false,
      local_updated_at: new Date().toISOString(),
    });

    router.push(`/match/${matchId}`);
  };

  const canStart = isDoublesMode
    ? !!(selectedGameType && teamsComplete)
    : !!(selectedGameType && selectedPlayer1 && selectedPlayer2 && selectedPlayer1 !== selectedPlayer2);

  const pageTitle = isDoublesMode ? 'New Doubles Match' : 'New Match';

  return (
    <PageWrapper title={pageTitle} subtitle="Set up your game">
      {/* Doubles Type Toggle */}
      {isDoublesMode && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Doubles Format</h3>
          <div className="flex gap-2">
            {[
              { value: 'doubles' as DoublesType, label: 'Straight Doubles' },
              { value: 'scotch_doubles' as DoublesType, label: 'Scotch Doubles' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setDoublesType(option.value)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  doublesType === option.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Game Type */}
      <Card className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Game Type</h3>
        {isLoading ? (
          <div className="text-center py-4 text-sm text-gray-400">Loading game types...</div>
        ) : gameTypes.length === 0 ? (
          <div className="text-center py-4 text-sm text-gray-400">No game types found. Try refreshing.</div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {gameTypes.map((gt) => (
            <button
              key={gt.id}
              onClick={() => handleGameTypeChange(gt.id)}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                selectedGameType === gt.id
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="text-sm font-medium text-gray-900 dark:text-white">{gt.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {gt.win_condition_type === 'race' ? 'Race' : gt.win_condition_type === 'points' ? 'Points' : 'Timed'}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Match Format */}
      <Card className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Format</h3>
        <div className="flex gap-2 mb-3">
          {[
            { value: 'single', label: 'Single' },
            { value: 'race_to', label: 'Race To' },
            { value: 'best_of', label: 'Best Of' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFormat(f.value)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                format === f.value
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {format !== 'single' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {format === 'race_to' ? 'Race to' : 'Best of'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFormatTarget(Math.max(1, formatTarget - 1))}
                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-bold"
              >
                -
              </button>
              <span className="w-10 text-center text-lg font-bold text-gray-900 dark:text-white">
                {formatTarget}
              </span>
              <button
                onClick={() => setFormatTarget(formatTarget + 1)}
                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-bold"
              >
                +
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Players */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Players</h3>
          <button
            onClick={() => setShowNewPlayer(true)}
            className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 hover:underline"
          >
            <UserPlus className="w-3.5 h-3.5" /> Add Player
          </button>
        </div>

        {players.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <UserPlus className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">No players yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              {isDoublesMode ? 'Add at least four players to start a doubles match' : 'Add at least two players to start a match'}
            </p>
            <Button
              variant="primary"
              onClick={() => setShowNewPlayer(true)}
              className="mx-auto"
            >
              <UserPlus className="w-4 h-4 mr-2" /> Add Your First Player
            </Button>
          </div>
        ) : isDoublesMode ? (
          // Doubles mode: select 4 players then assign to teams
          <div className="space-y-4">
            {/* Step 1: Select 4 players */}
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Select 4 players ({doublesSelectedIds.size}/4)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {players.map((p) => {
                  const isSelected = doublesSelectedIds.has(p.id);
                  const isFull = doublesSelectedIds.size >= 4 && !isSelected;
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleDoublesPlayer(p.id)}
                      disabled={isFull}
                      className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-500'
                          : isFull
                          ? 'opacity-30 cursor-not-allowed border-2 border-transparent'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-2 border-transparent'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                      <Avatar name={p.display_name} imageUrl={p.avatar_url} size="sm" />
                      <span className="text-xs text-gray-700 dark:text-gray-300 truncate w-full text-center">
                        {p.display_name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Assign teams (only when 4 players selected) */}
            {doublesSelectedIds.size === 4 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  <span className="text-xs font-bold text-gray-400">TEAMS</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>

                {/* Randomize button */}
                <Button
                  variant="secondary"
                  size="md"
                  className="w-full"
                  onClick={handleRandomizeTeams}
                >
                  <Shuffle className="w-4 h-4 mr-2" />
                  {teamsComplete ? 'Shuffle Again' : 'Randomize Teams'}
                </Button>

                {/* Team display / manual assignment */}
                {teamsComplete ? (
                  // Show assigned teams
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">Team 1</div>
                      <div className="flex items-center gap-3">
                        <Avatar name={players.find(p => p.id === team1![0])?.display_name || ''} imageUrl={players.find(p => p.id === team1![0])?.avatar_url} size="md" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {players.find(p => p.id === team1![0])?.display_name}
                        </span>
                        <span className="text-xs text-gray-400">&</span>
                        <Avatar name={players.find(p => p.id === team1![1])?.display_name || ''} imageUrl={players.find(p => p.id === team1![1])?.avatar_url} size="md" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {players.find(p => p.id === team1![1])?.display_name}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                      <span className="text-xs font-bold text-gray-400">VS</span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    </div>
                    <div className="p-3 rounded-xl border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30">
                      <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">Team 2</div>
                      <div className="flex items-center gap-3">
                        <Avatar name={players.find(p => p.id === team2![0])?.display_name || ''} imageUrl={players.find(p => p.id === team2![0])?.avatar_url} size="md" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {players.find(p => p.id === team2![0])?.display_name}
                        </span>
                        <span className="text-xs text-gray-400">&</span>
                        <Avatar name={players.find(p => p.id === team2![1])?.display_name || ''} imageUrl={players.find(p => p.id === team2![1])?.avatar_url} size="md" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {players.find(p => p.id === team2![1])?.display_name}
                        </span>
                      </div>
                    </div>

                    {/* Clear teams to re-pick manually */}
                    <button
                      onClick={() => { setTeam1(null); setTeam2(null); }}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline mx-auto block"
                    >
                      Clear teams &amp; pick manually
                    </button>
                  </div>
                ) : (
                  // Manual team assignment
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                      Or tap players to assign teams manually
                    </p>

                    {/* Team 1 slots */}
                    <div className="p-3 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700">
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">Team 1</div>
                      <div className="flex items-center gap-3 min-h-[40px]">
                        {team1 && team1[0] ? (
                          <>
                            <Avatar name={players.find(p => p.id === team1[0])?.display_name || ''} size="sm" />
                            <span className="text-sm text-gray-900 dark:text-white">{players.find(p => p.id === team1[0])?.display_name}</span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Tap a player below</span>
                        )}
                        {team1 && team1[1] ? (
                          <>
                            <span className="text-xs text-gray-400">&</span>
                            <Avatar name={players.find(p => p.id === team1[1])?.display_name || ''} size="sm" />
                            <span className="text-sm text-gray-900 dark:text-white">{players.find(p => p.id === team1[1])?.display_name}</span>
                          </>
                        ) : team1 && team1[0] ? (
                          <span className="text-xs text-gray-400 ml-2">+ 1 more</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Team 2 slots */}
                    <div className="p-3 rounded-xl border-2 border-dashed border-red-300 dark:border-red-700">
                      <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">Team 2</div>
                      <div className="flex items-center gap-3 min-h-[40px]">
                        {team2 && team2[0] ? (
                          <>
                            <Avatar name={players.find(p => p.id === team2[0])?.display_name || ''} size="sm" />
                            <span className="text-sm text-gray-900 dark:text-white">{players.find(p => p.id === team2[0])?.display_name}</span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Fills after Team 1</span>
                        )}
                        {team2 && team2[1] ? (
                          <>
                            <span className="text-xs text-gray-400">&</span>
                            <Avatar name={players.find(p => p.id === team2[1])?.display_name || ''} size="sm" />
                            <span className="text-sm text-gray-900 dark:text-white">{players.find(p => p.id === team2[1])?.display_name}</span>
                          </>
                        ) : team2 && team2[0] ? (
                          <span className="text-xs text-gray-400 ml-2">+ 1 more</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Unassigned players to tap */}
                    <div className="grid grid-cols-2 gap-2">
                      {Array.from(doublesSelectedIds).map(id => {
                        const p = players.find(pl => pl.id === id);
                        if (!p) return null;
                        const onTeam1 = team1 && (team1[0] === id || team1[1] === id);
                        const onTeam2 = team2 && (team2[0] === id || team2[1] === id);
                        const assigned = onTeam1 || onTeam2;
                        return (
                          <button
                            key={id}
                            onClick={() => assignToTeam(id)}
                            className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                              onTeam1
                                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700'
                                : onTeam2
                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            <Avatar name={p.display_name} imageUrl={p.avatar_url} size="sm" />
                            <span className="text-xs text-gray-900 dark:text-white truncate">{p.display_name}</span>
                            {onTeam1 && <span className="text-[10px] text-blue-600 ml-auto">T1</span>}
                            {onTeam2 && <span className="text-[10px] text-red-600 ml-auto">T2</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : players.length === 1 ? (
          // Singles mode: only 1 player available
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Player 1</label>
              <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto no-scrollbar">
                {players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayer1(p.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
                      selectedPlayer1 === p.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-2 border-transparent'
                    }`}
                  >
                    <Avatar name={p.display_name} imageUrl={p.avatar_url} size="sm" />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate w-full text-center">
                      {p.display_name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="text-center py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Add one more player to start a match</p>
              <Button variant="primary" size="sm" onClick={() => setShowNewPlayer(true)}>
                <UserPlus className="w-4 h-4 mr-1" /> Add Player 2
              </Button>
            </div>
          </div>
        ) : (
          // Singles mode: 2+ players available
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Player 1</label>
              <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto no-scrollbar">
                {players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayer1(p.id)}
                    disabled={p.id === selectedPlayer2}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
                      selectedPlayer1 === p.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                        : p.id === selectedPlayer2
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-2 border-transparent'
                    }`}
                  >
                    <Avatar name={p.display_name} imageUrl={p.avatar_url} size="sm" />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate w-full text-center">
                      {p.display_name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs font-bold text-gray-400">VS</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Player 2</label>
              <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto no-scrollbar">
                {players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayer2(p.id)}
                    disabled={p.id === selectedPlayer1}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
                      selectedPlayer2 === p.id
                        ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-500'
                        : p.id === selectedPlayer1
                        ? 'opacity-30 cursor-not-allowed'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-2 border-transparent'
                    }`}
                  >
                    <Avatar name={p.display_name} imageUrl={p.avatar_url} size="sm" />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate w-full text-center">
                      {p.display_name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Start Button */}
      <Button
        variant="accent"
        size="lg"
        className="w-full"
        disabled={!canStart || isCreating}
        onClick={handleStartMatch}
      >
        {isCreating ? 'Starting...' : isDoublesMode ? 'Start Doubles Match' : 'Start Match'}
      </Button>

      {/* New Player Modal */}
      <Modal isOpen={showNewPlayer} onClose={() => setShowNewPlayer(false)} title="Add Player">
        <div className="space-y-4">
          <Input
            label="Player Name"
            placeholder="Enter player name"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowNewPlayer(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={handleAddPlayer} disabled={!newPlayerName.trim()}>
              Add Player
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
}
