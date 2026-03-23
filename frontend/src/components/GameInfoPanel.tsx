import React from 'react';
import { Swords, Users, Eye, Hash } from 'lucide-react';
import type { GamePhase, PlayerRole } from '../types';

interface GameInfoPanelProps {
  currentRound: number;
  maxRounds: number;
  phase: GamePhase | null;
  aliveCount: number;
  totalCount: number;
  myRole: PlayerRole | null;
  myWord: string | null;
}

export default function GameInfoPanel({
  currentRound,
  maxRounds,
  phase,
  aliveCount,
  totalCount,
  myRole,
  myWord,
}: GameInfoPanelProps) {
  const phaseLabels: Record<string, string> = {
    speaking: '发言阶段',
    voting: '投票阶段',
    result: '结算阶段',
    finished: '游戏结束',
  };

  const phaseColors: Record<string, string> = {
    speaking: 'text-secondary',
    voting: 'text-yellow-400',
    result: 'text-accent',
    finished: 'text-gray-400',
  };

  const roleLabels: Record<string, string> = {
    CIVILIAN: '平民',
    SPY: '卧底',
    BLANK: '白板',
  };

  const roleBgColors: Record<string, string> = {
    CIVILIAN: 'from-blue-600/30 to-blue-800/30 border-blue-500/30',
    SPY: 'from-red-600/30 to-red-800/30 border-red-500/30',
    BLANK: 'from-gray-600/30 to-gray-800/30 border-gray-500/30',
  };

  const roleTextColors: Record<string, string> = {
    CIVILIAN: 'text-blue-400',
    SPY: 'text-red-400',
    BLANK: 'text-gray-400',
  };

  return (
    <div className="card p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">游戏信息</h3>

      {/* Round */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
          <Hash size={16} className="text-primary" />
        </div>
        <div>
          <p className="text-xs text-gray-500">当前轮次</p>
          <p className="text-white font-semibold">
            {currentRound} <span className="text-gray-500 font-normal">/ {maxRounds}</span>
          </p>
        </div>
      </div>

      {/* Phase */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-secondary/20 flex items-center justify-center">
          <Swords size={16} className="text-secondary" />
        </div>
        <div>
          <p className="text-xs text-gray-500">当前阶段</p>
          <p className={`font-semibold ${phaseColors[phase || ''] || 'text-white'}`}>
            {phaseLabels[phase || ''] || '等待中'}
          </p>
        </div>
      </div>

      {/* Alive players */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center">
          <Users size={16} className="text-accent" />
        </div>
        <div>
          <p className="text-xs text-gray-500">存活人数</p>
          <p className="text-white font-semibold">
            {aliveCount} <span className="text-gray-500 font-normal">/ {totalCount}</span>
          </p>
        </div>
      </div>

      {/* My role & word */}
      {myRole && (
        <div className={`mt-2 p-3 rounded-xl bg-gradient-to-br border ${roleBgColors[myRole] || ''}`}>
          <div className="flex items-center gap-2 mb-2">
            <Eye size={14} className={roleTextColors[myRole] || 'text-gray-400'} />
            <span className="text-xs text-gray-400">我的角色</span>
          </div>
          <p className={`text-lg font-bold ${roleTextColors[myRole] || 'text-white'}`}>
            {roleLabels[myRole] || myRole}
          </p>
          {myWord && (
            <div className="mt-2 pt-2 border-t border-white/10">
              <span className="text-xs text-gray-500">我的词语</span>
              <p className="text-white font-bold text-lg mt-0.5">{myWord}</p>
            </div>
          )}
          {myRole === 'BLANK' && (
            <p className="text-xs text-gray-500 mt-1">白板没有词语，需要伪装成平民</p>
          )}
        </div>
      )}
    </div>
  );
}
