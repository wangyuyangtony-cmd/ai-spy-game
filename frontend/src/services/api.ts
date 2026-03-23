import axios from 'axios';
import type {
  User,
  Agent,
  Room,
  RoomPlayer,
  RoomConfig,
  Game,
  GamePlayer,
  GameHistory,
  UserStats,
  WordPair,
  HistoryPagination,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401, unwrap axios envelope
api.interceptors.response.use(
  (response) => response.data, // Return backend JSON directly
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const msg = error.response?.data?.error || error.message || 'Network error';
    return Promise.reject(new Error(msg));
  }
);

// ==================== Conversion Helpers ====================

function mapUser(raw: any): User {
  return {
    id: raw.id,
    username: raw.username,
    nickname: raw.nickname,
    avatarUrl: raw.avatar_url ?? null,
    createdAt: raw.created_at || '',
    updatedAt: raw.updated_at || '',
  };
}

function mapAgent(raw: any): Agent {
  return {
    id: raw.id,
    userId: raw.user_id,
    name: raw.name,
    avatar: raw.avatar ?? null,
    description: raw.description ?? null,
    model: raw.model ?? null,
    systemPrompt: raw.system_prompt ?? null,
    temperature: raw.temperature ?? 0.7,
    topP: raw.top_p ?? 0.9,
    maxTokens: raw.max_tokens ?? 300,
    strategyTemplate: raw.strategy_template ?? null,
    createdAt: raw.created_at || '',
    updatedAt: raw.updated_at || '',
  };
}

function mapRoomConfig(raw: any): RoomConfig {
  return {
    maxPlayers: raw.max_players ?? 6,
    minPlayers: raw.min_players ?? 4,
    spyCount: raw.spy_count ?? 1,
    hasBlank: raw.has_blank ?? false,
    speechTimeLimit: raw.speech_time_limit ?? 60,
    voteTimeLimit: raw.vote_time_limit ?? 30,
    maxRounds: raw.max_rounds ?? 10,
    wordCategory: raw.word_category ?? null,
    wordDifficulty: raw.word_difficulty ?? null,
  };
}

function mapRoomPlayer(raw: any): RoomPlayer {
  return {
    roomPlayerId: raw.room_player_id,
    userId: raw.user_id,
    agentId: raw.agent_id,
    isReady: !!raw.is_ready,
    joinedAt: raw.joined_at || '',
    username: raw.username || '',
    nickname: raw.nickname || '',
    avatarUrl: raw.avatar_url ?? null,
    agentName: raw.agent_name || '',
    agentAvatar: raw.agent_avatar ?? null,
    agentDescription: raw.agent_description ?? null,
  };
}

function mapRoom(raw: any): Room {
  return {
    id: raw.id,
    roomName: raw.room_name,
    ownerId: raw.owner_id,
    status: raw.status,
    config: raw.config ? mapRoomConfig(raw.config) : mapRoomConfig({}),
    createdAt: raw.created_at || '',
    updatedAt: raw.updated_at || '',
    ownerUsername: raw.owner_username,
    ownerNickname: raw.owner_nickname,
    ownerAvatarUrl: raw.owner_avatar_url,
    playerCount: raw.player_count,
    owner: raw.owner ? {
      id: raw.owner.id,
      username: raw.owner.username,
      nickname: raw.owner.nickname,
      avatarUrl: raw.owner.avatar_url ?? null,
    } : undefined,
    players: raw.players ? raw.players.map(mapRoomPlayer) : undefined,
  };
}

function mapGamePlayer(raw: any): GamePlayer {
  return {
    gamePlayerId: raw.game_player_id,
    userId: raw.user_id,
    agentId: raw.agent_id,
    seatIndex: raw.seat_index,
    role: raw.role,
    word: raw.word ?? null,
    isAlive: !!raw.is_alive,
    eliminatedRound: raw.eliminated_round ?? null,
    agentConfigSnapshot: raw.agent_config_snapshot || {},
    username: raw.username || '',
    nickname: raw.nickname || '',
    avatarUrl: raw.avatar_url ?? null,
    agentName: raw.agent_name || '',
    agentAvatar: raw.agent_avatar ?? null,
  };
}

function mapWordPair(raw: any): WordPair {
  return {
    civilianWord: raw.civilian_word || '',
    spyWord: raw.spy_word || '',
  };
}

