import Anthropic from '@anthropic-ai/sdk';
import type { AiSettings, ProblemMeta } from './types';

export const DEFAULT_MODELS: Record<AiSettings['provider'], string> = {
  anthropic: 'claude-opus-4-8',
  openai: 'gpt-5',
};

const SYSTEM_PROMPT =
  'You are a concise algorithm tutor helping someone practice LeetCode. ' +
  'Answer in English. Explain clearly: the idea/approach, what each key part does, ' +
  'time and space complexity, and common pitfalls. Keep code terms as-is.';

export interface ExplainRequest {
  problem: ProblemMeta | null;
  language: string;
  code: string;          // 完整代码（上下文）
  selection: string;     // 选中片段；空串表示解释整段代码
}

function buildUserPrompt(req: ExplainRequest): string {
  const header = req.problem
    ? `LeetCode problem ${req.problem.frontendId}. ${req.problem.title} (${req.problem.difficulty ?? 'unknown difficulty'})`
    : 'A LeetCode problem';
  if (req.selection.trim()) {
    return (
      `${header}\n\nFull ${req.language} code for context:\n\`\`\`${req.language}\n${req.code}\n\`\`\`\n\n` +
      `Explain specifically this selected excerpt (line-by-line where useful), in the context of the full solution:\n` +
      `\`\`\`${req.language}\n${req.selection}\n\`\`\``
    );
  }
  return `${header}\n\nExplain this ${req.language} solution:\n\`\`\`${req.language}\n${req.code}\n\`\`\``;
}

export async function explainCode(ai: AiSettings, req: ExplainRequest): Promise<string> {
  if (!ai.apiKey) throw new Error('No API key configured — add one in the settings below.');
  const model = ai.model.trim() || DEFAULT_MODELS[ai.provider];
  const prompt = buildUserPrompt(req);
  return ai.provider === 'anthropic'
    ? explainViaAnthropic(ai, model, prompt)
    : explainViaOpenAi(ai, model, prompt);
}

async function explainViaAnthropic(ai: AiSettings, model: string, prompt: string): Promise<string> {
  const client = new Anthropic({
    apiKey: ai.apiKey,
    baseURL: ai.baseUrl.trim() || undefined,
    dangerouslyAllowBrowser: true, // BYOK：key 由用户本人提供并存在本地
  });
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('\n')
    .trim();
}

async function explainViaOpenAi(ai: AiSettings, model: string, prompt: string): Promise<string> {
  const base = (ai.baseUrl.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
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
