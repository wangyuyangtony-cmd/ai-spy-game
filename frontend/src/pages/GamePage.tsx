import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore, type EliminationInfo, type VoteSummaryItem, type ConfirmNeeded } from '../stores/gameStore';
import { useAuthStore } from '../stores/authStore';
import { connectSocket } from '../services/socket';
import PlayerSeat from '../components/PlayerSeat';
import SpeechBubble from '../components/SpeechBubble';
import GameInfoPanel from '../components/GameInfoPanel';
import {
  MessageSquare,
  Vote as VoteIcon,
  Trophy,
  AlertTriangle,
  Swords,
  ArrowRight,
  Skull,
  Radio,
  ChevronDown,
  ShieldCheck,
  Clock,
  Play,
} from 'lucide-react';
import type { Speech, Vote, GamePlayer, GamePhase } from '../types';

// ==================== Feed Item Types ====================

type FeedItem =
  | { type: 'round_divider'; round: number; key: string }
  | { type: 'speech'; round: number; key: string; speech: Speech; isMyAgent: boolean; player: GamePlayer | undefined }
  | { type: 'vote_phase'; round: number; key: string }
  | { type: 'votes'; round: number; key: string; votes: Vote[]; players: GamePlayer[] }
  | { type: 'elimination'; round: number; key: string; info: EliminationInfo; voteSummary: VoteSummaryItem[]; player: GamePlayer | undefined }
  | { type: 'game_end'; key: string; result: string };

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const {
    game,
    currentRound,
    phase,
    currentSpeakerIndex,
    currentSpeakerName,
    winner,
    isLoading,
    ownerId,
    confirmNeeded,
    roundSpeeches,
    roundVotes,
    roundEliminations,
    roundVoteSummaries,
    roundVotingStarted,
    fetchGame,
    restoreFromReplay,
    listenGameEvents,
    joinRoom,
    sendConfirmation,
    reset,
  } = useGameStore();

  const feedEndRef = useRef<HTMLDivElement>(null);
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const [showElimination, setShowElimination] = useState(false);
  const [latestElimination, setLatestElimination] = useState<EliminationInfo | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // ==================== Effects ====================

  // 1. Set up socket listeners FIRST (before any data fetch) so no events are missed
  useEffect(() => {
    if (id) {
      connectSocket();
      const cleanup = listenGameEvents(id);
      return cleanup;
    }
  }, [id]);

  // 2. Fetch game data and restore historical rounds in parallel
  useEffect(() => {
    if (id) {
      // Run both fetches in parallel for faster loading
      Promise.all([
        fetchGame(id),
        restoreFromReplay(id),
      ]).catch(() => navigate('/'));
    }
    return () => reset();
  }, [id]);

  // 3. Join room channel once game data loads (needed for receiving events)
  useEffect(() => {
    if (game?.roomId) {
      joinRoom(game.roomId);
    }
  }, [game?.roomId]);

  // 4. Auto-scroll feed
  useEffect(() => {
    if (autoScroll) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [roundSpeeches, roundVotes, roundEliminations, currentRound, phase, autoScroll, confirmNeeded]);

  // 5. Show elimination overlay when a new elimination occurs
  useEffect(() => {
    const elimKeys = Object.keys(roundEliminations);
    if (elimKeys.length > 0) {
      const latestRound = Math.max(...elimKeys.map(Number));
      const elim = roundEliminations[latestRound];
      if (elim && elim !== latestElimination) {
        setLatestElimination(elim);
        setShowElimination(true);
        const timer = setTimeout(() => setShowElimination(false), 3500);
        return () => clearTimeout(timer);
      }
    }
  }, [roundEliminations]);

  // 6. Navigate to result after game ends
  useEffect(() => {
    if (winner && phase === 'finished') {
      const timer = setTimeout(() => {
        navigate(`/games/${id}/result`);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [winner, phase, id, navigate]);

  // 7. Detect manual scroll to disable auto-scroll
  useEffect(() => {
    const container = feedContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
      setAutoScroll(isNearBottom);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // ==================== Derived Data ====================

  const isOwner = useMemo(() => {
    return !!user?.id && !!ownerId && user.id === ownerId;
  }, [user?.id, ownerId]);

  const playerMap = useMemo(() => {
    const map = new Map<string, GamePlayer>();
    game?.players?.forEach((p) => map.set(p.gamePlayerId, p));
    return map;
  }, [game?.players]);

  const myPlayerIds = useMemo(() => {
    return new Set(
      game?.players?.filter((p) => p.userId === user?.id).map((p) => p.gamePlayerId) || []
    );
  }, [game?.players, user?.id]);

  const alivePlayers = useMemo(
    () => game?.players?.filter((p) => p.isAlive) || [],
    [game?.players]
  );

  const maxRounds = game?.config?.max_rounds ?? game?.config?.maxRounds ?? 10;

  // Find the current user's player for showing role info
  const myPlayer = useMemo(
    () => game?.players?.find((p) => p.userId === user?.id) || null,
    [game?.players, user?.id]
  );

  // Effective phase
  const effectivePhase: GamePhase = phase || (game?.status === 'FINISHED' ? 'finished' : 'speaking');

  // ==================== Handlers ====================

  const handleConfirm = useCallback(() => {
    if (!id || !confirmNeeded) return;
    sendConfirmation(id, confirmNeeded.confirmType);
  }, [id, confirmNeeded, sendConfirmation]);

  // ==================== Build Feed Items ====================

  const feedItems = useMemo(() => {
    const items: FeedItem[] = [];

    for (let round = 1; round <= currentRound; round++) {
      // Round divider
      items.push({ type: 'round_divider', round, key: `round-${round}` });

      // Speeches for this round
      const speeches = roundSpeeches[round] || [];
      speeches.forEach((s, i) => {
        const player = playerMap.get(s.playerId);
        items.push({
          type: 'speech',
          round,
          key: `speech-${round}-${i}`,
          speech: s,
          isMyAgent: myPlayerIds.has(s.playerId),
          player,
        });
      });

      // Voting phase marker
      if (roundVotingStarted[round]) {
        items.push({ type: 'vote_phase', round, key: `vote-phase-${round}` });
      }

      // Votes for this round
      const votes = roundVotes[round] || [];
      if (votes.length > 0) {
        items.push({
          type: 'votes',
          round,
          key: `votes-${round}`,
          votes,
          players: game?.players || [],
        });
      }

      // Elimination for this round
      const elimination = roundEliminations[round];
      if (elimination) {
        const player = playerMap.get(elimination.gamePlayerId);
        items.push({
          type: 'elimination',
          round,
          key: `elim-${round}`,
          info: elimination,
          voteSummary: roundVoteSummaries[round] || [],
          player,
        });
      }
    }

    // Game end
    if (winner) {
      items.push({ type: 'game_end', key: 'game-end', result: winner });
    }

    return items;
  }, [
    currentRound,
    roundSpeeches,
    roundVotes,
    roundVotingStarted,
    roundEliminations,
    roundVoteSummaries,
    winner,
    playerMap,
    myPlayerIds,
    game?.players,
  ]);

  // ==================== Loading State ====================

  if (isLoading || !game) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">加载游戏中...</p>
        </div>
      </div>
    );
  }

  // ==================== Phase Status ====================

  const phaseMessages: Record<string, string> = {
    speaking: `第 ${currentRound} 轮 · 发言中`,
    voting: `第 ${currentRound} 轮 · 投票中`,
    result: `第 ${currentRound} 轮 · 结算中`,
    finished: '游戏结束',
  };

  const phaseIcons: Record<string, React.ReactNode> = {
    speaking: <MessageSquare size={14} className="text-secondary" />,
    voting: <VoteIcon size={14} className="text-yellow-400" />,
    result: <AlertTriangle size={14} className="text-accent" />,
    finished: <Trophy size={14} className="text-yellow-400" />,
  };

  const phaseBgColors: Record<string, string> = {
    speaking: 'bg-secondary/10 border-secondary/20 text-secondary',
    voting: 'bg-yellow-400/10 border-yellow-400/20 text-yellow-400',
    result: 'bg-accent/10 border-accent/20 text-accent',
    finished: 'bg-gray-500/10 border-gray-500/20 text-gray-400',
  };

  // Confirmation button labels
  const confirmLabels: Record<string, string> = {
    pre_vote: '开始投票',
    post_vote: '继续下一轮',
  };

  // ==================== Render ====================

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
      {/* ---- Elimination Overlay ---- */}
      {showElimination && latestElimination && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="eliminate-flash absolute inset-0" />
          <div className="relative bg-dark/95 border border-red-500/30 rounded-2xl px-8 py-6 shadow-2xl shadow-red-500/20 animate-fade-in text-center">
            <div className="text-4xl mb-3">
              {playerMap.get(latestElimination.gamePlayerId)?.agentAvatar || '💀'}
            </div>
            <p className="text-red-400 text-lg font-bold mb-1">
              {latestElimination.playerName} 被淘汰！
            </p>
            <p className="text-gray-400 text-sm">
              身份：{' '}
              <span
                className={
                  latestElimination.role === 'SPY'
                    ? 'text-red-400 font-bold'
                    : latestElimination.role === 'BLANK'
                    ? 'text-gray-300 font-bold'
                    : 'text-blue-400 font-bold'
                }
              >
                {latestElimination.role === 'CIVILIAN'
                  ? '平民'
                  : latestElimination.role === 'SPY'
                  ? '卧底'
                  : '白板'}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* ---- Winner Overlay ---- */}
      {winner && phase === 'finished' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative animate-fade-in text-center">
            <div className="text-6xl mb-4">{winner === 'CIVILIAN_WIN' ? '🎉' : '🕵️'}</div>
            <h2
              className={`text-4xl font-bold mb-2 ${
                winner === 'CIVILIAN_WIN' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {winner === 'CIVILIAN_WIN' ? '平民胜利!' : '卧底胜利!'}
            </h2>
            <p className="text-gray-400">即将跳转到结果页面...</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ====================== Main Area (3 cols) ====================== */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* ---- Player Seats ---- */}
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
              {game.players.map((player) => (
                <PlayerSeat
                  key={player.gamePlayerId}
                  avatar={player.agentAvatar || '🤖'}
                  nickname={player.agentName || player.nickname}
                  isAlive={player.isAlive}
                  isSpeaking={currentSpeakerIndex === player.seatIndex}
                  isCurrentUser={myPlayerIds.has(player.gamePlayerId)}
                  seatIndex={player.seatIndex}
                  role={player.role}
                  showRole={effectivePhase === 'finished'}
                />
              ))}
            </div>
          </div>

          {/* ---- Live Game Feed ---- */}
          <div className="card flex flex-col relative" style={{ minHeight: '480px', maxHeight: '70vh' }}>
            {/* Feed Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <Radio size={14} className="text-red-400 animate-pulse" />
              <span className="text-sm font-medium text-gray-300">实时对局</span>
              <div className={`ml-2 px-2 py-0.5 rounded-full text-[11px] border ${phaseBgColors[effectivePhase] || phaseBgColors['speaking']}`}>
                {phaseMessages[effectivePhase] || '等待开始'}
              </div>
              <span className="text-xs text-gray-600 ml-auto">
                {Object.values(roundSpeeches).flat().length} 条发言
              </span>
            </div>

            {/* Feed Content */}
            <div
              ref={feedContainerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            >
              {/* Empty state */}
              {feedItems.length === 0 && !currentSpeakerIndex && (
                <div className="flex flex-col items-center justify-center h-full">
                  <Swords size={40} className="text-gray-700 mb-3" />
                  <p className="text-gray-600 text-sm">等待游戏开始...</p>
                  <p className="text-gray-700 text-xs mt-1">游戏开始后，发言和投票将在此实时显示</p>
                </div>
              )}

              {/* Feed items */}
              {feedItems.map((item) => renderFeedItem(item, playerMap))}

              {/* Owner Confirmation Banner (inline in feed) */}
              {confirmNeeded && (
                <ConfirmBanner
                  confirmNeeded={confirmNeeded}
                  isOwner={isOwner}
                  onConfirm={handleConfirm}
                />
              )}

              {/* Current speaker indicator (live) */}
              {currentSpeakerIndex !== null && effectivePhase === 'speaking' && (
                <div className="flex items-center gap-3 py-2 animate-fade-in">
                  <div className="w-9 h-9 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-lg speaking-pulse">
                    {game.players.find((p) => p.seatIndex === currentSpeakerIndex)?.agentAvatar || '🤖'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-secondary font-medium">
                      {currentSpeakerName ||
                        game.players.find((p) => p.seatIndex === currentSpeakerIndex)?.agentName ||
                        `${currentSpeakerIndex}号`}
                    </span>
                    <span className="text-sm text-gray-500">正在发言</span>
                    <div className="flex items-end gap-0.5 h-3 ml-1">
                      <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '4px', animationDelay: '0ms' }} />
                      <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '8px', animationDelay: '150ms' }} />
                      <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '12px', animationDelay: '300ms' }} />
                      <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '8px', animationDelay: '150ms' }} />
                      <div className="w-0.5 bg-secondary rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '4px', animationDelay: '0ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Voting in progress indicator */}
              {effectivePhase === 'voting' && roundVotes[currentRound]?.length === 0 && !confirmNeeded && (
                <div className="flex items-center justify-center gap-2 py-4 animate-fade-in">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-yellow-400/70">投票进行中...</span>
                </div>
              )}

              {/* Scroll anchor */}
              <div ref={feedEndRef} />
            </div>

            {/* Scroll-to-bottom button */}
            {!autoScroll && (
              <button
                onClick={() => {
                  feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  setAutoScroll(true);
                }}
                className="absolute bottom-2 right-4 bg-primary/80 hover:bg-primary text-white rounded-full p-2 shadow-lg transition-all"
              >
                <ChevronDown size={16} />
              </button>
            )}
          </div>
        </div>

        {/* ====================== Right Panel (1 col) ====================== */}
        <div className="lg:col-span-1 space-y-4">
          {/* Game Info */}
          <GameInfoPanel
            currentRound={currentRound || 0}
            maxRounds={maxRounds}
            phase={effectivePhase}
            aliveCount={alivePlayers.length}
            totalCount={game.players.length}
            myRole={myPlayer?.role || null}
            myWord={myPlayer?.word || null}
          />

          {/* Phase Status Card */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              {phaseIcons[effectivePhase] || phaseIcons['speaking']}
              <span className="text-sm font-medium text-gray-300">
                {phaseMessages[effectivePhase] || '等待中'}
              </span>
            </div>

            {/* Current speaker info */}
            {currentSpeakerIndex !== null && effectivePhase === 'speaking' && (
              <div className="pt-2 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center text-sm speaking-pulse">
                    {game.players.find((p) => p.seatIndex === currentSpeakerIndex)?.agentAvatar || '🤖'}
                  </div>
                  <div>
                    <span className="text-xs text-secondary font-medium">
                      {currentSpeakerName ||
                        game.players.find((p) => p.seatIndex === currentSpeakerIndex)?.agentName}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">正在发言</span>
                  </div>
                </div>
              </div>
            )}

            {/* Owner Confirmation in sidebar */}
            {confirmNeeded && (
              <div className="pt-2 mt-2 border-t border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck size={14} className="text-amber-400" />
                  <span className="text-xs font-medium text-amber-400">等待房主确认</span>
                </div>
                {isOwner ? (
                  <button
                    onClick={handleConfirm}
                    className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    <Play size={12} />
                    {confirmLabels[confirmNeeded.confirmType] || '确认继续'}
                  </button>
                ) : (
                  <p className="text-xs text-gray-500">等待房主操作...</p>
                )}
              </div>
            )}

            {/* Round progress */}
            {currentRound > 0 && (
              <div className="mt-3 pt-2 border-t border-white/5">
                <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                  <span>轮次进度</span>
                  <span>{currentRound} / {maxRounds}</span>
                </div>
                <div className="w-full h-1.5 bg-dark rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (currentRound / maxRounds) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Player List */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              玩家列表
            </h3>
            <div className="space-y-1.5">
              {game.players.map((player) => (
                <div
                  key={player.gamePlayerId}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all ${
                    !player.isAlive ? 'opacity-40' : ''
                  } ${myPlayerIds.has(player.gamePlayerId) ? 'bg-primary/5 border border-primary/10' : ''} ${
                    currentSpeakerIndex === player.seatIndex ? 'bg-secondary/10 border border-secondary/20' : ''
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm border ${
                      currentSpeakerIndex === player.seatIndex
                        ? 'border-secondary bg-secondary/20 speaking-pulse'
                        : 'border-white/10 bg-dark'
                    }`}
                  >
                    {player.agentAvatar || '🤖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-300 truncate block text-xs">
                      {player.agentName || player.nickname}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {currentSpeakerIndex === player.seatIndex && (
                      <span className="text-[10px] text-secondary animate-pulse">发言中</span>
                    )}
                    {!player.isAlive && (
                      <span className="text-[10px] text-red-500">淘汰</span>
                    )}
                    {effectivePhase === 'finished' && player.role && (
                      <span
                        className={`text-[10px] px-1 py-0.5 rounded ${
                          player.role === 'SPY'
                            ? 'bg-red-500/20 text-red-400'
                            : player.role === 'BLANK'
                            ? 'bg-gray-500/20 text-gray-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {player.role === 'CIVILIAN' ? '平民' : player.role === 'SPY' ? '卧底' : '白板'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Confirm Banner (Inline in feed) ====================

function ConfirmBanner({
  confirmNeeded,
  isOwner,
  onConfirm,
}: {
  confirmNeeded: ConfirmNeeded;
  isOwner: boolean;
  onConfirm: () => void;
}) {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - confirmNeeded.receivedAt) / 1000);
    return Math.max(0, confirmNeeded.timeout - elapsed);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - confirmNeeded.receivedAt) / 1000);
      const r = Math.max(0, confirmNeeded.timeout - elapsed);
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [confirmNeeded.receivedAt, confirmNeeded.timeout]);

  const confirmLabels: Record<string, string> = {
    pre_vote: '开始投票',
    post_vote: '继续下一轮',
  };

  const bgColor = confirmNeeded.confirmType === 'pre_vote'
    ? 'bg-amber-500/10 border-amber-500/30'
    : 'bg-indigo-500/10 border-indigo-500/30';

  const iconColor = confirmNeeded.confirmType === 'pre_vote'
    ? 'text-amber-400'
    : 'text-indigo-400';

  return (
    <div className={`rounded-xl border p-4 animate-fade-in ${bgColor}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${iconColor}`}>
          <ShieldCheck size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${iconColor} mb-1`}>
            {confirmNeeded.message}
          </p>

          {isOwner ? (
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={onConfirm}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
              >
                <Play size={14} />
                {confirmLabels[confirmNeeded.confirmType] || '确认继续'}
              </button>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock size={12} />
                <span>自动继续: {remaining}s</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-400">等待房主确认...</span>
              <div className="flex items-center gap-1 text-xs text-gray-600 ml-auto">
                <Clock size={11} />
                <span>{remaining}s</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Feed Item Renderer ====================

function renderFeedItem(
  item: FeedItem,
  playerMap: Map<string, GamePlayer>,
): React.ReactNode {
  switch (item.type) {
    case 'round_divider':
      return (
        <div key={item.key} className="flex items-center gap-3 py-2 select-none">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            <Swords size={12} className="text-primary" />
            <span className="text-xs font-bold text-primary">第 {item.round} 轮</span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        </div>
      );

    case 'speech':
      return (
        <div key={item.key} className="animate-fade-in">
          <SpeechBubble
            avatar={item.player?.agentAvatar || '🤖'}
            nickname={`${item.speech.seatIndex}号 ${item.speech.playerName}`}
            content={item.speech.content}
            isCurrentUser={item.isMyAgent}
            isStreaming={false}
            animateTyping={true}
          />
        </div>
      );

    case 'vote_phase':
      return (
        <div key={item.key} className="flex items-center gap-3 py-2 select-none animate-fade-in">
          <div className="flex-1 h-px bg-yellow-400/20" />
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/20">
            <VoteIcon size={12} className="text-yellow-400" />
            <span className="text-xs font-medium text-yellow-400">投票阶段</span>
          </div>
          <div className="flex-1 h-px bg-yellow-400/20" />
        </div>
      );

    case 'votes':
      return <VoteResultInline key={item.key} votes={item.votes} players={item.players} round={item.round} />;

    case 'elimination':
      return (
        <EliminationCard
          key={item.key}
          info={item.info}
          voteSummary={item.voteSummary}
          player={item.player}
        />
      );

    case 'game_end':
      return (
        <div key={item.key} className="animate-fade-in">
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-500/30 to-transparent" />
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-500/10 border border-gray-500/20">
              <Trophy size={12} className="text-yellow-400" />
              <span className="text-xs font-medium text-gray-400">游戏结束</span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-500/30 to-transparent" />
          </div>
          <div
            className={`text-center py-4 rounded-xl border ${
              item.result === 'CIVILIAN_WIN'
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}
          >
            <div className="text-3xl mb-2">{item.result === 'CIVILIAN_WIN' ? '🎉' : '🕵️'}</div>
            <p
              className={`text-lg font-bold ${
                item.result === 'CIVILIAN_WIN' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {item.result === 'CIVILIAN_WIN' ? '平民阵营获胜' : '卧底阵营获胜'}
            </p>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ==================== Inline Vote Result ====================

function VoteResultInline({
  votes,
  players,
  round,
}: {
  votes: Vote[];
  players: GamePlayer[];
  round: number;
}) {
  // Group votes by target
  const votesByTarget: Record<number, Vote[]> = {};
  votes.forEach((v) => {
    if (!votesByTarget[v.targetSeat]) votesByTarget[v.targetSeat] = [];
    votesByTarget[v.targetSeat].push(v);
  });

  // Sort by count descending
  const sortedTargets = Object.entries(votesByTarget)
    .sort((a, b) => b[1].length - a[1].length);

  const maxVotes = sortedTargets.length > 0 ? sortedTargets[0][1].length : 0;

  // Find player by seat index
  const getPlayer = (seatIndex: number) => players.find((p) => p.seatIndex === seatIndex);

  return (
    <div className="bg-dark/60 rounded-xl border border-white/5 p-3 animate-fade-in">
      <div className="flex items-center gap-2 mb-2.5">
        <VoteIcon size={13} className="text-yellow-400" />
        <span className="text-xs font-semibold text-gray-400">第 {round} 轮投票结果</span>
      </div>

      {/* Individual votes */}
      <div className="space-y-1 mb-3">
        {votes.map((vote, i) => {
          const voterPlayer = getPlayer(vote.voterSeat);
          const targetPlayer = getPlayer(vote.targetSeat);
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs py-0.5">
              <span className="w-5 h-5 rounded-full bg-dark border border-white/10 flex items-center justify-center text-[10px]">
                {voterPlayer?.agentAvatar || '🤖'}
              </span>
              <span className="text-gray-400 truncate max-w-[80px]">{vote.voterName}</span>
              <ArrowRight size={10} className="text-gray-600 flex-shrink-0" />
              <span className="w-5 h-5 rounded-full bg-dark border border-white/10 flex items-center justify-center text-[10px]">
                {targetPlayer?.agentAvatar || '🤖'}
              </span>
              <span className="text-gray-400 truncate max-w-[80px]">{vote.targetName}</span>
            </div>
          );
        })}
      </div>

      {/* Vote tally bar chart */}
      <div className="border-t border-white/5 pt-2 space-y-1">
        {sortedTargets.map(([seatStr, targetVotes]) => {
          const seatIndex = parseInt(seatStr);
          const player = getPlayer(seatIndex);
          const isMax = targetVotes.length === maxVotes;
          return (
            <div key={seatStr} className="flex items-center gap-2 text-xs">
              <span className="w-5 h-5 rounded-full bg-dark border border-white/10 flex items-center justify-center text-[10px]">
                {player?.agentAvatar || '🤖'}
              </span>
              <span className={`w-16 truncate ${isMax ? 'text-red-400 font-semibold' : 'text-gray-400'}`}>
                {targetVotes[0].targetName}
              </span>
              <div className="flex-1 h-2 bg-dark rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isMax ? 'bg-red-500/60' : 'bg-primary/40'
                  }`}
                  style={{ width: `${Math.max(10, (targetVotes.length / votes.length) * 100)}%` }}
                />
              </div>
              <span className={`text-xs font-bold min-w-[20px] text-right ${isMax ? 'text-red-400' : 'text-gray-500'}`}>
                {targetVotes.length}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Elimination Card ====================

function EliminationCard({
  info,
  voteSummary,
  player,
}: {
  info: EliminationInfo;
  voteSummary: VoteSummaryItem[];
  player: GamePlayer | undefined;
}) {
  const roleLabel = info.role === 'CIVILIAN' ? '平民' : info.role === 'SPY' ? '卧底' : '白板';
  const roleColor =
    info.role === 'SPY'
      ? 'text-red-400'
      : info.role === 'BLANK'
      ? 'text-gray-300'
      : 'text-blue-400';

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-lg relative">
          {player?.agentAvatar || '💀'}
          <div className="absolute -bottom-0.5 -right-0.5">
            <Skull size={12} className="text-red-500" />
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-red-400">
            {info.seatIndex}号 {info.playerName} 被淘汰
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">
              身份：<span className={`font-semibold ${roleColor}`}>{roleLabel}</span>
            </span>
            {info.word && (
              <span className="text-xs text-gray-500">
                词语：<span className="text-white font-medium">{info.word}</span>
              </span>
            )}
            <span className="text-xs text-gray-500">
              得票：<span className="text-red-400 font-semibold">{info.votesReceived}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
