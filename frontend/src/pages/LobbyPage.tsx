import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Gamepad2, RefreshCw, Radio, ArrowRight, Crown, Users, Swords } from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { roomApi } from '../services/api';
import RoomCard from '../components/RoomCard';
import CreateRoomModal from '../components/CreateRoomModal';
import SelectAgentModal from '../components/SelectAgentModal';
import type { RoomConfig, Agent } from '../types';

interface ActiveGame {
  game_id: string;
  room_id: string;
  game_status: string;
  started_at: string;
  room_name: string;
  owner_id: string;
  config: any;
  owner_nickname: string;
  player_count: number;
}

export default function LobbyPage() {
  const { rooms, fetchRooms, createRoom, isLoading } = useRoomStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);

  // Pending room config waiting for agent selection
  const [pendingRoomName, setPendingRoomName] = useState('');
  const [pendingRoomConfig, setPendingRoomConfig] = useState<RoomConfig | null>(null);

  const loadRooms = useCallback(() => {
    fetchRooms(search || undefined);
  }, [fetchRooms, search]);

  const loadActiveGames = useCallback(async () => {
    try {
      const res = await roomApi.myActive();
      setActiveGames(res.activeGames || []);
    } catch (err) {
      console.error('Failed to fetch active games:', err);
    }
  }, []);

  useEffect(() => {
    loadRooms();
    loadActiveGames();
    const interval = setInterval(() => {
      loadRooms();
      loadActiveGames();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadRooms, loadActiveGames]);

  const handleCreateRoom = (name: string, config: RoomConfig) => {
    // After user fills in room config, ask them to pick their first agent
    setPendingRoomName(name);
    setPendingRoomConfig(config);
    setShowCreateModal(false);
    setShowAgentModal(true);
  };

  const handleAgentSelected = async (agent: Agent) => {
    setShowAgentModal(false);
    if (!pendingRoomConfig) return;
    setCreating(true);
    try {
      const room = await createRoom(pendingRoomName, pendingRoomConfig, agent.id);
      navigate(`/rooms/${room.id}`);
    } catch (err) {
      // Error handled in store
    } finally {
      setCreating(false);
      setPendingRoomConfig(null);
      setPendingRoomName('');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadRooms();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Active Games Banner */}
      {activeGames.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-red-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">进行中的游戏</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeGames.map((game) => (
              <ActiveGameCard key={game.game_id} game={game} onRejoin={() => navigate(`/games/${game.game_id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Gamepad2 size={28} className="text-primary" />
            游戏大厅
          </h1>
          <p className="text-gray-500 text-sm mt-1">加入或创建一个房间，开始AI谁是卧底之旅</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          创建房间
        </button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索房间名..."
            className="input-dark pl-11 pr-4"
          />
        </div>
      </form>

      {/* Refresh indicator */}
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw size={12} className="text-gray-600 animate-spin" style={{ animationDuration: '5s' }} />
        <span className="text-xs text-gray-600">每 5 秒自动刷新</span>
        <span className="text-xs text-gray-500 ml-auto">
          {rooms.length} 个房间
        </span>
      </div>

      {/* Room grid */}
      {rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-20 h-20 rounded-2xl bg-dark flex items-center justify-center mb-4">
            <Gamepad2 size={40} className="text-gray-700" />
          </div>
          <h3 className="text-gray-400 text-lg font-medium mb-2">暂无房间</h3>
          <p className="text-gray-600 text-sm mb-6">快创建一个吧！</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            创建房间
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}

      {/* Create room modal */}
      <CreateRoomModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateRoom}
        isLoading={creating}
      />

      {/* Agent selection for room creation */}
      <SelectAgentModal
        isOpen={showAgentModal}
        onClose={() => {
          setShowAgentModal(false);
          setPendingRoomConfig(null);
          setPendingRoomName('');
        }}
        onSelect={handleAgentSelected}
      />
    </div>
  );
}

// ==================== Active Game Card ====================

function ActiveGameCard({ game, onRejoin }: { game: ActiveGame; onRejoin: () => void }) {
  const startedAt = game.started_at ? new Date(game.started_at) : null;
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : 0;
  const minutes = Math.floor(elapsed / 60);

  return (
    <div
      onClick={onRejoin}
      className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 to-red-500/5 border border-amber-500/20 rounded-xl p-4 cursor-pointer hover:border-amber-400/40 hover:shadow-lg hover:shadow-amber-500/10 transition-all group"
    >
      {/* Live indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Live</span>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
          <Swords size={20} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate group-hover:text-amber-300 transition-colors">
            {game.room_name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Crown size={10} className="text-yellow-500" />
            <span className="text-[11px] text-gray-400">{game.owner_nickname}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Users size={12} />
            {game.player_count} 人
          </span>
          {minutes > 0 && (
            <span>已进行 {minutes} 分钟</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-amber-400 group-hover:text-amber-300 transition-colors">
          回到游戏
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
}
