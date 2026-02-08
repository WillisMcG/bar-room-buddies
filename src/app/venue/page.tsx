'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Trash2, Palette } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useTheme } from '@/contexts/ThemeContext';

const presetColors = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6',
  '#d946ef', '#ec4899', '#64748b', '#1e293b',
];

export default function VenuePage() {
  const router = useRouter();
  const { venue, setVenueBranding, clearVenueBranding } = useTheme();
  const [name, setName] = useState(venue.name || '');
  const [color, setColor] = useState(venue.accentColor || '#22c55e');
  const [logoPreview, setLogoPreview] = useState<string | null>(venue.logoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    setVenueBranding({
      name: name.trim() || null,
      accentColor: color,
      logoUrl: logoPreview,
    });
    router.push('/settings');
  };

  const handleClear = () => {
    clearVenueBranding();
    setName('');
    setColor('#22c55e');
    setLogoPreview(null);
  };

  return (
    <div className="min-h-screen pb-20 pt-2">
      <div className="max-w-lg mx-auto px-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 mb-4 mt-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Venue Branding</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Customize the app with your bar or pool hall branding.
        </p>

        {/* Preview */}
        <Card className="mb-6">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">Preview</p>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-900">
            {logoPreview ? (
              <img src={logoPreview} alt="" className="w-8 h-8 rounded object-cover" />
            ) : (
              <div className="w-8 h-8 rounded flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: color }}>
                {name ? name.slice(0, 2).toUpperCase() : 'BB'}
              </div>
            )}
            <span className="font-bold text-gray-900 dark:text-white text-sm">
              {name || 'Bar Room Buddies'}
            </span>
          </div>
        </Card>

        {/* Venue Name */}
        <Card className="mb-4">
          <Input
            label="Venue Name"
            placeholder="e.g., Rack 'Em Up Bar & Grill"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Card>

        {/* Logo */}
        <Card className="mb-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logo</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1" /> Upload Logo
            </Button>
            {logoPreview && (
              <Button variant="ghost" size="sm" onClick={() => setLogoPreview(null)}>
                <Trash2 className="w-4 h-4 mr-1" /> Remove
              </Button>
            )}
          </div>
          {logoPreview && (
            <div className="mt-3">
              <img src={logoPreview} alt="Logo preview" className="w-16 h-16 rounded object-cover" />
            </div>
          )}
        </Card>

        {/* Accent Color */}
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-gray-500" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Accent Color</p>
          </div>
          <div className="grid grid-cols-6 gap-2 mb-3">
            {presetColors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-full aspect-square rounded-lg transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800 scale-110' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-8 rounded cursor-pointer border-0"
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#22c55e"
              className="flex-1"
            />
          </div>
        </Card>

        {/* Actions */}
        <div className="space-y-2">
          <Button variant="accent" className="w-full" onClick={handleSave}>
            Save Branding
          </Button>
          {venue.name && (
            <Button variant="ghost" className="w-full text-red-500" onClick={handleClear}>
              <Trash2 className="w-4 h-4 mr-1" /> Clear Branding
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
