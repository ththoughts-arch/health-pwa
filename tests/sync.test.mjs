// 실행: npm test — 동기화 버튼 (가짜 intervals.icu·가짜 Firestore)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncNow } from '../app/js/sync.js';
import { IntervalsError, RECOMPUTE_DAYS } from '../app/js/intervals.js';

const TODAY = '2026-11-12';
const KEYS = { intervalsApiKey: 'KEY', intervalsAthleteId: 'i123' };

// writeBatch에 쌓인 쓰기를 commit 때만 기록
function fakeFb() {
  const committed = [];
  const ref = (path) => ({ path, id: path.split('/').at(-1) });
  const join = (base, segs) => [base?.path, ...segs].filter(Boolean).join('/');
  const fs = {
    doc: (base, ...segs) => ref(join(base, segs)),
    collection: (base, ...segs) => ref(join(base, segs)),
    serverTimestamp: () => 'TS',
    writeBatch: () => {
      const ops = [];
      return { set: (r, data, opts) => ops.push({ path: r.path, data, opts }), commit: async () => { committed.push(...ops); } };
    },
  };
  return { fb: { fs, db: {} }, committed };
}

const wellness = [{ id: TODAY, sleepSecs: 25200, sleepScore: 80, hrv: 50, restingHR: 50, bodyBattery: 99 }];
const activities = [
  { id: 111, type: 'TrailRun', name: '동네 뒷산', description: '무릎 아픔', start_date_local: '2026-11-11T07:00:00', moving_time: 3600, icu_training_load: 80 },
  { id: 222, type: 'Swim', start_date_local: '2026-11-12T06:30:00', moving_time: 1800, pool_length: 25 },
  { id: 333, type: 'Yoga', start_date_local: '2026-11-10T20:00:00' },
];

function useIntervals({ status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), auth: opts.headers.Authorization });
    if (status !== 200) return new Response('{"secret":"본문"}', { status });
    return new Response(JSON.stringify(String(url).includes('/wellness?') ? wellness : activities));
  };
  return calls;
}

test('동기화: 활동·35일 점수·마지막 동기화 시각을 한 번에 병합 저장', async () => {
  const calls = useIntervals();
  const { fb, committed } = fakeFb();
  const r = await syncNow(fb, 'U', { keys: KEYS, settings: {}, today: TODAY });

  assert.deepEqual(r, { activities: 3, days: RECOMPUTE_DAYS });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.url.startsWith('https://intervals.icu/api/v1/athlete/i123/')));
  assert.equal(calls[0].auth, `Basic ${btoa('API_KEY:KEY')}`);

  // 기존 AI 분석(ai 필드)을 지우지 않도록 모두 merge
  assert.ok(committed.every((w) => w.opts?.merge === true));
  const days = committed.filter((w) => w.path.startsWith('users/U/days/'));
  assert.equal(days.length, RECOMPUTE_DAYS);
  assert.equal(days.at(-1).path, `users/U/days/${TODAY}`);
  assert.ok(days.every((w) => !('ai' in w.data)));
  assert.deepEqual(committed.find((w) => w.path === 'users/U').data, { lastSyncAt: 'TS' });
});

test('동기화: 활동 제목·설명은 저장하지 않고, 종목은 앱 이름으로', async () => {
  useIntervals();
  const { fb, committed } = fakeFb();
  await syncNow(fb, 'U', { keys: KEYS, settings: {}, today: TODAY });
  const act = (id) => committed.find((w) => w.path === `users/U/activities/${id}`).data;

  assert.equal(act(111).sport, 'trail');
  assert.equal(act(111).date, '2026-11-11');
  assert.equal(act(222).sport, 'swim');
  assert.equal(act(333).sport, 'other');
  const text = JSON.stringify(committed);
  assert.ok(!text.includes('동네 뒷산') && !text.includes('무릎 아픔'));
  assert.ok(!('bodyBattery' in committed.find((w) => w.path === `users/U/days/${TODAY}`).data.wellness));
});

test('동기화: 키 오류면 키 확인 안내, Firestore에는 아무것도 쓰지 않는다', async () => {
  useIntervals({ status: 401 });
  const { fb, committed } = fakeFb();
  await assert.rejects(syncNow(fb, 'U', { keys: KEYS, settings: {}, today: TODAY }), (e) => {
    assert.ok(e instanceof IntervalsError);
    assert.ok(e.message.includes('API 키 또는 Athlete ID'));
    assert.ok(!e.message.includes('본문')); // 응답 본문은 오류 문구에 넣지 않음
    return true;
  });
  assert.equal(committed.length, 0);
});
