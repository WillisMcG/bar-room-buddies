'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ChevronRight } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { db, getDeviceId } from '@/lib/db/dexie';
import { getWinPercentage } from '@/lib/utils';
import type { LocalProfile } from '@/lib/db/dexie';
import { useAuth } from '@/contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { Users } from 'lucide-react';

interface PlayerWithStats extends LocalProfile {
  wins: number;
  losses: number;
  winPct: number;
}

export default function PlayersPage() {
  const { venueId } = useAuth();
  const [players, setPlayers] = useState<PlayerWithStats[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadPlayers = async () => {
    const allProfiles = await db.profiles.toArray();
    const venueProfiles = venueId ? allProfiles.filter(p => p.venue_id === venueId || !p.venue_id) : allProfiles;
    const active = venueProfiles.filter((p) => !p.merged_into);

    // Pre-load all session games once to avoid repeated queries
    const allSessionGames = await db.sessionGames.toArray();

    const withStats = await Promise.all(
      active.map(async (p) => {
        // Match stats (includes doubles — check partner IDs too)
        const matches = await db.matches
          .where('status')
          .equals('completed')
          .filter((m) =>
            m.player_1_id === p.id || m.player_2_id === p.id ||
            m.player_1_partner_id === p.id || m.player_2_partner_id === p.id
          )
          .toArray();

        const matchWins = matches.filter((m) => {
          const onTeam1 = m.player_1_id === p.id || m.player_1_partner_id === p.id;
          const team1Won = m.winner_id === m.player_1_id;
          return onTeam1 ? team1Won : !team1Won;
        }).length;
        const matchLosses = matches.length - matchWins;

        // Session stats (includes doubles — check partner IDs too)
        const sessionGames = allSessionGames.filter(
          (g) => g.player_1_id === p.id || g.player_2_id === p.id ||
                 g.player_1_partner_id === p.id || g.player_2_partner_id === p.id
        );
        const sessionWins = sessionGames.filter((g) => {
          const onTeam1 = g.player_1_id === p.id || g.player_1_partner_id === p.id;
          const team1Won = g.winner_id === g.player_1_id;
          return onTeam1 ? team1Won : !team1Won;
        }).length;
        const sessionLosses = sessionGames.length - sessionWins;

        const wins = matchWins + sessionWins;
        const losses = matchLosses + sessionLosses;

        return {
          ...p,
          wins,
          losses,
          winPct: getWinPercentage(wins, losses),
        };
      })
    );

    withStats.sort((a, b) => a.display_name.localeCompare(b.display_name));
    setPlayers(withStats);
    setIsLoading(false);
  };

  useEffect(() => {
    loadPlayers();
  }, [venueId]);

  const handleAddPlayer = async () => {
    if (!newName.trim()) return;
    await db.profiles.add({
      id: uuidv4(),
      email: null,
      display_name: newName.trim(),
      avatar_url: null,
      avatar_blob: null,
      is_local: true,
      device_id: getDeviceId(),
      merged_into: null,
      created_at: new Date().toISOString(),
      synced: false,
      venue_id: venueId,
    });
    setNewName('');
    setShowAdd(false);
    await loadPlayers();
  };

  const filtered = search
    ? players.filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase()))
    : players;

  return (
    <PageWrapper
      title="Players"
      subtitle={`${players.length} player${players.length !== 1 ? 's' : ''}`}
      action={
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      }
    >
      {players.length > 3 && (
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} padding="sm">
              <div className="animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="w-10 h-10" />}
            title={search ? 'No players found' : 'No players yet'}
            description={search ? 'Try a different search term' : 'Add your first player to get started'}
            action={
              !search ? (
                <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Player
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((player) => (
            <Link key={player.id} href={`/players/${player.id}`}>
              <Card padding="sm" className="hover:border-green-500/50 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={player.display_name} imageUrl={player.avatar_url} size="md" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {player.display_name}
                        </span>
                        {player.is_local && <Badge>Local</Badge>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {player.wins + player.losses > 0
                          ? `${player.wins}W - ${player.losses}L (${player.winPct}%)`
                          : 'No matches yet'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Player">
        <div className="space-y-4">
          <Input
            label="Player Name"
            placeholder="Enter player name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={handleAddPlayer} disabled={!newName.trim()}>Add</Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
}
