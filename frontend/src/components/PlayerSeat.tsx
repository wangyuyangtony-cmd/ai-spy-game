import React from 'react';
import { X } from 'lucide-react';
import type { PlayerRole } from '../types';

interface PlayerSeatProps {
  avatar: string;
  nickname: string;
  isAlive: boolean;
  isSpeaking: boolean;
  isCurrentUser: boolean;
  seatIndex: number;
  role?: PlayerRole | string;
  showRole?: boolean;
}

export default function PlayerSeat({
  avatar,
  nickname,
  isAlive,
  isSpeaking,
  isCurrentUser,
  seatIndex,
  role,
  showRole,
}: PlayerSeatProps) {
  const roleColors: Record<string, string> = {
    CIVILIAN: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    SPY: 'bg-red-500/20 text-red-400 border-red-500/30',
    BLANK: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const roleLabels: Record<string, string> = {
    CIVILIAN: '平民',
    SPY: '卧底',
    BLANK: '白板',
  };

  return (
    <div className={`flex flex-col items-center gap-1.5 ${!isAlive ? 'opacity-40' : ''}`}>
      <div className="relative">
        {/* Avatar circle */}
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl
            transition-all duration-300 border-2 ${
              isSpeaking
                ? 'border-secondary speaking-pulse bg-secondary/10'
                : isCurrentUser
                ? 'border-primary bg-primary/10'
                : 'border-white/10 bg-dark'
            } ${!isAlive ? 'grayscale' : ''}`}
        >
          {avatar || '🤖'}
        </div>

        {/* Eliminated mark */}
        {!isAlive && (
          <div className="absolute inset-0 rounded-full flex items-center justify-center bg-red-900/40">
            <X size={28} className="text-red-500" strokeWidth={3} />
          </div>
        )}

        {/* Seat number - seatIndex is already 1-based from backend */}
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-dark border border-white/20 flex items-center justify-center text-[10px] text-gray-400">
          {seatIndex}
        </div>

        {/* Speaking indicator */}
        {isSpeaking && isAlive && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
            <div className="flex items-end gap-0.5 h-3">
              <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '4px', animationDelay: '0ms' }} />
              <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '8px', animationDelay: '150ms' }} />
              <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '12px', animationDelay: '300ms' }} />
              <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '8px', animationDelay: '150ms' }} />
              <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '4px', animationDelay: '0ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Nickname */}
      <span
        className={`text-xs font-medium max-w-[64px] truncate ${
          isCurrentUser ? 'text-primary' : 'text-gray-300'
        }`}
      >
        {nickname}
      </span>

      {/* Role badge */}
      {showRole && role && (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
            roleColors[role] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
          }`}
        >
          {roleLabels[role] || role}
        </span>
      )}
    </div>
  );
}
