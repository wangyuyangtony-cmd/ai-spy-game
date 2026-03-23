import React, { useState } from 'react';
import { X, Users, Swords, RotateCcw, Eye } from 'lucide-react';
import type { RoomConfig } from '../types';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, config: RoomConfig) => void;
  isLoading?: boolean;
}

export default function CreateRoomModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [spyCount, setSpyCount] = useState(1);
  const [hasBlank, setHasBlank] = useState(false);
  const [maxRounds, setMaxRounds] = useState(3);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), {
      maxPlayers,
      spyCount,
      hasBlank,
      maxRounds,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 card p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">创建房间</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Room name */}
          <div>
            <label className="label-text">房间名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="给房间起个名字..."
              className="input-dark"
              maxLength={20}
              required
            />
          </div>

          {/* Max players slider */}
          <div>
            <label className="label-text flex items-center gap-2">
              <Users size={14} className="text-secondary" />
              最大人数: <span className="text-secondary font-bold">{maxPlayers}</span>
            </label>
            <input
              type="range"
              min={4}
              max={12}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>4</span>
              <span>8</span>
              <span>12</span>
            </div>
          </div>

          {/* Spy count */}
          <div>
            <label className="label-text flex items-center gap-2">
              <Swords size={14} className="text-red-400" />
              卧底人数: <span className="text-red-400 font-bold">{spyCount}</span>
            </label>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSpyCount(n)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    spyCount === n
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-dark border border-white/10 text-gray-400 hover:border-white/20'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Blank card toggle */}
          <div className="flex items-center justify-between">
            <label className="label-text mb-0 flex items-center gap-2">
              <Eye size={14} className="text-gray-400" />
              白板角色
            </label>
            <button
              type="button"
              onClick={() => setHasBlank(!hasBlank)}
              className={`w-12 h-6 rounded-full transition-all duration-300 ${
                hasBlank ? 'bg-primary' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                  hasBlank ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Max rounds */}
          <div>
            <label className="label-text flex items-center gap-2">
              <RotateCcw size={14} className="text-yellow-400" />
              最大轮次: <span className="text-yellow-400 font-bold">{maxRounds}</span>
            </label>
            <input
              type="range"
              min={2}
              max={8}
              value={maxRounds}
              onChange={(e) => setMaxRounds(Number(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>2</span>
              <span>5</span>
              <span>8</span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!name.trim() || isLoading}
            className="w-full btn-primary py-3 text-sm"
          >
            {isLoading ? '创建中...' : '创建房间'}
          </button>
        </form>
      </div>
    </div>
  );
}