function mapGame(raw: any): Game {
  return {
    id: raw.id,
    roomId: raw.room_id,
    ownerId: raw.owner_id || null,
    status: raw.status,
    config: raw.config || {},
    wordPair: raw.word_pair ? mapWordPair(raw.word_pair) : { civilianWord: '', spyWord: '' },
    startedAt: raw.started_at || '',
    endedAt: raw.ended_at ?? null,
    result: raw.result ?? null,
    players: raw.players ? raw.players.map(mapGamePlayer) : [],
    currentRound: raw.current_round ?? null,
  };
}

function mapGameHistory(raw: any): GameHistory {
  return {
    gameId: raw.game_id,
    roomId: raw.room_id,
    roomName: raw.room_name,
    gameStatus: raw.game_status,
    result: raw.result,
    isWin: !!raw.is_win,
    role: raw.role,
    word: raw.word ?? null,
    wordPair: raw.word_pair ? mapWordPair(raw.word_pair) : { civilianWord: '', spyWord: '' },
    isAlive: !!raw.is_alive,
    eliminatedRound: raw.eliminated_round ?? null,
    seatIndex: raw.seat_index,
    agentId: raw.agent_id,
    agentName: raw.agent_name,
    startedAt: raw.started_at || '',
    endedAt: raw.ended_at ?? null,
  };
}

function mapUserStats(raw: any): UserStats {
  return {
    totalGames: raw.total_games ?? 0,
    totalWins: raw.total_wins ?? 0,
    winRate: raw.win_rate ?? 0,
    survivalRate: raw.survival_rate ?? 0,
    civilian: {
      total: raw.civilian?.total ?? 0,
      wins: raw.civilian?.wins ?? 0,
      winRate: raw.civilian?.win_rate ?? 0,
    },
    spy: {
      total: raw.spy?.total ?? 0,
      wins: raw.spy?.wins ?? 0,
      winRate: raw.spy?.win_rate ?? 0,
    },
    blank: {
      total: raw.blank?.total ?? 0,
      wins: raw.blank?.wins ?? 0,
      winRate: raw.blank?.win_rate ?? 0,
    },
    bestAgent: raw.best_agent ? {
      agentId: raw.best_agent.agent_id,
      agentName: raw.best_agent.agent_name,
      gamesPlayed: raw.best_agent.games_played,
      wins: raw.best_agent.wins,
      winRate: raw.best_agent.win_rate ?? 0,
    } : null,
  };
}

function mapHistoryPagination(raw: any): HistoryPagination {
  return {
    page: raw.page,
    limit: raw.limit,
    total: raw.total,
    totalPages: raw.total_pages,
  };
}

// ==================== Auth ====================
export const authApi = {
  register: async (data: { username: string; password: string; nickname?: string }): Promise<{ token: string; user: User }> => {
    const res = await api.post('/auth/register', data) as any;
    return { token: res.token, user: mapUser(res.user) };
  },

  login: async (data: { username: string; password: string }): Promise<{ token: string; user: User }> => {
    const res = await api.post('/auth/login', data) as any;
    return { token: res.token, user: mapUser(res.user) };
  },

  getMe: async (): Promise<{ user: User }> => {
    const res = await api.get('/auth/me') as any;
    return { user: mapUser(res.user) };
  },

  updateMe: async (data: { nickname?: string; avatar_url?: string }): Promise<{ user: User }> => {
    const res = await api.put('/auth/me', data) as any;
    return { user: mapUser(res.user) };
  },
};

// ==================== Agents ====================
export const agentApi = {
  list: async (): Promise<{ agents: Agent[] }> => {
    const res = await api.get('/agents') as any;
    return { agents: (res.agents || []).map(mapAgent) };
  },

  create: async (data: {
    name: string;
    avatar?: string | null;
    description?: string | null;
    model?: string | null;
    system_prompt?: string | null;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    strategy_template?: string | null;
  }): Promise<{ agent: Agent }> => {
    const res = await api.post('/agents', data) as any;
    return { agent: mapAgent(res.agent) };
  },

  get: async (id: string): Promise<{ agent: Agent }> => {
    const res = await api.get(`/agents/${id}`) as any;
    return { agent: mapAgent(res.agent) };
  },

  update: async (id: string, data: {
    name?: string;
    avatar?: string | null;
    description?: string | null;
    model?: string | null;
    system_prompt?: string | null;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    strategy_template?: string | null;
  }): Promise<{ agent: Agent }> => {
    const res = await api.put(`/agents/${id}`, data) as any;
    return { agent: mapAgent(res.agent) };
  },

  delete: (id: string) =>
    api.delete(`/agents/${id}`) as Promise<{ message: string }>,

  duplicate: async (id: string): Promise<{ agent: Agent }> => {
    const res = await api.post(`/agents/${id}/duplicate`) as any;
    return { agent: mapAgent(res.agent) };
  },
};

