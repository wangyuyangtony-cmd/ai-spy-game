// ==================== User ====================
export interface User {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==================== Agent ====================
export interface Agent {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  description: string | null;
  model: string | null;
  systemPrompt: string | null;
  temperature: number;
  topP: number;
  maxTokens: number;
  strategyTemplate: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==================== Room ====================
export type RoomStatus = 'WAITING' | 'PLAYING' | 'CLOSED';

export interface RoomConfig {
  maxPlayers: number;
  minPlayers?: number;
  spyCount: number;
  hasBlank: boolean;
  speechTimeLimit?: number;
  voteTimeLimit?: number;
  maxRounds: number;
  wordCategory?: string | null;
  wordDifficulty?: string | null;
}

export interface RoomPlayer {
  roomPlayerId: string;
  userId: string;
  agentId: string;
  isReady: boolean;
  joinedAt: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  agentName: string;
  agentAvatar: string | null;
  agentDescription: string | null;
}

export interface RoomOwner {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface Room {
  id: string;
  roomName: string;
  ownerId: string;
  status: RoomStatus;
  config: RoomConfig;
  createdAt: string;
  updatedAt: string;
  // Fields from list endpoint
  ownerUsername?: string;
  ownerNickname?: string;
  ownerAvatarUrl?: string | null;
  playerCount?: number;
  // Fields from detail endpoint
  owner?: RoomOwner;
  players?: RoomPlayer[];
}

// ==================== Game ====================
export type GamePhase = 'speaking' | 'voting' | 'result' | 'finished';
export type PlayerRole = 'CIVILIAN' | 'SPY' | 'BLANK';

export interface GamePlayer {
  gamePlayerId: string;
  userId: string;
  agentId: string;
  seatIndex: number;
  role: PlayerRole;
  word: string | null;
  isAlive: boolean;
  eliminatedRound: number | null;
  agentConfigSnapshot: any;
  username: string;
  nickname: string;
  avatarUrl?: string | null;
  agentName: string;
  agentAvatar: string | null;
}

export interface Speech {
  id?: string;
  round?: number;
  playerId: string;
  seatIndex: number;
  playerName: string;
  content: string;
  timestamp: string;
}

export interface Vote {
  voterSeat: number;
  voterName: string;
  targetSeat: number;
  targetName: string;
  voterId?: string;
  targetId?: string;
}

export interface VoteResult {
  round: number;
  votes: Vote[];
  eliminatedPlayerId: string | null;
  eliminatedPlayerNickname: string | null;
  isTie: boolean;
}

export interface GameRound {
  roundNumber: number;
  speeches: Speech[];
  votes: Vote[];
  eliminatedPlayerId: string | null;
}

export interface WordPair {
  civilianWord: string;
  spyWord: string;
}

export type GameStatus = 'PLAYING' | 'FINISHED';
export type WinnerSide = 'CIVILIAN_WIN' | 'SPY_WIN' | 'BLANK_WIN' | null;

export interface Game {
  id: string;
  roomId: string;
  ownerId: string | null;
  status: GameStatus;
  config: any;
  wordPair: WordPair;
  startedAt: string;
  endedAt: string | null;
  result: string | null;
  players: GamePlayer[];
  currentRound: any | null;
}

// ==================== Game State (realtime) ====================
export interface GameState {
  gameId: string;
  phase: GamePhase;
  currentRound: number;
  currentSpeakerIndex: number | null;
  alivePlayers: string[];
  speeches: Speech[];
  votes: Vote[];
  lastVoteResult: VoteResult | null;
  eliminatedPlayerId: string | null;
  winner: WinnerSide;
}

// ==================== User Stats ====================
export interface UserStats {
  totalGames: number;
  totalWins: number;
  winRate: number;
  survivalRate: number;
  civilian: {
    total: number;
    wins: number;
    winRate: number;
  };
  spy: {
    total: number;
    wins: number;
    winRate: number;
  };
  blank: {
    total: number;
    wins: number;
    winRate: number;
  };
  bestAgent: {
    agentId: string;
    agentName: string;
    gamesPlayed: number;
    wins: number;
    winRate: number;
  } | null;
}

// ==================== History ====================
export interface GameHistory {
  gameId: string;
  roomId: string;
  roomName: string;
  gameStatus: string;
  result: string;
  isWin: boolean;
  role: PlayerRole;
  word: string | null;
  wordPair: WordPair;
  isAlive: boolean;
  eliminatedRound: number | null;
  seatIndex: number;
  agentId: string;
  agentName: string;
  startedAt: string;
  endedAt: string | null;
}

export interface HistoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ==================== API Responses ====================
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== Socket Events ====================
export interface ServerToClientEvents {
  'room:updated': (data: { room_id: string }) => void;
  'room:user_joined': (data: { user_id: string; socket_id: string }) => void;
  'room:user_left': (data: { user_id: string; socket_id: string }) => void;
  'game:start': (data: any) => void;
  'game:round_start': (data: any) => void;
  'game:speech_phase_start': (data: any) => void;
  'game:player_speaking': (data: any) => void;
  'game:speech': (data: any) => void;
  'game:vote_phase_start': (data: any) => void;
  'game:votes': (data: any) => void;
  'game:elimination': (data: any) => void;
  'game:end': (data: any) => void;
  'game:confirm_needed': (data: any) => void;
  'game:confirm_resolved': (data: any) => void;
  'game:error': (data: { message: string; error?: string }) => void;
  'error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'room:join': (data: { room_id: string }) => void;
  'room:leave': (data: { room_id: string }) => void;
  'room:chat': (data: { room_id: string; message: string }) => void;
  'game:join': (data: { gameId: string }) => void;
  'game:owner_confirm': (data: { game_id: string; confirm_type: string }) => void;
}

// ==================== Strategy Templates ====================
export interface StrategyTemplate {
  key: string;
  name: string;
  description: string;
  prompt: string;
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    key: 'conservative',
    name: '保守型',
    description: '谨慎发言，跟随多数',
    prompt: '你是一个谨慎的谁是卧底玩家。发言时尽量简短，用模糊的描述。投票时倾向于跟随多数人的判断。不要暴露太多信息。',
  },
  {
    key: 'aggressive',
    name: '激进型',
    description: '主动质疑，果断判断',
    prompt: '你是一个积极主动的谁是卧底玩家。发言时要大胆质疑他人，指出矛盾之处，引导讨论方向。投票时基于你的分析果断做出判断。',
  },
  {
    key: 'analytical',
    name: '分析型',
    description: '逻辑推理，对比分析',
    prompt: '你是一个善于分析的谁是卧底玩家。仔细记录每个人的发言，对比不同人描述之间的差异，用逻辑推理找出可疑之人。发言时展示你的推理过程。',
  },
  {
    key: 'disguise',
    name: '伪装型',
    description: '擅长模仿，灵活切换',
    prompt: '你是一个擅长伪装的谁是卧底玩家。如果你是卧底，仔细听取他人发言，模仿平民的描述风格。如果你是平民，用足够明确的描述让同伴确认你的身份。',
  },
  {
    key: 'custom',
    name: '自定义',
    description: '自由编写提示词',
    prompt: '',
  },
];

// ==================== Avatar presets ====================
export const AVATAR_PRESETS = [
  '🤖', '🎭', '🦊', '🐱', '🐼', '🦉',
  '🎪', '🎯', '🎲', '🃏', '🧙', '👻',
];

// ==================== Model options ====================
export const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'deepseek-v3', label: 'DeepSeek V3' },
  { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
  { value: 'qwen-max', label: '通义千问 Max' },
  { value: 'glm-4', label: 'GLM-4' },
];
