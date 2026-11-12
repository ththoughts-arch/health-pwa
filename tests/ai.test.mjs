// 실행: npm test — Gemini 호출 재시도와 실패 분류 (가짜 fetch)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCoaching } from '../app/js/ai.js';
import { addDays, summarizeDay } from '../app/js/score.js';

const TODAY = '2026-11-12';

function data() {
  const wellnessByDate = {};
  for (let i = 40; i >= 0; i--) wellnessByDate[addDays(TODAY, -i)] = { sleepSecs: 25200, sleepScore: 75, hrv: 50, restingHR: 50 };
  const days = {};
  for (let i = 30; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    days[d] = summarizeDay({ date: d, wellnessByDate, activities: [] });
  }
  return {
    today: TODAY, days, activities: [], checkins: {}, supplements: [], strength: [], memos: [],
    settings: {}, keys: { geminiApiKey: 'K' }, exerciseCoach: null, dayGuide: null,
  };
}

const fb = { fs: { doc: () => ({}), setDoc: async () => {}, serverTimestamp: () => 0 }, db: {} };

// 재시도 대기(1.5초·4초)는 바로 넘기고, 응답 제한 타이머(수십 초)는 그대로 둔다
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms < 10000 ? 0 : ms, ...args);

// 요청한 형식(responseSchema)대로 채운 가짜 답
function ok(opts) {
  const props = Object.keys(JSON.parse(opts.body).generationConfig.responseSchema.properties);
  const out = Object.fromEntries(props.map((k) => [k, 'x']));
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] }));
}

function useFetch(handler) {
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/models?')) {
      const models = ['gemini-3.8-flash', 'gemini-3.7-flash'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] }));
      return new Response(JSON.stringify({ models }));
    }
    return handler(opts);
  };
}

test('연결이 두 번 끊겨도 같은 모델로 다시 해서 받는다', async () => {
  let drops = 0;
  useFetch((opts) => {
    if (drops < 2) { drops++; throw new TypeError('Failed to fetch'); }
    return ok(opts);
  });
  const r = await runCoaching(fb, 'U', data());
  assert.deepEqual(r.errors, []);
  assert.ok(r.done.includes('sleep'));
});

test('계속 끊기면 다시 시도할 실패(transient)로 분류', async () => {
  useFetch(() => { throw new TypeError('Failed to fetch'); });
  const r = await runCoaching(fb, 'U', data());
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors.every((e) => e.transient));
});

test('키 오류는 다시 시도할 실패가 아니다', async () => {
  useFetch(() => new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 }));
  const r = await runCoaching(fb, 'U', data());
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors.every((e) => !e.transient));
});