// ==================== Rooms ====================
export const roomApi = {
  list: async (params?: { search?: string; status?: string }): Promise<{ rooms: Room[] }> => {
    const res = await api.get('/rooms', { params }) as any;
    return { rooms: (res.rooms || []).map(mapRoom) };
  },

  create: async (data: {
    room_name: string;
    config?: any;
    agent_id?: string;
  }): Promise<{ room: Room; ownerPlayerId?: string }> => {
    const res = await api.post('/rooms', data) as any;
    return {
      room: mapRoom(res.room),
      ownerPlayerId: res.owner_player_id,
    };
  },

  get: async (id: string): Promise<{ room: Room }> => {
    const res = await api.get(`/rooms/${id}`) as any;
    return { room: mapRoom(res.room) };
  },

  /** Join with an agent. A user can call this multiple times with different agents. */
  join: async (id: string, data?: { agent_id?: string; password?: string }): Promise<{ message: string; roomPlayerId: string }> => {
    const res = await api.post(`/rooms/${id}/join`, data) as any;
    return { message: res.message, roomPlayerId: res.room_player_id };
  },

  /** Leave. If room_player_id is given, removes only that agent slot; otherwise removes all user's agents. */
  leave: async (id: string, roomPlayerId?: string): Promise<{ message: string }> => {
    const body = roomPlayerId ? { room_player_id: roomPlayerId } : {};
    return api.post(`/rooms/${id}/leave`, body) as Promise<{ message: string }>;
  },

  /** Ready. If room_player_id is given, toggles only that slot; otherwise toggles all. */
  ready: async (id: string, roomPlayerId?: string): Promise<{ is_ready: boolean }> => {
    const body = roomPlayerId ? { room_player_id: roomPlayerId } : {};
    return api.post(`/rooms/${id}/ready`, body) as Promise<{ is_ready: boolean }>;
  },

  start: async (id: string): Promise<{ message: string; gameId: string }> => {
    const res = await api.post(`/rooms/${id}/start`) as any;
    return { message: res.message, gameId: res.game_id };
  },

  /** Get active games the current user is participating in. */
  myActive: async (): Promise<{ activeGames: any[] }> => {
    const res = await api.get('/rooms/my-active') as any;
    return { activeGames: res.active_games || [] };
  },

  /** Remove a specific agent slot from the room. */
  removeAgent: (id: string, roomPlayerId: string) =>
    api.post(`/rooms/${id}/remove-agent/${roomPlayerId}`) as Promise<{ message: string }>,

  kick: (id: string, userId: string) =>
    api.post(`/rooms/${id}/kick/${userId}`) as Promise<{ message: string }>,
};

// ==================== Games ====================
export const gameApi = {
  get: async (id: string): Promise<{ game: Game }> => {
    const res = await api.get(`/games/${id}`) as any;
    return { game: mapGame(res.game) };
  },

  getReplay: async (id: string): Promise<{ replay: any }> => {
    const res = await api.get(`/games/${id}/replay`) as any;
    const replay = res.replay;
    return {
      replay: {
        game: mapGame(replay.game),
        players: (replay.players || []).map(mapGamePlayer),
        rounds: (replay.rounds || []).map((r: any) => ({
          roundNumber: r.round_number,
          speeches: r.speeches || [],
          votes: r.votes || [],
          eliminatedPlayerId: r.eliminated_player_id ?? null,
        })),
      },
    };
  },
};

// ==================== History ====================
export const historyApi = {
  list: async (params?: { page?: number; limit?: number; result?: string }): Promise<{
    games: GameHistory[];
    pagination: HistoryPagination;
  }> => {
    const backendParams: any = {};
    if (params?.page) backendParams.page = params.page;
    if (params?.limit) backendParams.limit = params.limit;
    if (params?.result === 'win') backendParams.result = 'WIN';
    else if (params?.result === 'lose') backendParams.result = 'LOSE';
    else if (params?.result) backendParams.result = params.result;

    const res = await api.get('/history', { params: backendParams }) as any;
    return {
      games: (res.games || []).map(mapGameHistory),
      pagination: mapHistoryPagination(res.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 }),
    };
  },

  getStats: async (): Promise<{ stats: UserStats }> => {
    const res = await api.get('/history/stats') as any;
    return { stats: mapUserStats(res.stats) };
  },
};

export default api;
