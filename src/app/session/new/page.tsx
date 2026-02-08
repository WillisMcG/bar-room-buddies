'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Check, ArrowRight } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';
import { db, getDeviceId, seedSystemGameTypes } from '@/lib/db/dexie';
import type { LocalProfile, LocalGameType } from '@/lib/db/dexie';
import { v4 as uuidv4 } from 'uuid';

type Step = 'game_type' | 'players' | 'table_setup';

export default function NewSessionPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('game_type');
  const [gameTypes, setGameTypes] = useState<LocalGameType[]>([]);
  const [players, setPlayers] = useState<LocalProfile[]>([]);
  const [selectedGameType, setSelectedGameType] = useState<string>('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [tablePlayer1, setTablePlayer1] = useState<string>('');
  const [tablePlayer2, setTablePlayer2] = useState<string>('');
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      await seedSystemGameTypes();
      const types = await db.gameTypes.toArray();
      const allPlayers = await db.profiles.toArray();
      const activePlayers = allPlayers.filter(p => !p.merged_into);
      activePlayers.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setGameTypes(types);
      setPlayers(activePlayers);
      if (types.length > 0) setSelectedGameType(types[0].id);
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
      } else {
        next.add(id);
      }
      return next;
    });
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
    setPlayers(prev => [...prev, newPlayer].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    setSelectedPlayerIds(prev => new Set([...prev, newPlayer.id]));
    setNewPlayerName('');
    setShowNewPlayer(false);
  };

  const selectedPlayers = players.filter(p => selectedPlayerIds.has(p.id));
  const waitingPlayers = selectedPlayers.filter(
    p => p.id !== tablePlayer1 && p.id !== tablePlayer2
  );

  const handleStartSession = async () => {
    if (!selectedGameType || !tablePlayer1 || !tablePlayer2 || selectedPlayerIds.size < 3) return;
    setIsCreating(true);

    const sessionId = uuidv4();
    const queue = waitingPlayers.map(p => p.id);

    await db.sessions.add({
      id: sessionId,
      game_type_id: selectedGameType,
      status: 'active',
      started_at: new Date().toISOString(),
      completed_at: null,
      participant_ids: Array.from(selectedPlayerIds),
      table_player_ids: [tablePlayer1, tablePlayer2],
      waiting_queue: queue,
      venue_id: null,
      synced: false,
      local_updated_at: new Date().toISOString(),
    });

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

  return (
    <PageWrapper title="Open Table" subtitle="Set up a group session">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {(['game_type', 'players', 'table_setup'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
            <button
              onClick={() => {
                if (s === 'game_type') setStep(s);
                if (s === 'players' && selectedGameType) setStep(s);
                if (s === 'table_setup' && selectedPlayerIds.size >= 3) setStep(s);
              }}
              className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                step === s
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              {s === 'game_type' ? 'Game' : s === 'players' ? 'Players' : 'Table'}
            </button>
          </div>
        ))}
      </div>

      {/* Step 1: Game Type */}
      {step === 'game_type' && (
        <>
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
            {selectedPlayerIds.size < 3 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                Select at least 3 players to start a group session
              </p>
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
            disabled={selectedPlayerIds.size < 3}
            onClick={() => setStep('table_setup')}
          >
            Next: Set Up Table
          </Button>
        </>
      )}

      {/* Step 3: Table Setup */}
      {step === 'table_setup' && (
        <>
          <Card className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Who starts on the table?</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Tap two players to put them on the table first</p>

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

          <Button
            variant="accent"
            size="lg"
            className="w-full"
            disabled={!tablePlayer1 || !tablePlayer2 || isCreating}
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