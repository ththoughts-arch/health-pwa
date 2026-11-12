// 실행: npm test — Firestore 읽기·쓰기 (가짜 Firestore, 실제 계정에 접속하지 않음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, saveSupplement, saveBodyBattery, saveSnapshot, loadSnapshot } from '../app/js/data.js';

// 경로 문자열('users/U/days/2026-11-12')을 키로 쓰는 가짜 Firestore.
// deny: 권한 오류(permission-denied), fail: 그 밖의 오류를 낼 경로
function fakeFb(store, { deny = [], fail = [] } = {}) {
  const writes = [];
  const ref = (path) => ({ path, id: path.split('/').at(-1) });
  const join = (base, segs) => [base?.path, ...segs].filter(Boolean).join('/');
  const check = (path) => {
    if (deny.includes(path)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    if (fail.includes(path)) throw Object.assign(new Error('offline'), { code: 'unavailable' });
  };
  const fs = {
    doc: (base, ...segs) => ref(join(base, segs)),
    collection: (base, ...segs) => ref(join(base, segs)),
    query: (col, ...constraints) => ({ path: col.path, constraints }),
    where: (...a) => ['where', ...a],
    orderBy: (...a) => ['orderBy', ...a],
    limit: (n) => ['limit', n],
    getDoc: async (r) => { check(r.path); return { data: () => store[r.path] }; },
    getDocs: async (q) => {
      check(q.path);
      const prefix = `${q.path}/`;
      const docs = Object.entries(store)
        .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map(([p, v]) => ({ id: p.slice(prefix.length), data: () => v }));
      return { docs };
    },
    setDoc: async (r, data, opts) => { writes.push({ path: r.path, data, opts }); },
    serverTimestamp: () => 'TS',
    deleteField: () => 'DEL',
  };
  return { fb: { fs, db: {} }, writes };
}

const U = 'users/U';
const store = {
  [U]: { settings: { bedtime: '23:30' }, lastSyncAt: { toDate: () => new Date('2026-11-12T08:00:00Z') } },
  [`${U}/days/2026-11-12`]: { date: '2026-11-12', score: { total: 81 } },
  [`${U}/supplements/a`]: { name: '마그네슘', order: 2 },
  [`${U}/supplements/b`]: { name: '오메가3', order: 1 },
  [`${U}/supplements/c`]: { name: '뺀 영양제', order: 0, active: false },
  [`${U}/strength/s1`]: { date: '2026-11-03' },
  [`${U}/strength/s2`]: { date: '2026-11-10' },
  [`${U}/private/keys`]: { geminiApiKey: 'K' },
  [`${U}/memos/m1`]: { text: '월 휴식', kind: 'plan' },
};

test('loadAll: 뺀 영양제는 숨기고 순서대로, 헬스는 최근 날짜 먼저', async () => {
  const { fb } = fakeFb(store);
  const d = await loadAll(fb, 'U');
  assert.deepEqual(d.supplements.map((s) => s.name), ['오메가3', '마그네슘']);
  assert.deepEqual(d.strength.map((s) => s.id), ['s2', 's1']);
  assert.equal(d.days['2026-11-12'].score.total, 81);
  assert.deepEqual(d.memos, [{ id: 'm1', text: '월 휴식', kind: 'plan' }]);
  assert.equal(d.settings.bedtime, '23:30');
  assert.equal(d.lastSyncAt.toISOString(), '2026-11-12T08:00:00.000Z');
  assert.equal(d.keys.geminiApiKey, 'K');
  assert.equal(d.rulesOutdated, false);
});

test('loadAll: 새 경로에 권한이 없으면 빈 값으로 열고 규칙 재게시 필요 표시', async () => {
  const { fb } = fakeFb(store, { deny: [`${U}/private/keys`, `${U}/coach/exercise`, `${U}/memos`] });
  const d = await loadAll(fb, 'U');
  assert.equal(d.rulesOutdated, true);
  assert.deepEqual(d.keys, {});
  assert.equal(d.exerciseCoach, null);
  assert.deepEqual(d.memos, []);
  assert.equal(d.supplements.length, 2); // 나머지는 정상
});

test('loadAll: 권한 오류가 아닌 실패(오프라인 등)는 숨기지 않는다', async () => {
  const { fb } = fakeFb(store, { fail: [`${U}/private/keys`] });
  await assert.rejects(loadAll(fb, 'U'), { code: 'unavailable' });
});

test('영양제 체크: 그날 checkins 문서에 병합 저장, 먹은 때만 시각 기록', async () => {
  const { fb, writes } = fakeFb({});
  await saveSupplement(fb, 'U', '2026-11-12', 'a', { taken: true, count: 2 });
  await saveSupplement(fb, 'U', '2026-11-12', 'b', { taken: false, count: 1 });
  assert.equal(writes[0].path, `${U}/checkins/2026-11-12`);
  assert.deepEqual(writes[0].opts, { merge: true });
  assert.deepEqual(writes[0].data.supplements, { a: { taken: true, count: 2, at: 'TS' } });
  assert.deepEqual(writes[1].data.supplements, { b: { taken: false, count: 1 } });
});

test('바디 배터리를 지우면 값과 시각 필드를 함께 지운다', async () => {
  const { fb, writes } = fakeFb({});
  await saveBodyBattery(fb, 'U', '2026-11-12', null);
  assert.equal(writes[0].data.bodyBattery, 'DEL');
  assert.equal(writes[0].data.bodyBatteryAt, 'DEL');
  assert.deepEqual(writes[0].opts, { merge: true });
});

test('기기 저장본: API 키는 저장하지 않고, 읽을 때 날짜를 되살린다', () => {
  const mem = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
  });
  saveSnapshot({ uid: 'U', email: null }, { keys: { geminiApiKey: 'SECRET' }, days: {}, lastSyncAt: new Date('2026-11-12T08:00:00Z') });
  assert.ok(!Object.values(mem).join('').includes('SECRET'));
  const s = loadSnapshot();
  assert.equal(s.uid, 'U');
  assert.deepEqual(s.data.keys, {});
  assert.equal(s.data.lastSyncAt.toISOString(), '2026-11-12T08:00:00.000Z');

  mem['health.snapshot.v1'] = '{망가진 JSON';
  assert.equal(loadSnapshot(), null);
});
