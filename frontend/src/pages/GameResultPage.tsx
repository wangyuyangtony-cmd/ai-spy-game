import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Trophy,
  ArrowLeft,
  Eye,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Vote,
  Home,
} from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import { gameApi } from '../services/api';
import type { PlayerRole } from '../types';

interface ReplayRound {
  roundNumber: number;
  speeches: Array<{
    id?: string;
    player_id?: string;
    playerId?: string;
    seat_index?: number;
    seatIndex?: number;
    player_name?: string;
    playerName?: string;
    content: string;
  }>;
  votes: Array<{
    voter_seat?: number;
    voterSeat?: number;
    voter_name?: string;
    voterName?: string;
    target_seat?: number;
    targetSeat?: number;
    target_name?: string;
    targetName?: string;
  }>;
  eliminatedPlayerId: string | null;
}

export default function GameResultPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { game, fetchGame, isLoading } = useGameStore();
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [rounds, setRounds] = useState<ReplayRound[]>([]);

  useEffect(() => {
    if (id) {
      if (!game) {
        fetchGame(id).catch(() => navigate('/'));
      }
      // Fetch replay data for rounds
      gameApi.getReplay(id).then((res) => {
        setRounds(res.replay.rounds || []);
      }).catch(console.error);
    }
  }, [id, game, fetchGame, navigate]);

  const toggleRound = (round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) {
        next.delete(round);
      } else {
        next.add(round);
      }
      return next;
    });
  };

  if (isLoading || !game) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isCivilianWin = game.result === 'CIVILIAN_WIN';

  const roleLabels: Record<string, string> = {
    CIVILIAN: '平民',
    SPY: '卧底',
    BLANK: '白板',
  };

  const roleColors: Record<string, string> = {
    CIVILIAN: 'text-blue-400',
    SPY: 'text-red-400',
    BLANK: 'text-gray-400',
  };

  const roleBgColors: Record<string, string> = {
    CIVILIAN: 'bg-blue-500/10 border-blue-500/20',
    SPY: 'bg-red-500/10 border-red-500/20',
    BLANK: 'bg-gray-500/10 border-gray-500/20',
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Winner banner */}
      <div
        className={`rounded-2xl p-8 mb-6 text-center relative overflow-hidden ${
          isCivilianWin
            ? 'bg-gradient-to-br from-green-900/30 to-green-800/10 border border-green-500/20'
            : 'bg-gradient-to-br from-red-900/30 to-red-800/10 border border-red-500/20'
        }`}
      >
        {/* Decorative glow */}
        <div
          className={`absolute inset-0 opacity-20 ${
            isCivilianWin
              ? 'bg-gradient-to-t from-green-500/20 to-transparent'
              : 'bg-gradient-to-t from-red-500/20 to-transparent'
          }`}
        />

        <div className="relative">
          <div className="text-6xl mb-4">{isCivilianWin ? '🎉' : '🕵️'}</div>
          <h1
            className={`text-4xl font-bold mb-2 ${
              isCivilianWin ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {isCivilianWin ? '平民胜利!' : '卧底胜利!'}
          </h1>
          <p className="text-gray-400">
            游戏共进行了 {rounds.length} 轮
          </p>
        </div>
      </div>

      {/* Word reveal */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Eye size={14} />
          词语揭晓
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
            <p className="text-xs text-blue-400 mb-1">平民词语</p>
            <p className="text-2xl font-bold text-white">{game.wordPair?.civilianWord || '???'}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-xs text-red-400 mb-1">卧底词语</p>
            <p className="text-2xl font-bold text-white">{game.wordPair?.spyWord || '???'}</p>
          </div>
        </div>
      </div>

      {/* Player roles */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">角色揭示</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {game.players.map((player) => (
            <div
              key={player.gamePlayerId || player.userId}
              className={`rounded-xl p-3 border text-center ${
                roleBgColors[player.role] || ''
              } ${!player.isAlive ? 'opacity-50' : ''}`}
            >
              <div className="text-2xl mb-1">{player.agentAvatar || '🤖'}</div>
              <p className="text-sm font-medium text-white truncate">{player.agentName || player.nickname}</p>
              <p className={`text-xs font-bold mt-0.5 ${roleColors[player.role] || 'text-gray-400'}`}>
                {roleLabels[player.role] || player.role}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {player.word || (player.role === 'BLANK' ? '无词语' : '')}
              </p>
              {!player.isAlive && (
                <p className="text-[10px] text-red-500 mt-0.5">已淘汰</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Round summaries */}
      {rounds.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">轮次摘要</h2>
          <div className="space-y-2">
            {rounds.map((round) => {
              const roundNum = round.roundNumber;
              const isExpanded = expandedRounds.has(roundNum);
              const speechList = round.speeches || [];
              const voteList = round.votes || [];

              return (
                <div key={roundNum} className="border border-white/5 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleRound(roundNum)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-bold text-sm">第 {roundNum} 轮</span>
                      <span className="text-xs text-gray-500">
                        {speechList.length} 条发言
                      </span>
                      {round.eliminatedPlayerId && (
                        <span className="badge-danger text-[10px]">
                          有淘汰
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-gray-500" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-500" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4 animate-fade-in border-t border-white/5">
                      {/* Speeches */}
                      <div className="pt-3">
                        <h4 className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                          <MessageSquare size={11} />
                          发言
                        </h4>
                        <div className="space-y-2">
                          {speechList.map((speech, si) => {
                            const name = speech.player_name || speech.playerName || '???';
                            return (
                              <div key={speech.id || `s-${si}`} className="flex gap-2 text-sm">
                                <div className="w-6 h-6 rounded-full bg-dark border border-white/10 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                                  🤖
                                </div>
                                <div>
                                  <span className="text-gray-400 text-xs">{name}:</span>
                                  <p className="text-gray-300 text-sm">{speech.content}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Votes */}
                      {voteList.length > 0 && (
                        <div>
                          <h4 className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                            <Vote size={11} />
                            投票
                          </h4>
                          <div className="space-y-1">
                            {voteList.map((vote, i) => {
                              const voterName = vote.voter_name || vote.voterName || '???';
                              const targetName = vote.target_name || vote.targetName || '???';
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                                  <span>{voterName}</span>
                                  <span className="text-gray-600">→</span>
                                  <span className="text-gray-300">{targetName}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="btn-primary flex items-center gap-2"
        >
          <Home size={16} />
          返回大厅
        </button>
        <button
          onClick={() => navigate(`/games/${id}`)}
          className="btn-secondary flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          查看回放
        </button>
      </div>
    </div>
  );
}
