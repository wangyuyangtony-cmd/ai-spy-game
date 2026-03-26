import { config } from '../config';

/**
 * Message format for LLM chat completions.
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Configuration for a single LLM call.
 */
export interface LLMCallConfig {
  model?: string;
  system_prompt?: string;
  messages: LLMMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

/**
 * Result of an LLM call.
 */
export interface LLMResult {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================
// Mock word descriptions for generating realistic speech
// ============================================================
const MOCK_DESCRIPTIONS: string[] = [
  '这个东西在日常生活中很常见，大家应该都接触过',
  '它的形状比较有特点，很容易辨认',
  '很多人都喜欢它，是一种很受欢迎的东西',
  '它可以给人带来快乐和满足感',
  '通常在特定的场合或者季节会更常见',
  '它有不同的种类和品牌，选择很多',
  '价格从便宜到贵的都有，看品质而定',
  '小朋友和大人都会喜欢它',
  '它跟一些类似的东西容易混淆',
  '使用或享用它的时候会有一种特别的感觉',
  '在商店或者网上都很容易买到',
  '有些人可能每天都会用到它',
  '它的历史其实挺悠久的',
  '不同地方的人对它可能有不同的叫法',
  '它在社交场合中经常会出现',
];

const MOCK_SPY_HINTS: string[] = [
  '我觉得大家说的我都比较认同',
  '嗯，这个东西确实很常见',
  '我补充一下，它给人的感觉是温暖的',
  '对对对，而且它的用途很广泛',
  '我觉得它最大的特点是实用性强',
  '没错，很多人生活中离不开它',
  '我想说的是它有时候也可以是一种礼物',
  '它确实是一个好东西，值得推荐',
];

const MOCK_BLANK_HINTS: string[] = [
  '我对这个东西的理解可能跟大家不太一样',
  '嗯...让我想想该怎么描述',
  '我觉得它是一种很普遍的存在',
  '从某个角度来说，它确实很有意义',
  '我认为它反映了一种生活方式',
  '每个人对它的看法可能都不同',
];

/**
 * Generate a mock speech based on role, word, and round context.
 */
function generateMockSpeech(
  role: string,
  word: string | null,
  roundNumber: number,
  previousSpeeches: Array<{ playerName: string; content: string }>
): string {
  // Add a small delay to simulate thinking
  const baseDescriptions = role === 'CIVILIAN'
    ? MOCK_DESCRIPTIONS
    : role === 'SPY'
      ? MOCK_SPY_HINTS
      : MOCK_BLANK_HINTS;

  // Pick a description based on round and some randomness
  const idx = (roundNumber + Math.floor(Math.random() * baseDescriptions.length)) % baseDescriptions.length;
  let speech = baseDescriptions[idx];

  // For civilians with a word, add word-specific hints occasionally
  if (role === 'CIVILIAN' && word && Math.random() > 0.4) {
    const wordHints: Record<string, string[]> = {
      '苹果': ['它是圆的', '有红色和绿色的', '可以吃的水果'],
      '梨': ['它的形状有点像葫芦', '汁水很多', '秋天的时候特别好吃'],
      '猫': ['它很独立', '会发出呼噜声', '喜欢晒太阳'],
      '狗': ['它很忠诚', '会摇尾巴', '是人类的好朋友'],
      '篮球': ['需要用手的', '有个篮筐', '场上有五个人'],
      '足球': ['在草地上玩', '用脚踢的', '世界杯很出名'],
      '包子': ['有馅的', '蒸出来的', '早餐经常吃'],
      '饺子': ['有馅的', '过年会吃', '可以煮可以煎'],
      '手机': ['每天都离不开它', '可以打电话', '屏幕越来越大'],
      '平板': ['屏幕比较大', '可以看视频', '比电脑轻便'],
      '口红': ['颜色很多', '涂在嘴唇上', '是化妆品的一种'],
      '唇膏': ['保护嘴唇的', '冬天用得多', '有些有颜色有些没有'],
      '火锅': ['很多人一起吃', '有汤底', '可以涮各种菜'],
      '麻辣烫': ['一个人也能吃', '有汤', '可以自选食材'],
      '咖啡': ['提神醒脑', '有苦味', '可以加牛奶'],
      '奶茶': ['年轻人爱喝', '甜甜的', '有各种口味'],
    };

    const hints = wordHints[word];
    if (hints) {
      const hint = hints[Math.floor(Math.random() * hints.length)];
      speech = `${speech}，${hint}`;
    }
  }

  // In later rounds, reference previous speeches
  if (roundNumber > 1 && previousSpeeches.length > 0 && Math.random() > 0.5) {
    const referenced = previousSpeeches[Math.floor(Math.random() * previousSpeeches.length)];
    speech = `我同意${referenced.playerName}说的，${speech}`;
  }

  return speech;
}

/**
 * Generate a mock vote selection.
 * Returns the seat_index of the player to vote for.
 */
function generateMockVote(
  selfSeatIndex: number,
  alivePlayers: Array<{ seat_index: number; playerName: string }>,
  role: string
): number {
  // Filter out self
  const candidates = alivePlayers.filter(p => p.seat_index !== selfSeatIndex);

  if (candidates.length === 0) {
    return selfSeatIndex; // Edge case: should not happen
  }

  // Simple mock: random vote
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return chosen.seat_index;
}

/**
 * Call the LLM (or mock) and return the response content.
 */
export async function callLLM(callConfig: LLMCallConfig): Promise<LLMResult> {
  const {
    model = config.LLM_DEFAULT_MODEL,
    system_prompt,
    messages,
    temperature = 0.7,
    top_p = 0.9,
    max_tokens = 300,
  } = callConfig;

  // If mock mode, generate synthetic responses
  if (config.MOCK_MODE) {
    return callLLMMock(messages);
  }

  // Real LLM API call
  return callLLMReal({
    model,
    system_prompt,
    messages,
    temperature,
    top_p,
    max_tokens,
  });
}

/**
 * Mock LLM implementation - generates responses without any API call.
 */
async function callLLMMock(messages: LLMMessage[]): Promise<LLMResult> {
  // Simulate a small delay (100-500ms)
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));

