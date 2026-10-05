import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, HostPermissionRequired } from '../lib/ai';

const ai = { provider: 'openai' as const, apiKey: 'test-only', baseUrl: 'http://localhost:11434/v1/', model: 'test' };
const messages = [{ role: 'user' as const, content: 'original question' }];

afterEach(() => vi.unstubAllGlobals());

function setup(granted: boolean) {
  const contains = vi.fn().mockResolvedValue(granted);
  const request = vi.fn();
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: ' answer ' } }] }) });
  vi.stubGlobal('chrome', { permissions: { contains, request } });
  vi.stubGlobal('fetch', fetch);
  return { contains, request, fetch };
}

describe('OpenAI host permission', () => {
  it('reports the missing origin without prompting or sending a request, on repeated attempts', async () => {
    const mocks = setup(false);
    for (let i = 0; i < 2; i++) {
      await expect(chat(ai, messages)).rejects.toMatchObject({ name: 'HostPermissionRequired', origin: 'http://localhost:11434' });
    }
    expect(mocks.contains).toHaveBeenCalledWith({ origins: ['http://localhost:11434/*'] });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('resumes with the original payload once the origin is granted', async () => {
    const mocks = setup(false);
    await expect(chat(ai, messages)).rejects.toBeInstanceOf(HostPermissionRequired);
    mocks.contains.mockResolvedValue(true);
    await expect(chat(ai, messages)).resolves.toBe('answer');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith('http://localhost:11434/v1/chat/completions', expect.objectContaining({
      body: expect.stringContaining('original question'),
    }));
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('uses the statically granted default endpoint without prompting', async () => {
    const mocks = setup(true);
    await expect(chat({ ...ai, baseUrl: '' }, messages)).resolves.toBe('answer');
    expect(mocks.contains).toHaveBeenCalledWith({ origins: ['https://api.openai.com/*'] });
    expect(mocks.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.anything());
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
