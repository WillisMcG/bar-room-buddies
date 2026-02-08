'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Plus, Shuffle, Trophy, ArrowUpDown } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import { db, getDeviceId } from '@/lib/db/dexie';
import type { LocalProfile, LocalGameType, MatchMode } from '@/lib/db/dexie';
import {
  assignSeeds,
  generateSingleElimBracket,
  generateDoubleElimBracket,
  buildTournamentMatches,
  nextPowerOf2,
} from '@/lib/tournaments/bracket-generator';
import type { SeedEntry } from '@/lib/tournaments/bracket-generator';
import { shuffleTeams } from '@/lib/utils';

type TournamentFormat = 'single_elimination' | 'double_elimination';

export default function NewTournamentPage() {
  const router = useRouter();

  // Data
  const [gameTypes, setGameTypes] = useState<LocalGameType[]>([]);
  const [players, setPlayers] = useState<LocalProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Step tracking
  const [step, setStep] = useState(1);

  // Step 1: Format & Game
  const [tournamentFormat, setTournamentFormat] = useState<TournamentFormat>('single_elimination');
  const [matchMode, setMatchMode] = useState<MatchMode>('singles');
  const [selectedGameType, setSelectedGameType] = useState('');
  const [matchFormat, setMatchFormat] = useState<string>('race_to');
  const [matchFormatTarget, setMatchFormatTarget] = useState(5);
  const [tournamentName, setTournamentName] = useState('');

  // Step 2: Select Players
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');

  // Step 2b: Team pairing (doubles)
  const [pairedTeams, setPairedTeams] = useState<Array<[string, string]>>([]);
  const [teamPairingSelection, setTeamPairingSelection] = useState<string[]>([]);

  // Step 3: Seeding
  const [seedingMethod, setSeedingMethod] = useState<'random' | 'manual'>('random');
  const [seededOrder, setSeededOrder] = useState<SeedEntry[]>([]);
  const [swapSelection, setSwapSelection] = useState<number | null>(null);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      const { seedSystemGameTypes } = await import('@/lib/db/dexie');
      await seedSystemGameTypes();
      const types = await db.gameTypes.toArray();
      const allPlayers = await db.profiles.toArray();
      const activePlayers = allPlayers.filter(p => !p.merged_into);
      activePlayers.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setGameTypes(types);
      setPlayers(activePlayers);
      if (types.length > 0) {
        setSelectedGameType(types[0].id);
        if (types[0].default_format) setMatchFormat(types[0].default_format);
        if (types[0].default_format_target) setMatchFormatTarget(types[0].default_format_target);
      }
      setIsLoading(false);
    };
    loadData();
  }, []);

  const isDoubles = matchMode === 'doubles' || matchMode === 'scotch_doubles';
  const selectedPlayers = players.filter(p => selectedPlayerIds.has(p.id));
  const participantCount = isDoubles ? pairedTeams.length : selectedPlayerIds.size;

  // Step indicators
  const steps = isDoubles
    ? ['Setup', 'Players', 'Teams', 'Seeding', 'Preview']
    : ['Setup', 'Players', 'Seeding', 'Preview'];
  const totalSteps = steps.length;

  // Determine actual step numbers for doubles vs singles
  const teamStep = isDoubles ? 3 : -1;
  const seedStep = isDoubles ? 4 : 3;
  const previewStep = isDoubles ? 5 : 4;

  // Participant validation
  const minPlayers = isDoubles ? 4 : 3;
  const hasEnoughPlayers = isDoubles
    ? selectedPlayerIds.size >= 4 && selectedPlayerIds.size % 2 === 0
    : selectedPlayerIds.size >= minPlayers;
  const hasEnoughTeams = isDoubles ? pairedTeams.length >= 2 : true;

  // Profile lookup helper
  const profileMap = useMemo(() => {
    const map = new Map<string, LocalProfile>();
    players.forEach(p => map.set(p.id, p));
    return map;
  }, [players]);

  // Generate seeds when entering seed step
  const generateSeeds = () => {
    if (isDoubles) {
      const ids = pairedTeams.map(t => t[0]);
      const partnerIds = pairedTeams.map(t => t[1]);
      setSeededOrder(assignSeeds(ids, partnerIds, seedingMethod));
    } else {
      const ids = Array.from(selectedPlayerIds);
      const partnerIds = ids.map(() => null);
      setSeededOrder(assignSeeds(ids, partnerIds, seedingMethod));
    }
  };

  // Handle game type change
  const handleGameTypeChange = (id: string) => {
    setSelectedGameType(id);
    const gt = gameTypes.find(g => g.id === id);
    if (gt) {
      setMatchFormat(gt.default_format);
      if (gt.default_format_target) setMatchFormatTarget(gt.default_format_target);
    }
  };

  // Player selection
  const togglePlayer = (id: string) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Remove from teams if in doubles
        if (isDoubles) {
          setPairedTeams(pt => pt.filter(t => t[0] !== id && t[1] !== id));
        }
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Add new player
  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return;
    const newPlayer: LocalProfile = {
      id: crypto.randomUUID(),
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
    setPlayers(prev => [...prev, newPlayer].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    setSelectedPlayerIds(prev => new Set(Array.from(prev).concat(newPlayer.id)));
    setNewPlayerName('');
    setShowNewPlayer(false);
  };

  // Doubles team pairing
  const handleTeamPairingTap = (playerId: string) => {
    if (teamPairingSelection.length === 0) {
      setTeamPairingSelection([playerId]);
    } else if (teamPairingSelection.length === 1) {
      if (teamPairingSelection[0] === playerId) {
        setTeamPairingSelection([]);
      } else {
        setPairedTeams(prev => [...prev, [teamPairingSelection[0], playerId]]);
        setTeamPairingSelection([]);
      }
    }
  };

  const handleRandomizeAllTeams = () => {
    const ids = Array.from(selectedPlayerIds);
    if (ids.length < 4 || ids.length % 2 !== 0) return;
    const teams = shuffleTeams(ids);
    setPairedTeams(teams);
    setTeamPairingSelection([]);
  };

  const removeTeam = (index: number) => {
    setPairedTeams(prev => prev.filter((_, i) => i !== index));
  };

  // Seeding: swap two positions
  const handleSeedTap = (index: number) => {
    if (swapSelection === null) {
      setSwapSelection(index);
    } else {
      if (swapSelection !== index) {
        setSeededOrder(prev => {
          const next = [...prev];
          const temp = { ...next[swapSelection] };
          next[swapSelection] = { ...next[index], seed: temp.seed };
          next[index] = { ...temp, seed: next[index].seed };
          // Fix seed numbers
          return next.map((s, i) => ({ ...s, seed: i + 1 }));
        });
      }
      setSwapSelection(null);
    }
  };

  const handleReshuffle = () => {
    if (isDoubles) {
      const ids = pairedTeams.map(t => t[0]);
      const partnerIds = pairedTeams.map(t => t[1]);
      setSeededOrder(assignSeeds(ids, partnerIds, 'random'));
    } else {
      const ids = Array.from(selectedPlayerIds);
      setSeededOrder(assignSeeds(ids, ids.map(() => null), 'random'));
    }
  };

  // Create tournament
  const handleCreate = async () => {
    if (isCreating || seededOrder.length < 2) return;
    setIsCreating(true);

    try {
      const tournamentId = crypto.randomUUID();
      const now = new Date().toISOString();
      const gameType = gameTypes.find(g => g.id === selectedGameType);
      const name = tournamentName.trim() || `${gameType?.name || 'Pool'} Tournament`;

      // Create tournament record
      await db.tournaments.add({
        id: tournamentId,
        name,
        game_type_id: selectedGameType,
        format: tournamentFormat,
        match_mode: matchMode,
        match_format: matchFormat as 'single' | 'race_to' | 'best_of',
        match_format_target: matchFormat === 'single' ? null : matchFormatTarget,
        status: 'in_progress',
        seeding_method: seedingMethod,
        total_participants: seededOrder.length,
        started_at: now,
        completed_at: null,
        winner_id: null,
        venue_id: null,
        synced: false,
        local_updated_at: now,
      });

      // Create participant records
      const participants = seededOrder.map(s => ({
        id: crypto.randomUUID(),
        tournament_id: tournamentId,
        player_id: s.id,
        partner_id: s.partnerId,
        seed_position: s.seed,
        status: 'active' as const,
        eliminated_round: null,
        synced: false,
      }));
      await db.tournamentParticipants.bulkAdd(participants);

      // Generate bracket
      const shells = tournamentFormat === 'single_elimination'
        ? generateSingleElimBracket(seededOrder.length)
        : generateDoubleElimBracket(seededOrder.length);

      const matchRecords = buildTournamentMatches(tournamentId, shells, seededOrder);

      // Add synced + local_updated_at to each
      const fullRecords = matchRecords.map(m => ({
        ...m,
        synced: false,
        local_updated_at: now,
      }));

      await db.tournamentMatches.bulkAdd(fullRecords);

      // Auto-advance byes: find completed bye matches and advance winners
      const byeMatches = fullRecords.filter(m => m.is_bye && m.winner_id);
      for (const bm of byeMatches) {
        if (bm.next_winner_match_id) {
          const nextMatch = fullRecords.find(m => m.id === bm.next_winner_match_id);
          if (nextMatch) {
            const update: Record<string, unknown> = { local_updated_at: now };
            if (bm.next_winner_slot === 'player_1') {
              update.player_1_id = bm.winner_id;
              update.player_1_partner_id = bm.player_1_partner_id || bm.player_2_partner_id;
              update.player_1_seed = bm.player_1_seed || bm.player_2_seed;
            } else {
              update.player_2_id = bm.winner_id;
              update.player_2_partner_id = bm.player_1_partner_id || bm.player_2_partner_id;
              update.player_2_seed = bm.player_1_seed || bm.player_2_seed;
            }

            await db.tournamentMatches.update(nextMatch.id, update);

            // Check if next match now ready
            const updatedNext = await db.tournamentMatches.get(nextMatch.id);
            if (updatedNext && updatedNext.player_1_id && updatedNext.player_2_id && updatedNext.status === 'pending') {
              await db.tournamentMatches.update(nextMatch.id, { status: 'ready' });
            }
          }
        }
      }

      router.push(`/tournament/${tournamentId}`);
    } catch (err) {
      console.error('Failed to create tournament:', err);
      setIsCreating(false);
    }
  };

  // Bracket size preview
  const bracketSize = nextPowerOf2(participantCount);
  const byeCount = bracketSize - participantCount;
  const totalRounds = participantCount > 1 ? Math.ceil(Math.log2(participantCount)) : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  return (
    <PageWrapper
      title="New Tournament"
      subtitle={steps[step - 1]}
      action={
        <button onClick={() => step > 1 ? setStep(step - 1) : router.back()} className="p-2 -mr-2">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
      }
    >
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6 mt-2">
        {steps.map((s, i) => (
          <div key={s} className="flex-1 flex items-center gap-1">
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${i + 1 <= step ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
          </div>
        ))}
      </div>

      {/* ========== STEP 1: Format & Game ========== */}
      {step === 1 && (
        <div className="space-y-5">
          {/* Tournament Name */}
          <Card padding="md">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Tournament Name (optional)
            </label>
            <Input
              value={tournamentName}
              onChange={e => setTournamentName(e.target.value)}
              placeholder="e.g. Friday Night 8-Ball"
            />
          </Card>

          {/* Tournament Format */}
          <Card padding="md">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Elimination Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'single_elimination', label: 'Single Elim', desc: 'One loss and you\'re out' },
                { value: 'double_elimination', label: 'Double Elim', desc: 'Lose twice to be eliminated' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTournamentFormat(opt.value as TournamentFormat)}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    tournamentFormat === opt.value
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <p className="font-medium text-sm text-gray-900 dark:text-white">{opt.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Match Mode */}
          <Card padding="md">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Match Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['singles', 'doubles', 'scotch_doubles'] as MatchMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => {
                    setMatchMode(mode);
                    setPairedTeams([]);
                    setTeamPairingSelection([]);
                  }}
                  className={`p-2 rounded-lg border-2 text-center transition-colors ${
                    matchMode === mode
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <p className="font-medium text-xs text-gray-900 dark:text-white">
                    {mode === 'singles' ? 'Singles' : mode === 'doubles' ? 'Doubles' : 'Scotch'}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {/* Game Type */}
          <Card padding="md">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Game Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {gameTypes.map(gt => (
                <button
                  key={gt.id}
                  onClick={() => handleGameTypeChange(gt.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    selectedGameType === gt.id
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <p className="font-medium text-sm text-gray-900 dark:text-white">{gt.name}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Match Format */}
          <Card padding="md">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Each Match Format
            </label>
            <div className="flex gap-2 mb-3">
              {['single', 'race_to', 'best_of'].map(f => (
                <button
                  key={f}
                  onClick={() => setMatchFormat(f)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    matchFormat === f
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {f === 'single' ? 'Single' : f === 'race_to' ? 'Race To' : 'Best Of'}
                </button>
              ))}
            </div>
            {matchFormat !== 'single' && (
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setMatchFormatTarget(Math.max(2, matchFormatTarget - 1))}
                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg font-bold"
                >
                  −
                </button>
                <span className="text-2xl font-bold text-gray-900 dark:text-white w-12 text-center">
                  {matchFormatTarget}
                </span>
                <button
                  onClick={() => setMatchFormatTarget(matchFormatTarget + 1)}
                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg font-bold"
                >
                  +
                </button>
              </div>
            )}
          </Card>

          <Button
            onClick={() => setStep(2)}
            disabled={!selectedGameType}
            className="w-full"
          >
            Next: Select Players
          </Button>
        </div>
      )}

      {/* ========== STEP 2: Select Players ========== */}
      {step === 2 && (
        <div className="space-y-4">
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Players ({selectedPlayerIds.size} selected)
              </h3>
              <button
                onClick={() => setShowNewPlayer(true)}
                className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
              >
                <Plus className="w-4 h-4" /> Add New
              </button>
            </div>

            {!hasEnoughPlayers && selectedPlayerIds.size > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                {isDoubles
                  ? 'Need at least 4 players (even number) for doubles tournament'
                  : 'Need at least 3 players for a tournament'}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {players.map(player => {
                const isSelected = selectedPlayerIds.has(player.id);
                return (
                  <button
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className={`relative flex flex-col items-center p-3 rounded-lg border-2 transition-colors ${
                      isSelected
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <Avatar name={player.display_name} size="sm" />
                    <span className="text-xs mt-1 text-gray-900 dark:text-white truncate w-full text-center">
                      {player.display_name}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Button
            onClick={() => {
              if (isDoubles) {
                setStep(3);
              } else {
                generateSeeds();
                setStep(3);
              }
            }}
            disabled={!hasEnoughPlayers}
            className="w-full"
          >
            {isDoubles ? 'Next: Pair Teams' : 'Next: Seeding'}
          </Button>
        </div>
      )}

      {/* ========== STEP 3 (doubles only): Team Pairing ========== */}
      {step === teamStep && isDoubles && (
        <div className="space-y-4">
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Pair Teams ({pairedTeams.length} teams)
              </h3>
              <button
                onClick={handleRandomizeAllTeams}
                className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
              >
                <Shuffle className="w-4 h-4" /> Randomize
              </button>
            </div>

            {/* Paired teams */}
            {pairedTeams.length > 0 && (
              <div className="space-y-2 mb-4">
                {pairedTeams.map((team, i) => {
                  const p1 = profileMap.get(team[0]);
                  const p2 = profileMap.get(team[1]);
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <span className="text-xs font-bold text-gray-400 w-6">#{i + 1}</span>
                      <Avatar name={p1?.display_name || '?'} size="xs" />
                      <span className="text-sm text-gray-900 dark:text-white truncate">{p1?.display_name}</span>
                      <span className="text-xs text-gray-400">&</span>
                      <Avatar name={p2?.display_name || '?'} size="xs" />
                      <span className="text-sm text-gray-900 dark:text-white truncate">{p2?.display_name}</span>
                      <button onClick={() => removeTeam(i)} className="ml-auto text-red-500 text-xs">✕</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Unpaired players */}
            {(() => {
              const paired = new Set<string>();
              pairedTeams.forEach(t => { paired.add(t[0]); paired.add(t[1]); });
              const unpaired = Array.from(selectedPlayerIds).filter(id => !paired.has(id));
              if (unpaired.length === 0) return null;
              return (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Tap two players to pair them ({unpaired.length} remaining)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {unpaired.map(id => {
                      const player = profileMap.get(id);
                      const isSelected = teamPairingSelection.includes(id);
                      return (
                        <button
                          key={id}
                          onClick={() => handleTeamPairingTap(id)}
                          className={`flex flex-col items-center p-2 rounded-lg border-2 transition-colors ${
                            isSelected
                              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <Avatar name={player?.display_name || '?'} size="sm" />
                          <span className="text-xs mt-1 truncate w-full text-center text-gray-900 dark:text-white">
                            {player?.display_name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </Card>

          <Button
            onClick={() => {
              generateSeeds();
              setStep(seedStep);
            }}
            disabled={!hasEnoughTeams}
            className="w-full"
          >
            Next: Seeding
          </Button>
        </div>
      )}

      {/* ========== SEEDING STEP ========== */}
      {step === seedStep && (
        <div className="space-y-4">
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Bracket Seeding
              </h3>
              <div className="flex gap-2">
                {seedingMethod === 'random' && (
                  <button
                    onClick={handleReshuffle}
                    className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
                  >
                    <Shuffle className="w-4 h-4" /> Re-shuffle
                  </button>
                )}
              </div>
            </div>

            {/* Seeding method toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  setSeedingMethod('random');
                  handleReshuffle();
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  seedingMethod === 'random'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                Random
              </button>
              <button
                onClick={() => setSeedingMethod('manual')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  seedingMethod === 'manual'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                Manual Order
              </button>
            </div>

            {seedingMethod === 'manual' && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Tap two seeds to swap their positions
              </p>
            )}

            {/* Seed list */}
            <div className="space-y-1.5">
              {seededOrder.map((entry, i) => {
                const player = profileMap.get(entry.id);
                const partner = entry.partnerId ? profileMap.get(entry.partnerId) : null;
                const isSwapSelected = swapSelection === i;
                return (
                  <button
                    key={entry.id}
                    onClick={() => seedingMethod === 'manual' ? handleSeedTap(i) : undefined}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${
                      isSwapSelected
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                        : seedingMethod === 'manual'
                          ? 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                          : 'bg-gray-50 dark:bg-gray-800 border-2 border-transparent'
                    }`}
                  >
                    <span className="text-sm font-bold text-gray-400 w-8 text-right">#{entry.seed}</span>
                    <Avatar name={player?.display_name || '?'} size="xs" />
                    <span className="text-sm text-gray-900 dark:text-white truncate">
                      {player?.display_name}
                      {partner && ` & ${partner.display_name}`}
                    </span>
                    {seedingMethod === 'manual' && (
                      <ArrowUpDown className="w-3 h-3 text-gray-400 ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Bracket preview info */}
          <Card padding="md">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bracket Info</h3>
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <p>{participantCount} {isDoubles ? 'teams' : 'players'} • {tournamentFormat === 'single_elimination' ? 'Single' : 'Double'} Elimination</p>
              <p>{totalRounds} rounds{byeCount > 0 ? ` • ${byeCount} bye${byeCount > 1 ? 's' : ''}` : ''}</p>
              {/* Show first round matchups */}
              {seededOrder.length >= 2 && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">First round matchups:</p>
                  {(() => {
                    const bs = nextPowerOf2(seededOrder.length);
                    const matchups: Array<[number, number]> = [];
                    // Simple matchup preview: 1vN, 2v(N-1), etc.
                    for (let i = 0; i < Math.floor(bs / 2); i++) {
                      matchups.push([i + 1, bs - i]);
                    }
                    return matchups.slice(0, 8).map(([s1, s2]) => {
                      const p1 = s1 <= seededOrder.length ? profileMap.get(seededOrder[s1 - 1].id) : null;
                      const p2 = s2 <= seededOrder.length ? profileMap.get(seededOrder[s2 - 1].id) : null;
                      const p1Partner = s1 <= seededOrder.length && seededOrder[s1 - 1].partnerId
                        ? profileMap.get(seededOrder[s1 - 1].partnerId!) : null;
                      const p2Partner = s2 <= seededOrder.length && seededOrder[s2 - 1].partnerId
                        ? profileMap.get(seededOrder[s2 - 1].partnerId!) : null;

                      const name1 = p1 ? (p1Partner ? `${p1.display_name} & ${p1Partner.display_name}` : p1.display_name) : null;
                      const name2 = p2 ? (p2Partner ? `${p2.display_name} & ${p2Partner.display_name}` : p2.display_name) : null;

                      return (
                        <p key={`${s1}-${s2}`} className="text-xs">
                          <span className="text-gray-400">#{s1}</span> {name1 || '—'} vs{' '}
                          {name2 ? <><span className="text-gray-400">#{s2}</span> {name2}</> : <span className="text-green-600">BYE</span>}
                        </p>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </Card>

          <Button
            onClick={() => setStep(previewStep)}
            disabled={seededOrder.length < 2}
            className="w-full"
          >
            Next: Preview & Create
          </Button>
        </div>
      )}

      {/* ========== PREVIEW & CREATE STEP ========== */}
      {step === previewStep && (
        <div className="space-y-4">
          <Card padding="md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {tournamentName.trim() || `${gameTypes.find(g => g.id === selectedGameType)?.name || 'Pool'} Tournament`}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {tournamentFormat === 'single_elimination' ? 'Single' : 'Double'} Elimination •{' '}
                  {matchMode === 'singles' ? 'Singles' : matchMode === 'doubles' ? 'Doubles' : 'Scotch Doubles'}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>{participantCount} {isDoubles ? 'teams' : 'players'} • {totalRounds} rounds</p>
              <p>
                Each match:{' '}
                {matchFormat === 'single' ? 'Single game' : matchFormat === 'race_to' ? `Race to ${matchFormatTarget}` : `Best of ${matchFormatTarget}`}
              </p>
              {byeCount > 0 && <p>{byeCount} bye{byeCount > 1 ? 's' : ''} (top seeds advance)</p>}
            </div>
          </Card>

          {/* Seeded lineup */}
          <Card padding="md">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bracket Order</h3>
            <div className="space-y-1">
              {seededOrder.map(entry => {
                const player = profileMap.get(entry.id);
                const partner = entry.partnerId ? profileMap.get(entry.partnerId) : null;
                return (
                  <div key={entry.id} className="flex items-center gap-2 py-1">
                    <span className="text-xs font-bold text-gray-400 w-6 text-right">#{entry.seed}</span>
                    <Avatar name={player?.display_name || '?'} size="xs" />
                    <span className="text-sm text-gray-900 dark:text-white">
                      {player?.display_name}{partner ? ` & ${partner.display_name}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full"
          >
            {isCreating ? 'Creating...' : 'Start Tournament'}
          </Button>
        </div>
      )}

      {/* Add Player Modal */}
      <Modal isOpen={showNewPlayer} onClose={() => setShowNewPlayer(false)} title="Add Player">
        <div className="space-y-3">
          <Input
            value={newPlayerName}
            onChange={e => setNewPlayerName(e.target.value)}
            placeholder="Player name"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowNewPlayer(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleAddPlayer} disabled={!newPlayerName.trim()} className="flex-1">
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
}
