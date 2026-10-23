// 실행: npm test  (Node 20+, 의존성 없음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, bandOf, computeBaseline, computeLoad, summarizeDay } from '../app/js/score.js';

const DATE = '2026-10-24';
const H = 3600;

// date 이전 n일을 같은 값으로 채운 웰니스
function history(n, w = { sleepSecs: 7.5 * H, sleepScore: 80, hrv: 55, restingHR: 50 }) {
  const out = {};
  for (let i = 1; i <= n; i++) out[addDays(DATE, -i)] = { ...w };
  return out;
}

test('addDays: 월·연도 경계', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('bandOf: 80 이상 좋음 / 60–79 보통 / 60 미만 회복 필요', () => {
  assert.equal(bandOf(80), 'good');
  assert.equal(bandOf(79), 'normal');
  assert.equal(bandOf(60), 'normal');
  assert.equal(bandOf(59), 'low');
  assert.equal(bandOf(null), null);
});

test('기준값: 14일 미만이면 수집 중, 당일은 제외', () => {
  const w = history(13);
  w[DATE] = { sleepSecs: 1, hrv: 1, restingHR: 1 };
  const b = computeBaseline(w, DATE);
  assert.equal(b.days, 13);
  assert.equal(b.ready, false);
  assert.equal(b.hrv30, 55);

  const day = summarizeDay({ date: DATE, wellnessByDate: w, activities: [] });
  assert.equal(day.status, 'collecting');
  assert.equal(day.score, null);
});

test('적정 수면 시간은 7~9시간으로 제한', () => {
  assert.equal(computeBaseline(history(20, { sleepSecs: 6 * H, hrv: 50, restingHR: 50 }), DATE).sleepTargetSecs, 7 * H);
  assert.equal(computeBaseline(history(20, { sleepSecs: 10 * H, hrv: 50, restingHR: 50 }), DATE).sleepTargetSecs, 9 * H);
});

test('평소와 같고 수면 점수 100이면 100점', () => {
  const w = history(30);
  w[DATE] = { sleepSecs: 7.5 * H, sleepScore: 100, hrv: 55, restingHR: 50 };
  const day = summarizeDay({ date: DATE, wellnessByDate: w, activities: [] });
  assert.equal(day.status, 'ok');
  assert.equal(day.score.total, 100);
  assert.equal(day.score.band, 'good');
});

test('30분 덜 자고 HRV -10%, 안정시 심박 +2 → 78점(보통)', () => {
  const w = history(30);
  w[DATE] = { sleepSecs: 7 * H, sleepScore: 80, hrv: 49.5, restingHR: 52 };
  const s = summarizeDay({ date: DATE, wellnessByDate: w, activities: [] }).score;
  // 수면: 시간 0.75, 점수 0.8 → 0.775×40 = 31
  // 회복: HRV 0.6, 심박 0.75 → 0.675×40 = 27
  assert.deepEqual([s.sleep, s.recovery, s.load, s.total, s.band], [31, 27, 20, 78, 'normal']);
});

test('수면 점수가 없으면 수면 시간만으로 계산', () => {
  const w = history(30);
  w[DATE] = { sleepSecs: 7.5 * H, sleepScore: null, hrv: 55, restingHR: 50 };
  const s = summarizeDay({ date: DATE, wellnessByDate: w, activities: [] }).score;
  assert.equal(s.sleep, 40);
  assert.equal(s.detail.sleepQuality, null);
});

test('오늘 수면 데이터가 아직 없으면 missing', () => {
  const day = summarizeDay({ date: DATE, wellnessByDate: history(30), activities: [] });
  assert.equal(day.status, 'missing');
  assert.equal(day.score, null);
});

test('운동 부하: 최근 7일이 4주 평균의 2배면 20점 중 6점', () => {
  const acts = [-8, -15, -22, -29].map((d) => ({ date: addDays(DATE, d), trainingLoad: 200 }));
  acts.push({ date: addDays(DATE, -1), trainingLoad: 400 });
  const load = computeLoad(acts, DATE);
  assert.equal(load.load7, 400);
  assert.equal(load.load28avg, 200);
  assert.equal(load.loadRatio, 2);

  const w = history(30);
  w[DATE] = { sleepSecs: 7.5 * H, sleepScore: 100, hrv: 55, restingHR: 50 };
  assert.equal(summarizeDay({ date: DATE, wellnessByDate: w, activities: acts }).score.load, 6);
});

test('운동 부하: 어제·그제 연속 고강도(존3+ 20분)면 20점 중 14점', () => {
  const hard = [0, 0, 1200, 0, 0, 0, 0];
  const acts = [
    { date: addDays(DATE, -1), trainingLoad: 10, hrZoneSecs: hard },
    { date: addDays(DATE, -2), trainingLoad: 10, hrZoneSecs: hard },
  ];
  assert.equal(computeLoad(acts, DATE).consecutiveHigh, true);
  const w = history(30);
  w[DATE] = { sleepSecs: 7.5 * H, sleepScore: 100, hrv: 55, restingHR: 50 };
  assert.equal(summarizeDay({ date: DATE, wellnessByDate: w, activities: acts }).score.load, 14);
});

test('경고: 안정시 심박 +5 이상·HRV -15% 이하가 3일 연속', () => {
  const w = history(30);
  for (let i = 0; i < 3; i++) w[addDays(DATE, -i)] = { sleepSecs: 7.5 * H, hrv: 45, restingHR: 56 };
  const day = summarizeDay({ date: DATE, wellnessByDate: w, activities: [] });
  assert.deepEqual(day.warnings, [{ code: 'rhr_up_hrv_down', days: 3 }]);
});
