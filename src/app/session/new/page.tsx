'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Check, ArrowRight, Shuffle, Users2, Dices, Crown, RefreshCw, ArrowDownUp, RotateCcw } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import { db, getDeviceId, seedSystemGameTypes } from '@/lib/db/dexie';
import type { LocalProfile, LocalGameType, MatchMode, RotationMode } from '@/lib/db/dexie';
import { useAuth } from '@/contexts/AuthContext';
import { shuffleTeams } from '@/lib/utils';
import { findOrCreateTeam } from '@/lib/team-utils';
import { v4 as uuidv4 } from 'uuid';

type Step = 'game_type' | 'players' | 'team_pairing' | 'table_setup';

export default function NewSessionPage() {
  const router = useRouter();
  const { venueId } = useAuth();
  const [step, setStep] = useState<Step>('game_type');
  const [gameTypes, setGameTypes] = useState<LocalGameType[]>([]);
  const [players, setPlayers] = useState<LocalProfile[]>([]);
  const [selectedGameType, setSelectedGameType] = useState<string>('');
  const [sessionMode, setSessionMode] = useState<MatchMode>('singles');
  const [rotationMode, setRotationMode] = useState<RotationMode>('king_of_table');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [pairedTeams, setPairedTeams] = useState<Array<[string, string]>>([]);
  const [teamPairingSelection, setTeamPairingSelection] = useState<string[]>([]);
  const [tablePlayer1, setTablePlayer1] = useState<string>('');
  const [tablePlayer2, setTablePlayer2] = useState<string>('');
  const [tableTeam1, setTableTeam1] = useState<[string, string] | null>(null);
  const [tableTeam2, setTableTeam2] = useState<[string, string] | null>(null);
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      await seedSystemGameTypes();
      const types = await db.gameTypes.toArray();
      const allPlayers = await db.profiles.toArray();
      const activePlayers = allPlayers.filter(p => !p.merged_into && (!venueId || p.venue_id === venueId || !p.venue_id));
      activePlayers.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setGameTypes(types);
      setPlayers(activePlayers);
      if (types.length > 0) {
        // Default to 8-Ball if available, otherwise first type
        const eightBall = types.find(t => t.name === '8-Ball');
        setSelectedGameType((eightBall || types[0]).id);
      }
      setIsLoading(false);
    };
    loadData();
  }, []);

  const togglePlayer = (id: string) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Clean up table selections if removed
        if (tablePlayer1 === id) setTablePlayer1('');
        if (tablePlayer2 === id) setTablePlayer2('');
        // Clean up team selections if removed
        setTableTeam1(prev => prev && (prev[0] === id || prev[1] === id) ? null : prev);
        setTableTeam2(prev => prev && (prev[0] === id || prev[1] === id) ? null : prev);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTeamPairingSelection = (id: string) => {
    setTeamPairingSelection(prev => {
      const next = [...prev];
      const index = next.indexOf(id);
      if (index > -1) {
        next.splice(index, 1);
      } else {
        if (next.length < 2) {
          next.push(id);
        } else {
          next[1] = id;
        }
      }
      return next;
    });
  };

  const confirmTeamPairing = () => {
    if (teamPairingSelection.length === 2) {
      const newTeam: [string, string] = [teamPairingSelection[0], teamPairingSelection[1]];
      setPairedTeams(prev => [...prev, newTeam]);
      setTeamPairingSelection([]);
    }
  };

  const removeTeamPairing = (index: number) => {
    setPairedTeams(prev => prev.filter((_, i) => i !== index));
  };

  const handleRandomizeAllTeams = () => {
    // Find players not yet on a team
    const teamed = new Set<string>();
    pairedTeams.forEach(([p1, p2]) => { teamed.add(p1); teamed.add(p2); });
    const unpairedIds = Array.from(selectedPlayerIds).filter(id => !teamed.has(id));
    if (unpairedIds.length < 2 || unpairedIds.length % 2 !== 0) return;
    const newTeams = shuffleTeams(unpairedIds);
    setPairedTeams(prev => [...prev, ...newTeams]);
    setTeamPairingSelection([]);
  };

  const handleRandomizeFromScratch = () => {
    const ids = Array.from(selectedPlayerIds);
    if (ids.length < 4 || ids.length % 2 !== 0) return;
    const newTeams = shuffleTeams(ids);
    setPairedTeams(newTeams);
    setTeamPairingSelection([]);
    setTableTeam1(null);
    setTableTeam2(null);
  };

  const allPlayersTeamed = (): boolean => {
    const teamed = new Set<string>();
    pairedTeams.forEach(([p1, p2]) => {
      teamed.add(p1);
      teamed.add(p2);
    });
    return selectedPlayerIds.size === teamed.size;
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
      venue_id: venueId,
    };
    await db.profiles.add(newPlayer);
    setPlayers(prev => [...prev, newPlayer].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    setSelectedPlayerIds(prev => {
      const next = new Set(Array.from(prev));
      next.add(newPlayer.id);
      return next;
    });
    setNewPlayerName('');
    setShowNewPlayer(false);
  };

  const selectedPlayers = players.filter(p => selectedPlayerIds.has(p.id));
  const waitingPlayers = selectedPlayers.filter(
    p => p.id !== tablePlayer1 && p.id !== tablePlayer2
  );

  const waitingTeams = pairedTeams.filter(
    team => tableTeam1 !== team && tableTeam2 !== team
  );

  const handleStartSession = async () => {
    setIsCreating(true);

    if (sessionMode === 'singles') {
      if (!selectedGameType || !tablePlayer1 || !tablePlayer2 || selectedPlayerIds.size < 2) {
        setIsCreating(false);
        return;
      }
    } else {
      if (!selectedGameType || !tableTeam1 || !tableTeam2 || selectedPlayerIds.size < 4 || !allPlayersTeamed()) {
        setIsCreating(false);
        return;
      }
    }

    const sessionId = uuidv4();

    if (sessionMode === 'singles') {
      const queue = waitingPlayers.map(p => p.id);
      await db.sessions.add({
        id: sessionId,
        game_type_id: selectedGameType,
        session_mode: 'singles',
        rotation_mode: rotationMode,
        status: 'active',
        started_at: new Date().toISOString(),
        completed_at: null,
        participant_ids: Array.from(selectedPlayerIds),
        table_player_ids: [tablePlayer1, tablePlayer2],
        waiting_queue: queue,
        teams: [],
        table_team_ids: null,
        waiting_team_queue: [],
        venue_id: venueId,
        synced: false,
        local_updated_at: new Date().toISOString(),
      });
    } else {
      // Create persistent team records for all paired teams
      await Promise.all(
        pairedTeams.map(team => findOrCreateTeam(team[0], team[1], venueId))
      );

      await db.sessions.add({
        id: sessionId,
        game_type_id: selectedGameType,
        session_mode: sessionMode,
        rotation_mode: rotationMode,
        status: 'active',
        started_at: new Date().toISOString(),
        completed_at: null,
        participant_ids: Array.from(selectedPlayerIds),
        table_player_ids: ['', ''],
        waiting_queue: [],
        teams: pairedTeams,
        table_team_ids: [tableTeam1!, tableTeam2!],
        waiting_team_queue: waitingTeams,
        venue_id: venueId,
        synced: false,
        local_updated_at: new Date().toISOString(),
      });
    }

    router.push(`/session/${sessionId}`);
  };

  const selectTablePlayer = (playerId: string) => {
    if (!tablePlayer1) {
      setTablePlayer1(playerId);
    } else if (!tablePlayer2 && playerId !== tablePlayer1) {
      setTablePlayer2(playerId);
    } else if (playerId === tablePlayer1) {
      setTablePlayer1(tablePlayer2);
      setTablePlayer2('');
    } else if (playerId === tablePlayer2) {
      setTablePlayer2('');
    } else {
      // Both slots full, replace player 2
      setTablePlayer2(playerId);
    }
  };

  const selectTableTeam = (team: [string, string]) => {
    if (!tableTeam1) {
      setTableTeam1(team);
    } else if (!tableTeam2 && team !== tableTeam1) {
      setTableTeam2(team);
    } else if (team === tableTeam1) {
      setTableTeam1(tableTeam2);
      setTableTeam2(null);
    } else if (team === tableTeam2) {
      setTableTeam2(null);
    } else {
      // Both slots full, replace team 2
      setTableTeam2(team);
    }
  };

  const getStepIndicators = (): Step[] => {
    if (sessionMode === 'singles') {
      return ['game_type', 'players', 'table_setup'];
    } else {
      return ['game_type', 'players', 'team_pairing', 'table_setup'];
    }
  };

  const steps = getStepIndicators();

  return (
    <PageWrapper title="Open Table" subtitle="Set up a group session">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
            <button
              onClick={() => {
                if (s === 'game_type') setStep(s);
                if (s === 'players' && selectedGameType) setStep(s);
                if (s === 'team_pairing' && selectedPlayerIds.size >= 4 && sessionMode !== 'singles') setStep(s);
                if (s === 'table_setup') {
                  if (sessionMode === 'singles' && selectedPlayerIds.size >= 2) setStep(s);
                  if (sessionMode !== 'singles' && allPlayersTeamed()) setStep(s);
                }
              }}
              className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                step === s
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              {s === 'game_type' ? 'Game' : s === 'players' ? 'Players' : s === 'team_pairing' ? 'Teams' : 'Table'}
            </button>
          </div>
        ))}
      </div>

      {/* Step 1: Game Type */}
      {step === 'game_type' && (
        <>
          {/* Session Mode Toggle */}
          <Card className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Session Mode</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(['singles', 'doubles', 'scotch_doubles'] as MatchMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setSessionMode(mode);
                    // Reset team-related state when changing mode
                    setPairedTeams([]);
                    setTeamPairingSelection([]);
                    setTableTeam1(null);
                    setTableTeam2(null);
                  }}
                  className={`p-3 rounded-lg border-2 text-center transition-colors ${
                    sessionMode === mode
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {mode === 'singles' ? 'Singles' : mode === 'doubles' ? 'Doubles' : 'Scotch Doubles'}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Game Type Selection */}
          <Card className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Game Type</h3>
            {isLoading ? (
              <div className="text-center py-4 text-sm text-gray-400">Loading...</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {gameTypes.map((gt) => (
                  <button
                    key={gt.id}
                    onClick={() => setSelectedGameType(gt.id)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${
                      selectedGameType === gt.id
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{gt.name}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>
          {/* Rotation Mode Selection */}
          <Card className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Table Mode</h3>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { mode: 'king_of_table' as RotationMode, label: 'King of the Table', desc: 'Winner stays, next up challenges', icon: Crown },
                  { mode: 'round_robin' as RotationMode, label: 'Round Robin', desc: 'Both rotate out, next two play', icon: RefreshCw },
                  { mode: 'winners_out' as RotationMode, label: "Winner's Out", desc: 'Winner leaves, loser stays on', icon: ArrowDownUp },
                  { mode: 'straight_rotation' as RotationMode, label: 'Straight Rotation', desc: 'Both rotate out, fixed order', icon: RotateCcw },
                ]
              ).map(({ mode, label, desc, icon: Icon }) => (
                <button
                  key={mode}
                  onClick={() => setRotationMode(mode)}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    rotationMode === mode
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${rotationMode === mode ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">{desc}</div>
                </button>
              ))}
            </div>
          </Card>

          <Button
            variant="accent"
            size="lg"
            className="w-full"
            disabled={!selectedGameType}
            onClick={() => setStep('players')}
          >
            Next: Select Players
          </Button>
        </>
      )}

      {/* Step 2: Select Players */}
      {step === 'players' && (
        <>
          <Card className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Select Players ({selectedPlayerIds.size} selected)
              </h3>
              <button
                onClick={() => setShowNewPlayer(true)}
                className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 hover:underline"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add New
              </button>
            </div>
            {sessionMode === 'singles' ? (
              selectedPlayerIds.size < 2 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  Select at least 2 players to start a session
                </p>
              )
            ) : (
              <>
                {selectedPlayerIds.size < 4 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                    Select at least 4 players for doubles
                  </p>
                )}
                {selectedPlayerIds.size % 2 !== 0 && selectedPlayerIds.size >= 4 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                    Select an even number of players for team pairing
                  </p>
                )}
              </>
            )}
            {players.length === 0 ? (
              <div className="text-center py-6">
                <UserPlus className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No players yet</p>
                <Button variant="primary" onClick={() => setShowNewPlayer(true)}>
                  <UserPlus className="w-4 h-4 mr-2" /> Add Players
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {players.map((p) => {
                  const isSelected = selectedPlayerIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      className={`relative flex flex-col items-center gap-1 p-3 rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-500'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-2 border-transparent'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
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
            )}
          </Card>
          <Button
            variant="accent"
            size="lg"
            className="w-full"
            disabled={
              sessionMode === 'singles'
                ? selectedPlayerIds.size < 2
                : selectedPlayerIds.size < 4 || selectedPlayerIds.size % 2 !== 0
            }
            onClick={() => {
              if (sessionMode === 'singles' && selectedPlayerIds.size === 2) {
                // With exactly 2 players, auto-assign them to the table and skip table_setup
                const ids = Array.from(selectedPlayerIds);
                setTablePlayer1(ids[0]);
                setTablePlayer2(ids[1]);
                setStep('table_setup');
              } else {
                setStep(sessionMode === 'singles' ? 'table_setup' : 'team_pairing');
              }
            }}
          >
            Next: {sessionMode === 'singles' ? 'Set Up Table' : 'Pair Teams'}
          </Button>
        </>
      )}

      {/* Step 3: Team Pairing (doubles only) */}
      {step === 'team_pairing' && sessionMode !== 'singles' && (
        <>
          <Card className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Pair Teams</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Randomize teams or tap two players to pair manually</p>

            {/* Randomize buttons */}
            <div className="flex gap-2 mb-4">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={handleRandomizeFromScratch}
              >
                <Shuffle className="w-4 h-4 mr-1" /> {pairedTeams.length > 0 ? 'Re-Shuffle All' : 'Randomize All'}
              </Button>
              {pairedTeams.length > 0 && !allPlayersTeamed() && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={handleRandomizeAllTeams}
                >
                  <Shuffle className="w-4 h-4 mr-1" /> Randomize Remaining
                </Button>
              )}
            </div>

            {pairedTeams.length > 0 && (
              <div className="space-y-2 mb-4">
                {pairedTeams.map((team, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border-2 flex items-center justify-between ${
                      ['bg-blue-50 dark:bg-blue-900/20 border-blue-500',
                       'bg-purple-50 dark:bg-purple-900/20 border-purple-500',
                       'bg-pink-50 dark:bg-pink-900/20 border-pink-500',
                       'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'][idx % 4]
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={players.find(p => p.id === team[0])?.display_name || ''}
                        imageUrl={players.find(p => p.id === team[0])?.avatar_url}
                        size="sm"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {players.find(p => p.id === team[0])?.display_name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">&</span>
                      <Avatar
                        name={players.find(p => p.id === team[1])?.display_name || ''}
                        imageUrl={players.find(p => p.id === team[1])?.avatar_url}
                        size="sm"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {players.find(p => p.id === team[1])?.display_name}
                      </span>
                    </div>
                    <button
                      onClick={() => removeTeamPairing(idx)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!allPlayersTeamed() && (
              <div className="space-y-2 mb-4">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Select 2 players to form a team ({pairedTeams.length * 2} / {selectedPlayerIds.size} paired)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {selectedPlayers.map((p) => {
                    const isTeamed = pairedTeams.some(team => team[0] === p.id || team[1] === p.id);
                    const isSelected = teamPairingSelection.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        disabled={isTeamed}
                        onClick={() => toggleTeamPairingSelection(p.id)}
                        className={`p-3 rounded-lg border-2 transition-colors ${
                          isTeamed
                            ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 opacity-50 cursor-not-allowed'
                            : isSelected
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Avatar name={p.display_name} imageUrl={p.avatar_url} size="sm" />
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                            {p.display_name}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {allPlayersTeamed() && (
              <p className="text-xs text-green-600 dark:text-green-400 mb-3">
                All players paired! Ready to select table teams.
              </p>
            )}
          </Card>

          <Button
            variant="accent"
            size="lg"
            className="w-full"
            disabled={!allPlayersTeamed()}
            onClick={() => setStep('table_setup')}
          >
            Next: Set Up Table
          </Button>
        </>
      )}

      {/* Step 4: Table Setup */}
      {step === 'table_setup' && (
        <>
          {sessionMode === 'singles' ? (
            <>
              <Card className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Who starts on the table?</h3>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tap two players or pick randomly</p>
                  <button
                    onClick={() => {
                      const ids = Array.from(selectedPlayerIds);
                      const shuffled = [...ids].sort(() => Math.random() - 0.5);
                      setTablePlayer1(shuffled[0]);
                      setTablePlayer2(shuffled[1]);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 hover:underline"
                  >
                    <Dices className="w-3.5 h-3.5" /> Random
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`p-4 rounded-xl border-2 text-center ${
                    tablePlayer1 ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-dashed border-gray-300 dark:border-gray-600'
                  }`}>
                    {tablePlayer1 ? (
                      <>
                        <Avatar
                          name={players.find(p => p.id === tablePlayer1)?.display_name || ''}
                          imageUrl={players.find(p => p.id === tablePlayer1)?.avatar_url}
                          size="lg"
                          className="mx-auto mb-1"
                        />
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {players.find(p => p.id === tablePlayer1)?.display_name}
                        </div>
                      </>
                    ) : (
                      <div className="py-4 text-sm text-gray-400">Player 1</div>
                    )}
                  </div>
                  <div className={`p-4 rounded-xl border-2 text-center ${
                    tablePlayer2 ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-dashed border-gray-300 dark:border-gray-600'
                  }`}>
                    {tablePlayer2 ? (
                      <>
                        <Avatar
                          name={players.find(p => p.id === tablePlayer2)?.display_name || ''}
                          imageUrl={players.find(p => p.id === tablePlayer2)?.avatar_url}
                          size="lg"
                          className="mx-auto mb-1"
                        />
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {players.find(p => p.id === tablePlayer2)?.display_name}
                        </div>
                      </>
                    ) : (
                      <div className="py-4 text-sm text-gray-400">Player 2</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedPlayers.map((p) => {
                    const isOnTable = p.id === tablePlayer1 || p.id === tablePlayer2;
                    return (
                      <button
                        key={p.id}
                        onClick={() => selectTablePlayer(p.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                          isOnTable
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                        }`}
                      >
                        <Avatar name={p.display_name} imageUrl={p.avatar_url} size="sm" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-left">
                          {p.display_name}
                        </span>
                        {p.id === tablePlayer1 && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">On Table</span>
                        )}
                        {p.id === tablePlayer2 && (
                          <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">On Table</span>
                        )}
                        {!isOnTable && (
                          <span className="text-xs text-gray-400">Waiting</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>

              {waitingPlayers.length > 0 && (
                <Card padding="sm" className="mb-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Rotation queue</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {waitingPlayers.map((p, i) => (
                      <span key={p.id} className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1">
                        {i > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                        {p.display_name}
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <>
              <Card className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Which teams start on the table?</h3>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tap two teams or pick randomly</p>
                  <button
                    onClick={() => {
                      const shuffled = [...pairedTeams].sort(() => Math.random() - 0.5);
                      setTableTeam1(shuffled[0]);
                      setTableTeam2(shuffled[1]);
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 hover:underline"
                  >
                    <Dices className="w-3.5 h-3.5" /> Random
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`p-4 rounded-xl border-2 text-center ${
                    tableTeam1 ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-dashed border-gray-300 dark:border-gray-600'
                  }`}>
                    {tableTeam1 ? (
                      <>
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <Avatar
                            name={players.find(p => p.id === tableTeam1[0])?.display_name || ''}
                            imageUrl={players.find(p => p.id === tableTeam1[0])?.avatar_url}
                            size="sm"
                          />
                          <Avatar
                            name={players.find(p => p.id === tableTeam1[1])?.display_name || ''}
                            imageUrl={players.find(p => p.id === tableTeam1[1])?.avatar_url}
                            size="sm"
                          />
                        </div>
                        <div className="text-xs font-medium text-gray-900 dark:text-white">
                          {players.find(p => p.id === tableTeam1[0])?.display_name} & {players.find(p => p.id === tableTeam1[1])?.display_name}
                        </div>
                      </>
                    ) : (
                      <div className="py-4 text-sm text-gray-400">Team 1</div>
                    )}
                  </div>
                  <div className={`p-4 rounded-xl border-2 text-center ${
                    tableTeam2 ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-dashed border-gray-300 dark:border-gray-600'
                  }`}>
                    {tableTeam2 ? (
                      <>
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <Avatar
                            name={players.find(p => p.id === tableTeam2[0])?.display_name || ''}
                            imageUrl={players.find(p => p.id === tableTeam2[0])?.avatar_url}
                            size="sm"
                          />
                          <Avatar
                            name={players.find(p => p.id === tableTeam2[1])?.display_name || ''}
                            imageUrl={players.find(p => p.id === tableTeam2[1])?.avatar_url}
                            size="sm"
                          />
                        </div>
                        <div className="text-xs font-medium text-gray-900 dark:text-white">
                          {players.find(p => p.id === tableTeam2[0])?.display_name} & {players.find(p => p.id === tableTeam2[1])?.display_name}
                        </div>
                      </>
                    ) : (
                      <div className="py-4 text-sm text-gray-400">Team 2</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {pairedTeams.map((team, idx) => {
                    const isOnTable = tableTeam1 === team || tableTeam2 === team;
                    return (
                      <button
                        key={idx}
                        onClick={() => selectTableTeam(team)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                          isOnTable
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={players.find(p => p.id === team[0])?.display_name || ''}
                            imageUrl={players.find(p => p.id === team[0])?.avatar_url}
                            size="sm"
                          />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {players.find(p => p.id === team[0])?.display_name}
                          </span>
                          <span className="text-xs text-gray-500">&</span>
                          <Avatar
                            name={players.find(p => p.id === team[1])?.display_name || ''}
                            imageUrl={players.find(p => p.id === team[1])?.avatar_url}
                            size="sm"
                          />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {players.find(p => p.id === team[1])?.display_name}
                          </span>
                        </div>
                        {isOnTable && (
                          <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">On Table</span>
                        )}
                        {!isOnTable && (
                          <span className="text-xs text-gray-400">Waiting</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>

              {waitingTeams.length > 0 && (
                <Card padding="sm" className="mb-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Waiting teams queue</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {waitingTeams.map((team, i) => (
                      <span key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1">
                        {i > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                        {players.find(p => p.id === team[0])?.display_name} & {players.find(p => p.id === team[1])?.display_name}
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}

          <Button
            variant="accent"
            size="lg"
            className="w-full"
            disabled={
              sessionMode === 'singles'
                ? !tablePlayer1 || !tablePlayer2 || isCreating
                : !tableTeam1 || !tableTeam2 || isCreating
            }
            onClick={handleStartSession}
          >
            {isCreating ? 'Starting...' : 'Start Session'}
          </Button>
        </>
      )}

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
