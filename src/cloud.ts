import type { WorldHost } from 'cortico/core/types.ts';

export interface CloudOptions {
  endpoint: string; model: string; apiKeySecret: string; timeoutMs: number; targetMs: number;
}

/** Complete decisions are timed at the client, including transport and parsing. */
export async function decide(cfg: CloudOptions, key: string, system: string, input: unknown,
  host: WorldHost | null, lane: string, signal?: AbortSignal, maxTokens = 240): Promise<{value: unknown; elapsedMs: number}> {
  if (!cfg.model.trim() || !key.trim()) throw new Error('Review model and API key are required');
  const started = performance.now();
  const deadline = AbortSignal.timeout(cfg.timeoutMs);
  const response = await fetch(cfg.endpoint.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}`},
    body: JSON.stringify({model: cfg.model.trim(), thinking: {type: 'disabled'}, stream: false,
      response_format: {type: 'json_object'}, max_tokens: maxTokens,
      messages: [{role: 'system', content: system}, {role: 'user', content: JSON.stringify(input)}]}),
  });
  if (!response.ok) throw new Error(`Decision HTTP ${response.status}`);
  const body = await response.json() as {
    choices?: Array<{message?: {content?: string}}>; usage?: Record<string, number>;
  };
  const usage = body.usage;
  if (usage) host?.reportUsage({promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0,
    cacheHitTokens: usage.prompt_cache_hit_tokens ?? 0, cacheMissTokens: usage.prompt_cache_miss_tokens ?? usage.prompt_tokens ?? 0},
    {model: cfg.model, label: lane});
  const value: unknown = JSON.parse(body.choices?.[0]?.message?.content ?? '');
  const elapsedMs = Math.round(performance.now() - started);
  host?.log.info(`${lane}完整决策 ${elapsedMs}ms`, {event: 'decision', durMs: elapsedMs,
    data: {targetMs: cfg.targetMs, withinTarget: elapsedMs <= cfg.targetMs}});
  return {value, elapsedMs};
}
