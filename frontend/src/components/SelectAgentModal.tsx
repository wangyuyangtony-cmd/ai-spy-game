import React, { useEffect, useState } from 'react';
import { X, Bot, Check, AlertCircle } from 'lucide-react';
import { agentApi } from '../services/api';
import type { Agent } from '../types';

interface SelectAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (agent: Agent) => void;
  selectedAgentId?: string;
  /** Set of agent IDs to exclude (already in the room) */
  excludeAgentIds?: Set<string>;
}

export default function SelectAgentModal({
  isOpen,
  onClose,
  onSelect,
  selectedAgentId,
  excludeAgentIds,
}: SelectAgentModalProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      agentApi
        .list()
        .then((res) => setAgents(res.agents))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter out agents already in the room
  const availableAgents = excludeAgentIds
    ? agents.filter((a) => !excludeAgentIds.has(a.id))
    : agents;

  const excludedCount = agents.length - availableAgents.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 card p-6 animate-fade-in max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Bot size={20} className="text-primary" />
            选择 Agent
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Excluded notice */}
        {excludedCount > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex items-center gap-2">
            <AlertCircle size={14} />
            已有 {excludedCount} 个 Agent 在房间中，下方仅显示可添加的 Agent
          </div>
        )}

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : availableAgents.length === 0 ? (
            <div className="text-center py-12">
              <Bot size={48} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {agents.length === 0
                  ? '暂无 Agent'
                  : '所有 Agent 都已在房间中'}
              </p>
              <p className="text-gray-600 text-xs mt-1">
                {agents.length === 0
                  ? '请先创建一个 Agent'
                  : '可以去 Agent 列表创建更多'}
              </p>
            </div>
          ) : (
            availableAgents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;
              return (
                <button
                  key={agent.id}
                  onClick={() => onSelect(agent)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left ${
                    isSelected
                      ? 'bg-primary/20 border border-primary/30'
                      : 'bg-dark/50 border border-white/5 hover:border-white/10 hover:bg-dark'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl ${
                      isSelected ? 'bg-primary/30' : 'bg-darker'
                    }`}
                  >
                    {agent.avatar || '🤖'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{agent.name}</span>
                      {agent.model && (
                        <span className="badge-primary text-[10px]">{agent.model}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {agent.description || '暂无描述'}
                    </p>
                  </div>

                  {/* Check */}
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
