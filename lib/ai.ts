import Anthropic from '@anthropic-ai/sdk';
import type { AiSettings } from './types';

export const DEFAULT_MODELS: Record<AiSettings['provider'], string> = {
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-5',
};

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export const TUTOR_SYSTEM_PROMPT =
  'You are a concise algorithm tutor helping someone practice LeetCode. Answer in English using markdown. ' +
  'Keep code terms as-is. When asked for a HINT at a given level, reveal ONLY that level and never more: ' +
  'level 1/4 = general direction only (no data structure, no algorithm name); ' +
  'level 2/4 = key observation and the data structure/technique to use; ' +
  'level 3/4 = step-by-step approach or pseudocode (no full code); ' +
  'level 4/4 = complete walkthrough with code. ' +
  'When explaining code, cover: the idea, what each key part does, time/space complexity, and pitfalls.';

/** Multi-turn chat; messages is an ordered sequence of user/assistant turns */
export async function chat(ai: AiSettings, messages: ChatMsg[]): Promise<string> {
  if (!ai.apiKey) throw new Error('No API key configured — add one in the settings below.');
  const model = ai.model.trim() || DEFAULT_MODELS[ai.provider];
  return ai.provider === 'anthropic'
    ? chatViaAnthropic(ai, model, messages)
    : chatViaOpenAi(ai, model, messages);
}

async function chatViaAnthropic(ai: AiSettings, model: string, messages: ChatMsg[]): Promise<string> {
  const client = new Anthropic({
    apiKey: ai.apiKey,
    baseURL: ai.baseUrl.trim() || undefined,
    dangerouslyAllowBrowser: true, // BYOK: key is supplied by the user and stored locally
  });
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: TUTOR_SYSTEM_PROMPT,
    messages,
  });
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('\n')
    .trim();
}

async function chatViaOpenAi(ai: AiSettings, model: string, messages: ChatMsg[]): Promise<string> {
  const base = (ai.baseUrl.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: TUTOR_SYSTEM_PROMPT }, ...messages],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('Unexpected API response shape');
  return text.trim();
}
