import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Check,
  LogOut,
  Play,
  Crown,
  Settings,
  Users,
  Swords,
  RotateCcw,
  Shield,
  Bot,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useRoomStore } from '../stores/roomStore';
import { useAuthStore } from '../stores/authStore';
import SelectAgentModal from '../components/SelectAgentModal';
import type { Agent, RoomPlayer } from '../types';

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    currentRoom,
    fetchRoom,
    joinRoom,
    addAgent,
    removeAgent,
    leaveRoom,
    toggleReady,
    startGame,
    listenRoomEvents,
    startedGameId,
    clearStartedGame,
    isLoading,
  } = useRoomStore();

  const [modalMode, setModalMode] = useState<'join' | 'add'>('join');
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [error, setError] = useState('');
  const [gameStarting, setGameStarting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchRoom(id).catch(() => {
        navigate('/');
      });
    }
  }, [id, fetchRoom, navigate]);

  useEffect(() => {
    if (id) {
      const cleanup = listenRoomEvents(id);
      return cleanup;
    }
  }, [id, listenRoomEvents]);

  // ---- Navigate ALL players when game starts (via socket event) ----
  useEffect(() => {
    if (startedGameId) {
      setGameStarting(true);
      // Brief delay so the "Game Starting" overlay is visible
      const timer = setTimeout(() => {
        clearStartedGame();
        navigate(`/games/${startedGameId}`);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [startedGameId, navigate, clearStartedGame]);

  const players = currentRoom?.players || [];
  const maxPlayers = currentRoom?.config?.maxPlayers || 6;
  const minPlayers = currentRoom?.config?.minPlayers || 4;

  const myPlayers = useMemo(
    () => players.filter((p) => p.userId === user?.id),
    [players, user?.id]
  );
  const isInRoom = myPlayers.length > 0;
  const isHost = currentRoom?.ownerId === user?.id;

  const myAgentIdsInRoom = useMemo(
    () => new Set(myPlayers.map((p) => p.agentId)),
    [myPlayers]
  );

  const allReady =
    players.length >= minPlayers &&
    players.every((p) => p.isReady || p.userId === currentRoom?.ownerId);

  const userGroups = useMemo(() => {
    const map = new Map<string, RoomPlayer[]>();
    for (const p of players) {
      const arr = map.get(p.userId) || [];
      arr.push(p);
      map.set(p.userId, arr);
    }
    return map;
  }, [players]);

  // ---- Handlers ----

  const handleOpenJoinModal = () => {
    setModalMode('join');
    setShowAgentModal(true);
  };

  const handleOpenAddModal = () => {
    setModalMode('add');
    setShowAgentModal(true);
  };

  const handleSelectAgent = async (agent: Agent) => {
    setShowAgentModal(false);
    if (!id) return;
    try {
      if (modalMode === 'join') {
        await joinRoom(id, agent.id);
      } else {
        await addAgent(id, agent.id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveAgent = async (roomPlayerId: string) => {
    if (!id) return;
    try {
      await removeAgent(id, roomPlayerId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReady = async () => {
    if (!id) return;
    try {
      await toggleReady(id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStart = async () => {
    if (!id) return;
    try {
      // The startGame API returns gameId, but we navigate via the
      // game:start socket event (which all players in the room receive).
      // This ensures the owner navigates alongside everyone else.
      await startGame(id);
      // Navigation happens via the startedGameId effect above
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLeave = async () => {
    if (!id) return;
    await leaveRoom(id);
    navigate('/');
  };

  // ---- Game Starting Overlay ----
  if (gameStarting) {
    return (
      <div className="fixed inset-0 z-50 bg-darker/95 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Swords size={28} className="text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">游戏开始！</h2>
          <p className="text-gray-400">正在进入游戏...</p>
        </div>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const seats = Array.from({ length: maxPlayers }, (_, i) => {
    return players[i] || null;
  });

  const roomFull = players.length >= maxPlayers;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{currentRoom.roomName}</h1>
          <p className="text-gray-500 text-sm mt-1">房间 ID: {currentRoom.id}</p>
        </div>
        {isInRoom && !roomFull && (
          <button
            onClick={handleOpenAddModal}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            添加 Agent
          </button>
        )}
      </div>

      {/* My Agents Summary */}
      {isInRoom && myPlayers.length > 0 && (
        <div className="mb-4 card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Bot size={13} />
            我的 Agent ({myPlayers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {myPlayers.map((p) => (
              <div
                key={p.roomPlayerId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark border border-white/10"
              >
                <span className="text-lg">{p.agentAvatar || '🤖'}</span>
                <span className="text-sm text-gray-300">{p.agentName}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isHost || p.isReady
                      ? isHost
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {isHost ? '房主' : p.isReady ? '已准备' : '未准备'}
                </span>
                {myPlayers.length > 1 && (
                  <button
                    onClick={() => handleRemoveAgent(p.roomPlayerId)}
                    className="ml-1 text-gray-600 hover:text-red-400 transition-colors"
                    title="移除此 Agent"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-shake">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">
            关闭
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Player seats */}
        <div className="lg:col-span-3">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Users size={14} />
              玩家席位 ({players.length}/{maxPlayers})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {seats.map((player, index) => {
                const isPlayerHost = player ? player.userId === currentRoom.ownerId : false;
                const isMe = player ? player.userId === user?.id : false;
                const userSlotCount = player ? (userGroups.get(player.userId)?.length || 1) : 0;

                return (
                  <div
                    key={index}
                    className={`rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${
                      player
                        ? isMe
                          ? 'bg-primary/5 border border-primary/20'
                          : 'bg-darker/50 border border-white/5'
                        : 'bg-darker/20 border border-dashed border-white/5'
                    }`}
                  >
                    {player ? (
                      <>
                        <div className="relative">
                          <div
                            className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 ${
                              player.isReady
                                ? 'border-green-500 bg-green-500/10'
                                : isPlayerHost
                                ? 'border-yellow-500 bg-yellow-500/10'
                                : 'border-white/10 bg-dark'
                            }`}
                          >
                            {player.agentAvatar || '🤖'}
                          </div>
                          {isPlayerHost && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center">
                              <Crown size={10} className="text-black" />
                            </div>
                          )}
                          {player.isReady && !isPlayerHost && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                              <Check size={10} className="text-white" />
                            </div>
                          )}
                        </div>
                        {player.agentName && (
                          <span className="text-sm font-medium text-white truncate max-w-full">
                            {player.agentName}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 truncate max-w-full flex items-center gap-1">
                          {player.nickname}
                          {isMe && <span className="text-primary">(我)</span>}
                          {userSlotCount > 1 && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary">
                              ×{userSlotCount}
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-xs ${
                            player.isReady
                              ? 'text-green-400'
                              : isPlayerHost
                              ? 'text-yellow-400'
                              : 'text-gray-500'
                          }`}
                        >
                          {isPlayerHost ? '房主' : player.isReady ? '已准备' : '未准备'}
                        </span>
                      </>
                    ) : (
                      <div className="py-4 flex flex-col items-center gap-2">
                        <div className="w-14 h-14 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center">
                          <Users size={20} className="text-gray-700" />
                        </div>
                        <span className="text-xs text-gray-600">等待加入...</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom actions */}
            <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap items-center gap-3">
              {!isInRoom ? (
                <button onClick={handleOpenJoinModal} className="btn-primary" disabled={isLoading}>
                  选择 Agent 并加入
                </button>
              ) : (
                <>
                  {!isHost && (
                    <button
                      onClick={handleReady}
                      className={`${
                        myPlayers.every((p) => p.isReady) ? 'btn-secondary' : 'btn-primary'
                      } flex items-center gap-2`}
                    >
                      <Check size={16} />
                      {myPlayers.every((p) => p.isReady) ? '取消准备' : '全部准备'}
                    </button>
                  )}
                  {isHost && (
                    <button
                      onClick={handleStart}
                      disabled={!allReady}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Play size={16} />
                      开始游戏
                    </button>
                  )}
                  {!roomFull && (
                    <button
                      onClick={handleOpenAddModal}
                      className="btn-secondary flex items-center gap-2"
                      disabled={isLoading}
                    >
                      <Plus size={16} />
                      再加一个 Agent
                    </button>
                  )}
                </>
              )}
              <button onClick={handleLeave} className="btn-secondary flex items-center gap-2 ml-auto">
                <LogOut size={16} />
                离开房间
              </button>
            </div>
          </div>
        </div>

        {/* Room config panel */}
        <div className="lg:col-span-1">
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
              <Settings size={14} />
              房间设置
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Users size={13} />
                  人数上限
                </span>
                <span className="text-white">{currentRoom.config?.maxPlayers || 6}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Swords size={13} />
                  卧底人数
                </span>
                <span className="text-red-400">{currentRoom.config?.spyCount || 1}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <Shield size={13} />
                  白板角色
                </span>
                <span className={currentRoom.config?.hasBlank ? 'text-green-400' : 'text-gray-600'}>
                  {currentRoom.config?.hasBlank ? '开启' : '关闭'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5">
                  <RotateCcw size={13} />
                  最大轮次
                </span>
                <span className="text-yellow-400">{currentRoom.config?.maxRounds || 10}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-gray-600 leading-relaxed">
                💡 每位用户可以添加多个自己的 Agent 参加同一局游戏。每个 Agent 会被分配独立的身份和词语。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Select Agent Modal */}
      <SelectAgentModal
        isOpen={showAgentModal}
        onClose={() => setShowAgentModal(false)}
        onSelect={handleSelectAgent}
        excludeAgentIds={myAgentIdsInRoom}
      />
    </div>
  );
}
