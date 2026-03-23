import React, { useEffect, useState } from 'react';
import {
  History,
  Trophy,
  Target,
  Filter,
  ChevronRight,
  TrendingUp,
  Shield,
  Swords,
} from 'lucide-react';
import { historyApi } from '../services/api';
import type { GameHistory, UserStats } from '../types';

export default function HistoryPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [histories, setHistories] = useState<GameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'win' | 'lose'>('all');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [statsRes, historyRes] = await Promise.all([
          historyApi.getStats(),
          historyApi.list({ result: filter === 'all' ? undefined : filter }),
        ]);
        setStats(statsRes.stats);
        setHistories(historyRes.games);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <History size={28} className="text-primary" />
          历史记录
        </h1>
        <p className="text-gray-500 text-sm mt-1">查看你的游戏战绩和历史记录</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Target size={16} className="text-primary" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{stats.totalGames}</p>
            <p className="text-xs text-gray-500 mt-0.5">总场次</p>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <TrendingUp size={16} className="text-green-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.winRate.toFixed(0)}
              <span className="text-sm text-gray-500">%</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">总胜率</p>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Shield size={16} className="text-blue-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.civilian.winRate.toFixed(0)}
              <span className="text-sm text-gray-500">%</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              平民胜率 ({stats.civilian.wins}/{stats.civilian.total})
            </p>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                <Swords size={16} className="text-red-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.spy.winRate.toFixed(0)}
              <span className="text-sm text-gray-500">%</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              卧底胜率 ({stats.spy.wins}/{stats.spy.total})
            </p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} className="text-gray-500" />
        {[
          { key: 'all' as const, label: '全部' },
          { key: 'win' as const, label: '胜利' },
          { key: 'lose' as const, label: '失败' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === tab.key
                ? 'bg-primary/20 text-primary'
                : 'text-gray-500 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* History list */}
      {histories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <History size={48} className="text-gray-700 mb-3" />
          <p className="text-gray-500">暂无历史记录</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-6 gap-4 px-4 py-3 bg-darker/50 border-b border-white/5 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div>时间</div>
            <div>Agent</div>
            <div>角色</div>
            <div>词语</div>
            <div>结果</div>
            <div></div>
          </div>

          {/* Rows */}
          {histories.map((item) => (
            <div
              key={item.gameId}
              className="grid grid-cols-1 sm:grid-cols-6 gap-2 sm:gap-4 px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors items-center"
            >
              <div className="text-sm text-gray-400">
                {new Date(item.startedAt).toLocaleDateString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="text-sm text-white truncate">{item.agentName}</div>
              <div>
                <span className={`text-sm font-medium ${roleColors[item.role] || 'text-gray-400'}`}>
                  {roleLabels[item.role] || item.role}
                </span>
              </div>
              <div className="text-sm text-gray-300">{item.word || '-'}</div>
              <div>
                <span
                  className={`badge text-[10px] ${
                    item.isWin
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {item.isWin ? '胜利' : '失败'}
                </span>
              </div>
              <div className="text-right">
                <button
                  onClick={() => window.location.href = `/games/${item.gameId}/result`}
                  className="text-gray-500 hover:text-primary transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
