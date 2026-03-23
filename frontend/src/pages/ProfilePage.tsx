import React, { useState, useEffect } from 'react';
import {
  User,
  Save,
  Key,
  Bot,
  Trophy,
  Shield,
  Swords,
  Eye,
  EyeOff,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { historyApi } from '../services/api';
import type { UserStats } from '../types';
import { AVATAR_PRESETS } from '../types';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();

  const [nickname, setNickname] = useState(user?.nickname || '');
  const [avatar, setAvatar] = useState(user?.avatarUrl || '🤖');
  const [editingNickname, setEditingNickname] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    historyApi.getStats().then((res) => setStats(res.stats)).catch(console.error);
  }, []);

  const handleSaveNickname = async () => {
    if (!nickname.trim()) return;
    try {
      await updateUser({ nickname: nickname.trim() });
      setEditingNickname(false);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSaveAvatar = async () => {
    try {
      await updateUser({ avatar_url: avatar });
      setEditingAvatar(false);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <User size={28} className="text-primary" />
          个人中心
        </h1>
        <p className="text-gray-500 text-sm mt-1">管理你的个人信息和设置</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile card */}
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">个人信息</h2>

          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-4xl border border-white/10">
              {avatar}
            </div>
            {editingAvatar ? (
              <div className="animate-fade-in">
                <div className="flex flex-wrap gap-2 justify-center mb-2">
                  {AVATAR_PRESETS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setAvatar(emoji)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${
                        avatar === emoji
                          ? 'bg-primary/30 border-2 border-primary scale-110'
                          : 'bg-darker border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 justify-center">
                  <button onClick={handleSaveAvatar} className="btn-primary py-1.5 px-3 text-xs">
                    <Check size={12} className="mr-1 inline" />
                    保存
                  </button>
                  <button onClick={() => { setEditingAvatar(false); setAvatar(user?.avatarUrl || '🤖'); }} className="btn-secondary py-1.5 px-3 text-xs">
                    <X size={12} className="mr-1 inline" />
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingAvatar(true)}
                className="text-xs text-primary hover:underline"
              >
                更换头像
              </button>
            )}
          </div>

          {/* Nickname */}
          <div>
            <label className="label-text">昵称</label>
            {editingNickname ? (
              <div className="flex gap-2 animate-fade-in">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="input-dark flex-1"
                  maxLength={20}
                />
                <button onClick={handleSaveNickname} className="btn-primary py-0 px-3 text-xs">
                  <Check size={14} />
                </button>
                <button
                  onClick={() => {
                    setEditingNickname(false);
                    setNickname(user?.nickname || '');
                  }}
                  className="btn-secondary py-0 px-3 text-xs"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-white text-lg">{user?.nickname || user?.username}</span>
                <button
                  onClick={() => setEditingNickname(true)}
                  className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-primary transition-colors"
                >
                  <Edit3 size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Username (readonly) */}
          <div>
            <label className="label-text">用户名</label>
            <p className="text-gray-400 text-sm">{user?.username}</p>
          </div>
        </div>

        {/* Stats card */}
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <Trophy size={14} />
            战绩统计
          </h2>
          {stats ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-darker rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{stats.totalGames}</p>
                <p className="text-xs text-gray-500">总场次</p>
              </div>
              <div className="bg-darker rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{stats.winRate.toFixed(0)}%</p>
                <p className="text-xs text-gray-500">总胜率</p>
              </div>
              <div className="bg-darker rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-blue-400">
                  {stats.civilian.wins}/{stats.civilian.total}
                </p>
                <p className="text-xs text-gray-500">
                  <Shield size={10} className="inline mr-0.5" />
                  平民胜率 {stats.civilian.winRate.toFixed(0)}%
                </p>
              </div>
              <div className="bg-darker rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-red-400">
                  {stats.spy.wins}/{stats.spy.total}
                </p>
                <p className="text-xs text-gray-500">
                  <Swords size={10} className="inline mr-0.5" />
                  卧底胜率 {stats.spy.winRate.toFixed(0)}%
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">暂无数据</p>
          )}

          {/* Best agent */}
          {stats?.bestAgent && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Bot size={12} />
                最佳 Agent
              </h3>
              <div className="flex items-center gap-2 py-1.5">
                <span className="w-5 text-xs font-bold text-center text-yellow-400">
                  🏆
                </span>
                <span className="text-sm text-white truncate flex-1">{stats.bestAgent.agentName}</span>
                <span className="text-xs text-green-400 font-mono">
                  {stats.bestAgent.winRate.toFixed(0)}%
                </span>
                <span className="text-[10px] text-gray-600">
                  {stats.bestAgent.gamesPlayed}场
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
