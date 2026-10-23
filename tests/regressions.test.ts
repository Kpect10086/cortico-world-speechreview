import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type Server} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import type {WorldHost} from 'cortico/core/types.ts';
import {SpeechreviewWorld, englishBan} from '../src/world.ts';
import {SPEECHREVIEW_DEFAULTS} from '../src/config.ts';
import {ReviewSlots} from '../src/slots.ts';

const host = {store: {range: () => []}, reportUsage: () => {}, log: {info: () => {}, warn: () => {}}} as unknown as WorldHost;
type Reply = {allow: boolean; reason?: string; sanitizedText?: string; elapsedMs?: number};

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

async function provider(reply: (input: Record<string, unknown>, index: number) => Promise<Reply> | Reply) {
  const inputs: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const envelope = JSON.parse(body);
      const input = JSON.parse(envelope.messages[1].content) as Record<string, unknown>;
      inputs.push(input);
      const result = await reply(input, inputs.length);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({choices: [{message: {content: JSON.stringify(result)}}]}));
    })().catch(error => {res.writeHead(500); res.end(String(error));});
  });
  return {inputs, endpoint: await listen(server), stop: () => close(server)};
}

async function reviewer(endpoint: string, overrides = {}, key = 'test-key') {
  const cfg = {...SPEECHREVIEW_DEFAULTS, endpoint, model: 'test-model', port: 0, ...overrides};
  const world = new SpeechreviewWorld({cfg, secret: () => key});
  await world.start(host);
  const address = (world as unknown as {server: Server}).server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/review`;
  const review = (text: string, purpose = 'message') => fetch(url, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, purpose}),
  });
  return {cfg, world, url, review};
}

test('missing model or API key fails closed before contacting the provider', async () => {
  const api = await provider(() => ({allow: true}));
  try {
    for (const [overrides, key] of [[{model: '  '}, 'test-key'], [{}, '  ']] as const) {
      const app = await reviewer(api.endpoint, overrides, key);
      try {
        const response = await app.review('普通内容');
        assert.equal(response.status, 503);
        assert.equal((await response.json() as Reply).allow, false);
      } finally {await app.world.stop();}
    }
    assert.equal(api.inputs.length, 0);
  } finally {await api.stop();}
});

test('repair and replacement verification retain the configured semantic policy', async () => {
  const api = await provider((_input, index) => index === 1 ? {allow: false} : index === 2
    ? {allow: false, sanitizedText: '小A：（敏感话题）'} : {allow: true});
  const app = await reviewer(api.endpoint, {blockedTexts: '秘密代号'});
  try {
    const response = await app.review('小A：秘密代号', 'received');
    assert.equal(response.status, 200);
    assert.equal((await response.json() as Reply).sanitizedText, '小A：（敏感话题）');
    assert.equal(api.inputs.length, 3);
    for (const input of api.inputs) assert.deepEqual(input.semanticTerms, ['秘密代号']);
  } finally {await app.world.stop(); await api.stop();}
});

test('complete decision latency includes time waiting for a model slot', async () => {
  let releaseFirst!: () => void;
  let firstArrived!: () => void;
  const arrived = new Promise<void>(resolve => {firstArrived = resolve;});
  const gate = new Promise<void>(resolve => {releaseFirst = resolve;});
  const api = await provider(async (_input, index) => {
    if (index === 1) {firstArrived(); await gate;}
    return {allow: true};
  });
  const app = await reviewer(api.endpoint, {maxConcurrent: 1});
  try {
    const first = app.review('第一条');
    await arrived;
    const second = app.review('第二条');
    await delay(150);
    releaseFirst();
    await (await first).arrayBuffer();
    const result = await (await second).json() as Reply;
    assert.ok((result.elapsedMs ?? 0) >= 100, `Expected queue delay in elapsedMs, got ${result.elapsedMs}`);
  } finally {releaseFirst(); await app.world.stop(); await api.stop();}
});

test('failed listener startup clears the running status and permits retry', async () => {
  const occupied = createServer();
  await listen(occupied);
  const address = occupied.address();
  assert.ok(address && typeof address === 'object');
  const cfg = {...SPEECHREVIEW_DEFAULTS, port: address.port};
  const world = new SpeechreviewWorld({cfg, secret: () => ''});
  try {
    await assert.rejects(world.start(host), {code: 'EADDRINUSE'});
    assert.equal(world.webUi().badges?.[0].value, '未启动');
    await close(occupied);
    await world.start(host);
    assert.equal(world.webUi().badges?.[0].value, '已开启；故障拦截');
  } finally {await close(occupied); await world.stop();}
});

test('both configured English terms and input text use NFKC normalization', () => {
  assert.equal(englishBan('forbidden', ['ｆｏｒｂｉｄｄｅｎ']), 'ｆｏｒｂｉｄｄｅｎ');
  assert.equal(englishBan('class', ['ａｓｓ']), undefined);
});

test('a full memory backlog cannot reject a live request with a reserved slot available', async () => {
  const slots = new ReviewSlots(() => 2);
  const signal = new AbortController();
  const releaseMemory = await slots.acquire(true, signal.signal);
  const queued = Array.from({length: 64}, () => {
    const controller = new AbortController();
    return {controller, result: slots.acquire(true, controller.signal).then(release => {release();}, () => {})};
  });
  try {
    const releaseLive = await slots.acquire(false, signal.signal);
    releaseLive();
  } finally {
    for (const row of queued) row.controller.abort();
    releaseMemory();
    await Promise.all(queued.map(row => row.result));
  }
});

test('starting an already running world preserves its original listener', async () => {
  const app = await reviewer('http://127.0.0.1:1');
  try {
    await assert.rejects(app.world.start(host), /already started/);
    assert.equal((await (await app.review('filtered')).json() as Reply).allow, true);
  } finally {await app.world.stop();}
});
