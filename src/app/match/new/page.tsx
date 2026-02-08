'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, UserPlus } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import { db, getDeviceId } from '@/lib/db/dexie';
import type { LocalProfile, LocalGameType } from '@/lib/db/dexie';
import { v4 as uuidv4 } from 'uuid';

export default function NewMatchPage() {
  const router = useRouter();
  const [gameTypes, setGameTypes] = useState<LocalGameType[]>([]);
  const [players, setPlayers] = useState<LocalProfile[]>([]);
  const [selectedGameType, setSelectedGameType] = useState<string>('');
  const [selectedPlayer1, setSelectedPlayer1] = useState<string>('');
  const [selectedPlayer2, setSelectedPlayer2] = useState<string>('');
  const [format, setFormat] = useState<string>('race_to');
  const [formatTarget, setFormatTarget] = useState<number>(5);
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      // Seed system game types if they don't exist yet (handles first visit to this page)
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

  const handleStartMatch = async () => {
    if (!selectedGameType || !selectedPlayer1 || !selectedPlayer2) return;
    if (selectedPlayer1 === selectedPlayer2) return;
    setIsCreating(true);

    const matchId = uuidv4();
    await db.matches.add({
      id: matchId,
      game_type_id: selectedGameType,
      player_1_id: selectedPlayer1,
      player_2_id: selectedPlayer2,
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

  const canStart = selectedGameType && selectedPlayer1 && selectedPlayer2 && selectedPlayer1 !== selectedPlayer2;

  return (
    <PageWrapper title="New Match" subtitle="Set up your game">
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
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Add at least two players to start a match</p>
            <Button
              variant="primary"
              onClick={() => setShowNewPlayer(true)}
              className="mx-auto"
            >
              <UserPlus className="w-4 h-4 mr-2" /> Add Your First Player
            </Button>
          </div>
        ) : players.length === 1 ? (
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
        {isCreating ? 'Starting...' : 'Start Match'}
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
