import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Crown, Swords } from 'lucide-react';
import type { Room } from '../types';

interface RoomCardProps {
  room: Room;
}

export default function RoomCard({ room }: RoomCardProps) {
  const navigate = useNavigate();

  const statusColor: Record<string, string> = {
    WAITING: 'bg-green-500/20 text-green-400',
    PLAYING: 'bg-yellow-500/20 text-yellow-400',
    CLOSED: 'bg-gray-500/20 text-gray-400',
  };

  const statusLabel: Record<string, string> = {
    WAITING: '等待中',
    PLAYING: '游戏中',
    CLOSED: '已结束',
  };

  const currentCount = room.playerCount ?? 0;
  const maxCount = room.config?.maxPlayers ?? 6;
  const isFull = currentCount >= maxCount;

  const handleJoin = () => {
    if (room.status === 'WAITING' && !isFull) {
      navigate(`/rooms/${room.id}`);
    }
  };

  return (
    <div className="card-hover p-5 flex flex-col gap-3 group">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-base truncate group-hover:text-primary transition-colors">
            {room.roomName}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Crown size={12} className="text-yellow-500" />
            <span className="text-xs text-gray-400 truncate">{room.ownerNickname || room.owner?.nickname || '???'}</span>
          </div>
        </div>
        <span className={`badge ${statusColor[room.status] || 'bg-gray-500/20 text-gray-400'}`}>
          {statusLabel[room.status] || room.status}
        </span>
      </div>

      {/* Player count */}
      <div className="flex items-center gap-2 text-sm">
        <Users size={14} className="text-secondary" />
        <span className="text-gray-300">
          <span className={isFull ? 'text-accent' : 'text-secondary'}>
            {currentCount}
          </span>
          <span className="text-gray-500"> / {maxCount}</span>
        </span>
      </div>

      {/* Config badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className="badge-primary">
          <Swords size={10} className="mr-1" />
          {room.config?.spyCount ?? 1} 卧底
        </span>
        <span className="badge-secondary">
          {room.config?.maxRounds ?? 3} 轮
        </span>
        {room.config?.hasBlank && (
          <span className="badge-accent">白板</span>
        )}
      </div>

      {/* Join button */}
      <button
        onClick={handleJoin}
        disabled={room.status !== 'WAITING' || isFull}
        className={`w-full mt-auto py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
          room.status !== 'WAITING' || isFull
            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
            : 'btn-primary'
        }`}
      >
        {room.status === 'PLAYING'
          ? '游戏中'
          : isFull
          ? '已满员'
          : '加入房间'}
      </button>
    </div>
  );
}
