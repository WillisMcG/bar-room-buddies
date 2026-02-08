'use client';

import { useEffect, useState } from 'react';
import { Plus, Target, Pencil, Trash2 } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { db } from '@/lib/db/dexie';
import type { LocalGameType } from '@/lib/db/dexie';
import { v4 as uuidv4 } from 'uuid';

export default function GameTypesPage() {
  const [gameTypes, setGameTypes] = useState<LocalGameType[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCondition, setFormCondition] = useState<'race' | 'points' | 'timed'>('race');
  const [formFormat, setFormFormat] = useState<'single' | 'race_to' | 'best_of'>('race_to');
  const [formTarget, setFormTarget] = useState<number>(5);
  const [formNotes, setFormNotes] = useState('');

  const loadGameTypes = async () => {
    const types = await db.gameTypes.toArray();
    types.sort((a, b) => (a.is_system === b.is_system ? 0 : a.is_system ? -1 : 1));
    setGameTypes(types);
  };

  useEffect(() => {
    loadGameTypes();
  }, []);

  const resetForm = () => {
    setFormName('');
    setFormCondition('race');
    setFormFormat('race_to');
    setFormTarget(5);
    setFormNotes('');
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;

    if (editingId) {
      await db.gameTypes.update(editingId, {
        name: formName.trim(),
        win_condition_type: formCondition,
        default_format: formFormat,
        default_format_target: formFormat === 'single' ? null : formTarget,
        rules_notes: formNotes || null,
        synced: false,
      });
    } else {
      await db.gameTypes.add({
        id: uuidv4(),
        name: formName.trim(),
        is_system: false,
        win_condition_type: formCondition,
        created_by: null,
        rules_notes: formNotes || null,
        default_format: formFormat,
        default_format_target: formFormat === 'single' ? null : formTarget,
        synced: false,
      });
    }

    resetForm();
    setShowAdd(false);
    await loadGameTypes();
  };

  const handleEdit = (gt: LocalGameType) => {
    setFormName(gt.name);
    setFormCondition(gt.win_condition_type);
    setFormFormat(gt.default_format);
    setFormTarget(gt.default_format_target || 5);
    setFormNotes(gt.rules_notes || '');
    setEditingId(gt.id);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    await db.gameTypes.delete(id);
    await loadGameTypes();
  };

  return (
    <PageWrapper
      title="Game Types"
      subtitle={`${gameTypes.length} game type${gameTypes.length !== 1 ? 's' : ''}`}
      action={
        <Button variant="primary" size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Custom
        </Button>
      }
    >
      <div className="space-y-2">
        {gameTypes.map((gt) => (
          <Card key={gt.id} padding="sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{gt.name}</span>
                    {gt.is_system && <Badge variant="info">System</Badge>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {gt.win_condition_type === 'race' ? 'Race' : gt.win_condition_type === 'points' ? 'Points' : 'Timed'}
                    {gt.default_format_target && ` · Default: ${gt.default_format === 'race_to' ? 'Race to' : 'Best of'} ${gt.default_format_target}`}
                  </div>
                </div>
              </div>
              {!gt.is_system && (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(gt)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={() => handleDelete(gt.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              )}
            </div>
            {gt.rules_notes && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 pl-13">{gt.rules_notes}</p>
            )}
          </Card>
        ))}
      </div>

      <Modal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); resetForm(); }}
        title={editingId ? 'Edit Game Type' : 'New Game Type'}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g., Cutthroat, Banks"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            autoFocus
          />
          <Select
            label="Win Condition"
            id="condition"
            value={formCondition}
            onChange={(e) => setFormCondition(e.target.value as any)}
            options={[
              { value: 'race', label: 'Race (first to X wins)' },
              { value: 'points', label: 'Points (first to X points)' },
              { value: 'timed', label: 'Timed' },
            ]}
          />
          <Select
            label="Default Format"
            id="format"
            value={formFormat}
            onChange={(e) => setFormFormat(e.target.value as any)}
            options={[
              { value: 'single', label: 'Single Game' },
              { value: 'race_to', label: 'Race To' },
              { value: 'best_of', label: 'Best Of' },
            ]}
          />
          {formFormat !== 'single' && (
            <Input
              label={formFormat === 'race_to' ? 'Race to...' : 'Best of...'}
              type="number"
              min={1}
              value={formTarget}
              onChange={(e) => setFormTarget(parseInt(e.target.value) || 1)}
            />
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rules Notes</label>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="House rules, special conditions..."
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={handleSave} disabled={!formName.trim()}>
              {editingId ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
}
