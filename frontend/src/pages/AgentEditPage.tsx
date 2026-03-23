import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Cpu, Sparkles, Thermometer } from 'lucide-react';
import { agentApi } from '../services/api';
import {
  STRATEGY_TEMPLATES,
  AVATAR_PRESETS,
  MODEL_OPTIONS,
} from '../types';

export default function AgentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🤖');
  const [description, setDescription] = useState('');
  const [strategyKey, setStrategyKey] = useState('conservative');
  const [model, setModel] = useState('gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = useState(STRATEGY_TEMPLATES[0].prompt);
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [maxTokens, setMaxTokens] = useState(200);

  useEffect(() => {
    if (!isNew && id) {
      agentApi
        .get(id)
        .then((res) => {
          const agent = res.agent;
          setName(agent.name);
          setAvatar(agent.avatar || '🤖');
          setDescription(agent.description || '');
          setModel(agent.model || 'gpt-4o-mini');
          setSystemPrompt(agent.systemPrompt || '');
          setTemperature(agent.temperature ?? 0.7);
          setTopP(agent.topP ?? 0.9);
          setMaxTokens(agent.maxTokens ?? 200);
          // Determine strategy key from strategyTemplate or systemPrompt
          const matchedTpl = STRATEGY_TEMPLATES.find(
            (t) => t.prompt && t.prompt === agent.systemPrompt
          );
          setStrategyKey(matchedTpl ? matchedTpl.key : (agent.strategyTemplate || 'custom'));
        })
        .catch(() => {
          setError('加载 Agent 失败');
        })
        .finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const handleStrategyChange = (key: string) => {
    setStrategyKey(key);
    const tpl = STRATEGY_TEMPLATES.find((t) => t.key === key);
    if (tpl && tpl.prompt) {
      setSystemPrompt(tpl.prompt);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请输入 Agent 名称');
      return;
    }
    if (!systemPrompt.trim()) {
      setError('请输入 System Prompt');
      return;
    }

    setSaving(true);
    setError('');

    // Send flat snake_case fields matching backend expectations
    const payload = {
      name: name.trim(),
      avatar,
      description: description.trim(),
      model,
      system_prompt: systemPrompt,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      strategy_template: strategyKey,
    };

    try {
      if (isNew) {
        await agentApi.create(payload);
      } else {
        await agentApi.update(id!, payload);
      }
      navigate('/agents');
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/agents')}
          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isNew ? '创建 Agent' : '编辑 Agent'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">配置你的 AI Agent 参数和策略</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column - Basic info */}
        <div className="lg:col-span-3 space-y-6">
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">基本信息</h2>

            {/* Name */}
            <div>
              <label className="label-text">名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="给 Agent 起个名字"
                className="input-dark"
                maxLength={20}
              />
            </div>

            {/* Avatar */}
            <div>
              <label className="label-text">头像</label>
              <div className="grid grid-cols-6 gap-2">
                {AVATAR_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
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
            </div>

            {/* Description */}
            <div>
              <label className="label-text">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简短描述这个 Agent 的特点..."
                className="input-dark h-24 resize-none"
                maxLength={200}
              />
            </div>
          </div>
        </div>

        {/* Middle column - Model & Prompt */}
        <div className="lg:col-span-6 space-y-6">
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
              <Cpu size={14} />
              模型与策略
            </h2>

            {/* Model select */}
            <div>
              <label className="label-text">AI 模型</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="input-dark appearance-none cursor-pointer"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-darker">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Strategy template */}
            <div>
              <label className="label-text flex items-center gap-2">
                <Sparkles size={14} className="text-accent" />
                策略模板
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {STRATEGY_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => handleStrategyChange(tpl.key)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all text-center ${
                      strategyKey === tpl.key
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-darker border border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300'
                    }`}
                  >
                    <div>{tpl.name}</div>
                    <div className="text-[10px] mt-0.5 text-gray-500">{tpl.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* System Prompt */}
            <div>
              <label className="label-text">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => {
                  setSystemPrompt(e.target.value);
                  if (strategyKey !== 'custom') setStrategyKey('custom');
                }}
                placeholder="输入 Agent 的系统提示词..."
                className="w-full bg-[#1a1f25] border border-white/10 text-gray-200 placeholder-gray-600
                  rounded-lg px-4 py-3 outline-none transition-all duration-300
                  focus:border-primary/50 focus:ring-2 focus:ring-primary/20
                  font-mono text-sm leading-relaxed resize-none"
                style={{ minHeight: '280px' }}
              />
              <p className="text-xs text-gray-600 mt-1">
                {systemPrompt.length} 字符 | 选择策略模板会自动填充，也可手动修改
              </p>
            </div>
          </div>
        </div>

        {/* Right column - Parameters */}
        <div className="lg:col-span-3 space-y-6">
          <div className="card p-5 space-y-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
              <Thermometer size={14} />
              模型参数
            </h2>

            {/* Temperature */}
            <div>
              <label className="label-text flex items-center justify-between">
                <span>Temperature</span>
                <span className="text-primary font-mono text-xs">{temperature.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>精确</span>
                <span>平衡</span>
                <span>创意</span>
              </div>
            </div>

            {/* Top P */}
            <div>
              <label className="label-text flex items-center justify-between">
                <span>Top P</span>
                <span className="text-secondary font-mono text-xs">{topP.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={topP}
                onChange={(e) => setTopP(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-secondary"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>0</span>
                <span>0.5</span>
                <span>1.0</span>
              </div>
            </div>

            {/* Max tokens */}
            <div>
              <label className="label-text flex items-center justify-between">
                <span>Max Tokens</span>
                <span className="text-accent font-mono text-xs">{maxTokens}</span>
              </label>
              <input
                type="range"
                min={50}
                max={500}
                step={10}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>50</span>
                <span>250</span>
                <span>500</span>
              </div>
            </div>

            {/* Parameter presets */}
            <div className="pt-2 border-t border-white/5">
              <p className="text-xs text-gray-500 mb-2">参数说明</p>
              <ul className="space-y-1.5 text-[11px] text-gray-600">
                <li><span className="text-primary">Temperature</span> - 越高越随机创意</li>
                <li><span className="text-secondary">Top P</span> - 核采样范围</li>
                <li><span className="text-accent">Max Tokens</span> - 发言最大长度</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={() => navigate('/agents')} className="btn-secondary">
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save size={16} />
              保存
            </>
          )}
        </button>
      </div>
    </div>
  );
}
