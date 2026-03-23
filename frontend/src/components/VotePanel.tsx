import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { Vote, VoteResult } from '../types';

interface VotePanelProps {
  voteResult: VoteResult | null;
  votes: Vote[];
  playerAvatars: Record<string, string>;
}

export default function VotePanel({ voteResult, votes, playerAvatars }: VotePanelProps) {
  const displayVotes = voteResult?.votes || votes;

  if (displayVotes.length === 0) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">投票进行中...</h3>
        <div className="flex items-center justify-center py-6">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  // Group votes by target (using targetSeat as key since targetId may not exist)
  const votesByTarget: Record<string, Vote[]> = {};
  displayVotes.forEach((vote) => {
    const key = vote.targetId || `seat-${vote.targetSeat}`;
    if (!votesByTarget[key]) {
      votesByTarget[key] = [];
    }
    votesByTarget[key].push(vote);
  });

  // Sort by vote count descending
  const sortedTargets = Object.entries(votesByTarget).sort(
    (a, b) => b[1].length - a[1].length
  );

  return (
    <div className="card p-4 animate-fade-in">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        第 {voteResult?.round || '?'} 轮投票结果
      </h3>

      {/* Vote list */}
      <div className="space-y-2 mb-4">
        {displayVotes.map((vote, index) => (
          <div
            key={index}
            className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-dark border border-white/10 flex items-center justify-center text-sm">
              🤖
            </div>
            <span className="text-gray-300 truncate">{vote.voterName}</span>
            <ArrowRight size={14} className="text-gray-600 flex-shrink-0" />
            <div className="w-7 h-7 rounded-full bg-dark border border-white/10 flex items-center justify-center text-sm">
              🤖
            </div>
            <span className="text-gray-300 truncate">{vote.targetName}</span>
          </div>
        ))}
      </div>

      {/* Vote summary */}
      <div className="border-t border-white/5 pt-3">
        <h4 className="text-xs text-gray-500 mb-2">票数统计</h4>
        <div className="space-y-1.5">
          {sortedTargets.map(([targetKey, targetVotes]) => {
            const isEliminated = voteResult?.eliminatedPlayerId === targetKey ||
              (voteResult?.eliminatedPlayerId && targetVotes.some(v => v.targetId === voteResult.eliminatedPlayerId));
            return (
              <div
                key={targetKey}
                className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg ${
                  isEliminated ? 'bg-red-500/10 border border-red-500/20' : ''
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-dark border border-white/10 flex items-center justify-center text-xs">
                  🤖
                </div>
                <span className={`truncate ${isEliminated ? 'text-red-400' : 'text-gray-300'}`}>
                  {targetVotes[0].targetName}
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  <div
                    className={`h-2 rounded-full ${isEliminated ? 'bg-red-500' : 'bg-primary'}`}
                    style={{
                      width: `${Math.max(20, (targetVotes.length / displayVotes.length) * 80)}px`,
                    }}
                  />
                  <span className={`text-xs font-bold ${isEliminated ? 'text-red-400' : 'text-gray-400'}`}>
                    {targetVotes.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Result */}
      {voteResult && (
        <div className="mt-3 pt-3 border-t border-white/5">
          {voteResult.isTie ? (
            <p className="text-sm text-yellow-400 text-center">平票！本轮无人淘汰</p>
          ) : voteResult.eliminatedPlayerNickname ? (
            <p className="text-sm text-red-400 text-center">
              <span className="font-semibold">{voteResult.eliminatedPlayerNickname}</span> 被淘汰
            </p>
          ) : (
            <p className="text-sm text-gray-400 text-center">本轮无人淘汰</p>
          )}
        </div>
      )}
    </div>
  );
}
