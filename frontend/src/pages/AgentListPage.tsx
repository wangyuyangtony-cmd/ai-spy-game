import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, Edit3, Copy, Trash2, Cpu } from 'lucide-react';
import { agentApi } from '../services/api';
import type { Agent } from '../types';

export default function AgentListPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadAgents = async () => {
    try {
      const res = await agentApi.list();
      setAgents(res.agents);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleCreate = () => {
    navigate('/agents/new/edit');
  };

  const handleDuplicate = async (id: string) => {
    try {
      await agentApi.duplicate(id);
      loadAgents();
    } catch (err) {
      console.error('Failed to duplicate agent:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await agentApi.delete(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  const strategyLabels: Record<string, string> = {
    conservative: '保守型',
    aggressive: '激进型',
    analytical: '分析型',
    disguise: '伪装型',
    custom: '自定义',
  };

  const strategyColors: Record<string, string> = {
    conservative: 'badge-secondary',
    aggressive: 'badge-danger',
    analytical: 'badge-primary',
    disguise: 'badge-accent',
    custom: 'badge bg-gray-500/20 text-gray-400',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot size={28} className="text-primary" />
            我的 Agent
          </h1>
          <p className="text-gray-500 text-sm mt-1">管理你的 AI Agent，配置不同的策略和模型</p>
        </div>
        <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          创建 Agent
        </button>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-20 h-20 rounded-2xl bg-dark flex items-center justify-center mb-4">
            <Bot size={40} className="text-gray-700" />
          </div>
          <h3 className="text-gray-400 text-lg font-medium mb-2">暂无 Agent</h3>
          <p className="text-gray-600 text-sm mb-6">创建你的第一个 AI Agent 来参与游戏</p>
          <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            创建 Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="card-hover p-5 flex flex-col gap-3 group relative">
              {/* Top row */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-2xl border border-white/5">
                  {agent.avatar || '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold truncate group-hover:text-primary transition-colors">
                    {agent.name}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="badge-primary text-[10px] flex items-center gap-1">
                      <Cpu size={9} />
                      {agent.model || 'gpt-4o-mini'}
                    </span>
                    {agent.strategyTemplate && (
                      <span className={`${strategyColors[agent.strategyTemplate] || 'badge bg-gray-500/20 text-gray-400'} text-[10px]`}>
                        {strategyLabels[agent.strategyTemplate] || agent.strategyTemplate}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-gray-500 line-clamp-2 min-h-[32px]">
                {agent.description || '暂无描述'}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                <button
                  onClick={() => navigate(`/agents/${agent.id}/edit`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-primary hover:bg-primary/10 transition-all"
                >
                  <Edit3 size={13} />
                  编辑
                </button>
                <button
                  onClick={() => handleDuplicate(agent.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-secondary hover:bg-secondary/10 transition-all"
                >
                  <Copy size={13} />
                  复制
                </button>
                <button
                  onClick={() => setDeleteConfirm(agent.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <Trash2 size={13} />
                  删除
                </button>
              </div>

              {/* Delete confirmation */}
              {deleteConfirm === agent.id && (
                <div className="absolute inset-0 bg-dark/95 rounded-xl flex flex-col items-center justify-center gap-3 p-4 animate-fade-in">
                  <p className="text-sm text-gray-300 text-center">
                    确定删除 <span className="text-white font-medium">{agent.name}</span> 吗？
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(agent.id)}
                      className="btn-danger py-2 px-4 text-xs"
                    >
                      确认删除
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="btn-secondary py-2 px-4 text-xs"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