  // Look at the last user message to determine if this is a speech or vote request
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const content = lastUserMsg?.content || '';

  if (content.includes('投票') || content.includes('vote') || content.includes('淘汰')) {
    // This is a vote request - extract seat numbers from the message
    const seatMatches = content.match(/\d+号/g);
    if (seatMatches && seatMatches.length > 0) {
      // Pick a random seat from mentioned seats
      const randomSeat = seatMatches[Math.floor(Math.random() * seatMatches.length)];
      return {
        content: `我投${randomSeat}`,
        model: 'mock',
      };
    }
    return {
      content: '我投1号',
      model: 'mock',
    };
  }

  // This is a speech request
  const speechIdx = Math.floor(Math.random() * MOCK_DESCRIPTIONS.length);
  return {
    content: MOCK_DESCRIPTIONS[speechIdx],
    model: 'mock',
  };
}

/**
 * Real LLM API call using OpenAI-compatible interface.
 * Includes retry logic with exponential backoff.
 */
async function callLLMReal(callConfig: LLMCallConfig & { model: string }): Promise<LLMResult> {
  const {
    model,
    system_prompt,
    messages,
    temperature,
    top_p,
    max_tokens,
  } = callConfig;

  if (!config.LLM_API_KEY) {
    console.warn('[LLM] No API key configured, falling back to mock mode');
    return callLLMMock(messages);
  }

  // Build messages array with optional system prompt
  const fullMessages: LLMMessage[] = [];
  if (system_prompt) {
    fullMessages.push({ role: 'system', content: system_prompt });
  }
  fullMessages.push(...messages);

  const maxRetries = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`[LLM] Retry attempt ${attempt}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.LLM_TIMEOUT);

    try {
      const response = await fetch(`${config.LLM_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          temperature,
          top_p,
          max_tokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LLM] API error (attempt ${attempt}):`, response.status, errorText);
        lastError = new Error(`API ${response.status}: ${errorText}`);
        
        // Don't retry on 4xx client errors (except 429 rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          break;
        }
        continue;
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || '';

      if (!content) {
        console.warn('[LLM] Empty response from API');
        lastError = new Error('Empty response');
        continue;
      }

      console.log(`[LLM] Success (model: ${data.model || model}, tokens: ${data.usage?.total_tokens || '?'})`);

      return {
        content,
        model: data.model || model,
        usage: data.usage,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      if (err.name === 'AbortError') {
        console.warn(`[LLM] Request timed out (attempt ${attempt})`);
        continue;
      }

      console.error(`[LLM] Request failed (attempt ${attempt}):`, err.message);
      continue;
    }
  }

  // All retries exhausted — fall back to mock
  console.warn('[LLM] All retries failed, falling back to mock. Last error:', lastError?.message);
  return callLLMMock(messages);
}

/**
 * Stream LLM response as an async generator (for future streaming support).
 */
export async function* callLLMStream(callConfig: LLMCallConfig): AsyncGenerator<string, void, unknown> {
  // For now, just call the non-streaming version and yield the full result
  // In a real implementation, this would use SSE/streaming API
  if (config.MOCK_MODE || !config.LLM_API_KEY) {
    const result = await callLLM(callConfig);
    // Simulate streaming by yielding character by character
    for (const char of result.content) {
      yield char;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return;
  }

  // Real streaming implementation
  const {
    model = config.LLM_DEFAULT_MODEL,
    system_prompt,
    messages,
    temperature = 0.7,
    top_p = 0.9,
    max_tokens = 300,
  } = callConfig;

  const fullMessages: LLMMessage[] = [];
  if (system_prompt) {
    fullMessages.push({ role: 'system', content: system_prompt });
  }
  fullMessages.push(...messages);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.LLM_TIMEOUT);

  try {
    const response = await fetch(`${config.LLM_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        temperature,
        top_p,
        max_tokens,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok || !response.body) {
      const result = await callLLMMock(messages);
      yield result.content;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('[LLM Stream] Error:', err.message);
    yield '我需要再想想...';
  }
}

// Export helper functions for the game engine
export { generateMockSpeech, generateMockVote };
