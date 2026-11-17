// 코칭 화면: 기준 날짜·테마·렌더 (tests/coach.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachCondition, coachDate, renderCoachExercise, renderCoachSleep, renderCoachToday, renderReports } from '../app/js/screens/coach.js';

const base = (coach, ui = {}) => ({
  data: { today: '2026-11-18', coach, checkins: {}, supplements: [] },
  ui,
});
const coach = {
  days: {
    '2026-11-16': { date: '2026-11-16', sleep: { durationMin: 374, hrv: 50, rhr: 47 }, verdict: { level: 'yellow' } },
    '2026-11-17': { date: '2026-11-17', sleep: { durationMin: 381, hrv: 46, rhr: 47 }, verdict: { level: 'red', intensity: '축소' },
      sleepAnalysis: { alert: '수면 <script>' }, updates: [{ time: '09:20', kind: 'pre', title: 'a', body: 'b' }] },
  },
  sessions: [{ date: '2026-11-17', sport: 'strength', title: '상체 A', sets: [{ name: '벤치', sets: '50×8' }] }],
  weeks: { '2026-11-16': { monday: '2026-11-16', plan: [{ day: '월', plan: 'Easy', status: 'done' }], muscleSets: { 등: 9 } } },
  reports: [{ kind: 'weekly', period: '2026-11-09', title: 't', sections: [{ title: 's', body: 'b' }] }],
};

test('오늘 기록이 없으면 가장 최근 기록 날짜', () => {
  assert.equal(coachDate(base(coach)), '2026-11-17');
  assert.equal(coachDate(base(coach, { coachDate: '2026-11-16' })), '2026-11-16');
  assert.equal(coachDate(base({ days: {}, sessions: [], weeks: {}, reports: [] })), '2026-11-18');
});

test('판정 → 테마', () => {
  assert.equal(coachCondition(base(coach)), 'low');
  assert.equal(coachCondition(base(coach, { coachDate: '2026-11-16' })), 'normal');
});

test('화면이 그려지고 문자열은 이스케이프', () => {
  const s = base(coach);
  assert.match(renderCoachToday(s), /회복 필요/);
  const sleep = renderCoachSleep(s);
  assert.match(sleep, /반드시 개선 필요/);
  assert.ok(!sleep.includes('<script>'));
  assert.match(renderCoachExercise(s), /벤치/);
  assert.match(renderReports(s), /주간/);
  assert.match(renderCoachToday(base(undefined)), /아직 판정 전/);
});
