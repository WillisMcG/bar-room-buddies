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

  // Step 3: Seeding
  const [seedingMethod, setSeedingMethod] = useState<'random' | 'manual'>('random');
  const [seedOrder, setSeedOrder] = useState<string[]>([]);

  // Load initial data
  useEffect(() => {
    async function load() {
      const types = await db.gameTypes.toArray();
      setGameTypes(types);
      if (types.length > 0) setSelectedGameType(types[0].id);

      const profiles = await db.profiles.toArray();
      setPlayers(profiles);
      setIsLoading(false);
    }
    load();
  }, []);

  // Update seed order when selected players change
  useEffect(() => {
    setSeedOrder(Array.from(selectedPlayerIds));
  }, [selectedPlayerIds]);

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return;
    const profile: typeof players[0] = {
      id: crypto.randomUUID(),
      email: null,
      display_name: newPlayerName,
      avatar_url: null,
      avatar_blob: null,
      is_local: true,
      device_id: getDeviceId(),
      merged_into: null,
      created_at: new Date().toISOString(),
      synced: false,
    };
    await db.profiles.add(profile);
    setPlayers([...players, profile]);
    setSelectedPlayerIds(new Set([...selectedPlayerIds, profile.id]));
    setNewPlayerName('');
    setShowNewPlayer(false);
  };

  const handleCreate = async () => {
    if (!selectedGameType || selectedPlayerIds.size < 2) return;
    setIsCreating(true);

    try {
      const gameType = gameTypes.find(gt => gt.id === selectedGameType);
      if (!gameType) return;

      const tournamentId = crypto.randomUUID();
      const now = new Date().toISOString();
      const participantIds = Array.from(selectedPlayerIds);
      const partnersIds = participantIds.map(() => null);

      // Create seeds
      const seeds = assignSeeds(participantIds, partnersIds, seedingMethod);
      const seedOrder_ = seedingMethod === 'manual' ? seedOrder : undefined;

      // Generate bracket
      const bracketShells = tournamentFormat === 'single_elimination'
        ? generateSingleElimBracket(participantIds.length)
        : generateDoubleElimBracket(participantIds.length);

      // Adjust seeds for manual seeding
      let finalSeeds = seeds;
      if (seedingMethod === 'manual' && seedOrder_ && seedOrder_.length > 0) {
        finalSeeds = assignSeeds(seedOrder_, partnersIds, 'manual');
      }

      // Create matches
      const matches = buildTournamentMatches(tournamentId, bracketShells, finalSeeds);

      // Insert into database
      await db.tournaments.add({
        id: tournamentId,
        name: tournamentName || `Tournament ${new Date().toLocaleDateString()}`,
        game_type_id: selectedGameType,
        format: tournamentFormat,
        match_mode: matchMode,
        match_format: matchFormat as 'single' | 'race_to' | 'best_of',
        match_format_target: matchFormat === 'single' ? null : matchFormatTarget,
        status: 'in_progress',
        seeding_method: seedingMethod,
        total_participants: participantIds.length,
        started_at: now,
        completed_at: null,
        winner_id: null,
        venue_id: null,
        synced: false,
        local_updated_at: now,
      });

      await db.tournamentParticipants.bulkAdd(
        participantIds.map((playerId, idx) => ({
          id: crypto.randomUUID(),
          tournament_id: tournamentId,
          player_id: playerId,
          partner_id: null,
          seed_position: idx + 1,
          status: 'active' as const,
          eliminated_round: null,
          synced: false,
        }))
      );

      await db.tournamentMatches.bulkAdd(
        matches.map(m => ({
          ...m,
          synced: false,
          local_updated_at: now,
        }))
      );

      router.push(`/tournament/${tournamentId}`);
    } catch (error) {
      console.error('Error creating tournament:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleMoveSeed = (fromIdx: number, direction: 'up' | 'down') => {
    const newOrder = [...seedOrder];
    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    [newOrder[fromIdx], newOrder[toIdx]] = [newOrder[toIdx], newOrder[fromIdx]];
    setSeedOrder(newOrder);
  };

  const handleShuffleSeeds = () => {
    setSeedOrder(shuffleTeams(seedOrder));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  // ===== STEP 1: FORMAT & GAME =====
  if (step === 1) {
    const gameType = gameTypes.find(gt => gt.id === selectedGameType);
    const isValid = selectedGameType && tournamentName;

    return (
      <PageWrapper title="New Tournament" action={<button onClick={() => router.push('/play')} className="p-2 -ml-2"><ArrowLeft className="w-5 h-5" /></button>}>
        <div className="space-y-4 mt-4">
          {/* Format */}
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-white">Tournament Format</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['single_elimination', 'double_elimination'] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setTournamentFormat(fmt)}
                  className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                    tournamentFormat === fmt
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                  }`}
                >
                  {fmt === 'single_elimination' ? 'Single Elim' : 'Double Elim'}
                </button>
              ))}
            </div>
          </div>

          {/* Match Mode */}
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-white">Match Mode</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['singles', 'doubles'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setMatchMode(mode)}
                  className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                    matchMode === mode
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                  }`}
                >
                  {mode === 'singles' ? '1v1' : 'Doubles'}
                </button>
              ))}
            </div>
          </div>

          {/* Game Type */}
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-white">Game Type</label>
            <div className="mt-2 space-y-2">
              {gameTypes.map(gt => (
                <button
                  key={gt.id}
                  onClick={() => setSelectedGameType(gt.id)}
                  className={`w-full p-3 rounded-lg text-left text-sm transition-colors ${
                    selectedGameType === gt.id
                      ? 'bg-green-100 dark:bg-green-900/30 border border-green-500'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                >
                  <p className="font-medium text-gray-900 dark:text-white">{gt.name}</p>
                  {gt.rules_notes && <p className="text-xs text-gray-500 mt-1">{gt.rules_notes}</p>}
                </button>
              ))}
            </div>
          </div>

          {/* Match Format */}
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-white">Match Format</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(['single', 'race_to', 'best_of'] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setMatchFormat(fmt)}
                  className={`p-2 rounded-lg text-xs font-medium transition-colors ${
                    matchFormat === fmt
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                  }`}
                >
                  {fmt === 'single' ? 'Single' : fmt === 'race_to' ? 'Race To' : 'Best Of'}
                </button>
              ))}
            </div>
            {matchFormat !== 'single' && (
              <Input
                type="number"
                min="1"
                max="20"
                value={matchFormatTarget.toString()}
                onChange={e => setMatchFormatTarget(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-2"
                placeholder="Target"
              />
            )}
          </div>

          {/* Tournament Name */}
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-white">Tournament Name (optional)</label>
            <Input
              value={tournamentName}
              onChange={e => setTournamentName(e.target.value)}
              placeholder="e.g., Friday Night 8-Ball"
              className="mt-2"
            />
          </div>

          <Button onClick={() => setStep(2)} disabled={!isValid} className="w-full">
            Continue
          </Button>
        </div>
      </PageWrapper>
    );
  }

  // ===== STEP 2: SELECT PLAYERS =====
  if (step === 2) {
    const isValid = selectedPlayerIds.size >= 2;

    return (
      <PageWrapper
        title="Select Players"
        subtitle={`${selectedPlayerIds.size} selected`}
        action={
          <button onClick={() => setStep(1)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
        }
      >
        <div className="space-y-3 mt-4">
          {players.map(p => {
            const isSelected = selectedPlayerIds.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => {
                  const newSet = new Set(selectedPlayerIds);
                  if (isSelected) newSet.delete(p.id);
                  else newSet.add(p.id);
                  setSelectedPlayerIds(newSet);
                }}
                className={`w-full p-3 rounded-lg flex items-center gap-3 transition-colors ${
                  isSelected
                    ? 'bg-green-100 dark:bg-green-900/30 border border-green-500'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                <Avatar name={p.display_name} size="sm" />
                <span className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-left">{p.display_name}</span>
                {isSelected && <Check className="w-5 h-5 text-green-600" />}
              </button>
            );
          })}

          <Button variant="secondary" onClick={() => setShowNewPlayer(true)} className="w-full">
            <Plus className="w-4 h-4 mr-2" /> Add Player
          </Button>
        </div>

        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
            Back
          </Button>
          <Button onClick={() => setStep(3)} disabled={!isValid} className="flex-1">
            Next
          </Button>
        </div>

        {showNewPlayer && (
          <Modal open onClose={() => setShowNewPlayer(false)}>
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Player</h2>
              <Input
                autoFocus
                value={newPlayerName}
                onChange={e => setNewPlayerName(e.target.value)}
                placeholder="Player name"
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
        )}
      </PageWrapper>
    );
  }

  // ===== STEP 3: SEEDING =====
  if (step === 3) {
    const selectedPlayers = Array.from(selectedPlayerIds)
      .map(id => players.find(p => p.id === id)!)
      .filter(Boolean);

    return (
      <PageWrapper
        title="Seeding"
        subtitle={`${selectedPlayers.length} players`}
        action={
          <button onClick={() => setStep(2)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
        }
      >
        <div className="space-y-4 mt-4">
          {/* Method */}
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-white">Seeding Method</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['random', 'manual'] as const).map(method => (
                <button
                  key={method}
                  onClick={() => setSeedingMethod(method)}
                  className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                    seedingMethod === method
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                  }`}
                >
                  {method === 'random' ? 'Random' : 'Manual'}
                </button>
              ))}
            </div>
          </div>

          {seedingMethod === 'manual' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-900 dark:text-white">Seed Order</label>
                <button
                  onClick={handleShuffleSeeds}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <Shuffle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              <div className="space-y-2">
                {seedOrder.map((playerId, idx) => {
                  const player = players.find(p => p.id === playerId);
                  if (!player) return null;
                  return (
                    <div key={playerId} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <span className="text-xs font-bold text-gray-500 w-6">#{idx + 1}</span>
                      <Avatar name={player.display_name} size="xs" />
                      <span className="text-sm text-gray-900 dark:text-white flex-1">{player.display_name}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleMoveSeed(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 disabled:opacity-30"
                        >
                          <ArrowUpDown className="w-4 h-4 text-gray-600 dark:text-gray-400 transform -rotate-90" />
                        </button>
                        <button
                          onClick={() => handleMoveSeed(idx, 'down')}
                          disabled={idx === seedOrder.length - 1}
                          className="p-1 disabled:opacity-30"
                        >
                          <ArrowUpDown className="w-4 h-4 text-gray-600 dark:text-gray-400 transform rotate-90" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {seedingMethod === 'random' && (
            <Card padding="md" className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                Seeds will be assigned randomly when the tournament starts.
              </p>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)} className="flex-1">
              Back
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              loading={isCreating}
              className="flex-1"
            >
              <Trophy className="w-4 h-4 mr-2" /> Create Tournament
            </Button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return null;
}