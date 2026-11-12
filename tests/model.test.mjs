// 실행: npm test — Firestore 데이터 → 화면 값 (model.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickDisplayDay, dateRange, headline, sleepLabel, supplementSlots, supplementCalendar,
  activitiesBetween, strengthLogsBetween, strengthSecs, intensity, tonightBedtime,
} from '../app/js/model.js';

const TODAY = '2026-11-12';
const W = { sleep: 40, recovery: 40, load: 20 };
const okDay = (date, score) => ({ date, status: 'ok', score: { weights: W, ...score } });

test('화면 기준일: 오늘 점수가 없으면 최근 3일 중 점수 있는 날, 그것도 없으면 있는 날', () => {
  const days = {
    '2026-11-12': { date: '2026-11-12', status: 'missing' },
    '2026-11-11': okDay('2026-11-11', { band: 'good' }),
  };
  assert.equal(pickDisplayDay({ today: TODAY, days }).date, '2026-11-11');
  assert.equal(pickDisplayDay({ today: TODAY, days: { '2026-11-12': days['2026-11-12'] } }).status, 'missing');
  // 4일 전 점수는 너무 오래돼서 쓰지 않는다
  assert.equal(pickDisplayDay({ today: TODAY, days: { '2026-11-08': okDay('2026-11-08', {}) } }), null);
});

test('dateRange: 오래된 날부터, 월 경계 포함', () => {
  assert.deepEqual(dateRange('2026-11-02', 3), ['2026-10-31', '2026-11-01', '2026-11-02']);
});

test('규칙 문장: AI 문장 우선, 보통이면 가장 약한 항목을 알려 줌', () => {
  assert.equal(headline({ ai: { headline: 'AI 문장' }, status: 'ok' }), 'AI 문장');
  assert.ok(headline(null).includes('아직 데이터가 없어요'));
  assert.ok(headline({ status: 'collecting' }).includes('2주'));
  // 수면 40 중 34(0.85), 회복 40 중 24(0.6), 부하 20 중 18(0.9) → 회복이 가장 약함
  assert.ok(headline(okDay(TODAY, { band: 'normal', sleep: 34, recovery: 24, load: 18 })).includes('회복이 덜'));
  // 모두 0.7 이상이면 무난
  assert.ok(headline(okDay(TODAY, { band: 'normal', sleep: 30, recovery: 30, load: 15 })).includes('무난'));
});

test('수면 라벨: 오늘 행이면 어젯밤, 지난 날이면 날짜', () => {
  assert.equal(sleepLabel({ today: TODAY }, { date: TODAY }), '어젯밤 수면');
  assert.equal(sleepLabel({ today: TODAY }, { date: '2026-11-11' }), '11.11 아침까지 수면');
});

test('오늘 영양제: 시간대 순서로 묶고, 바꾼 알 수로 합계, 전부 먹으면 그 시간대 완료', () => {
  const data = {
    today: TODAY,
    supplements: [
      { id: 'mg', name: '마그네슘', slot: 'bedtime', countPerDose: 1, time: '23:00' },
      { id: 'o3', name: '오메가3', slot: 'morning', countPerDose: 2, time: '08:30' },
      { id: 'c', name: '비타민C', slot: 'morning', time: '08:00' },
    ],
    checkins: { [TODAY]: { supplements: { o3: { taken: true, count: 3 }, c: { taken: true } } } },
  };
  const { slots, takenPills, totalPills } = supplementSlots(data);
  assert.deepEqual(slots.map((s) => s.slot), ['morning', 'bedtime']); // 빈 시간대는 뺀다
  assert.equal(slots[0].time, '08:00'); // 가장 이른 알림 시각
  assert.equal(slots[0].done, true);
  assert.equal(slots[1].done, false);
  assert.equal(takenPills, 4); // 3 + 1
  assert.equal(totalPills, 5); // 3 + 1 + 1
});

test('복용 달력: 오늘 아직 안 먹었으면 복용률 계산에서 뺀다', () => {
  const data = {
    today: TODAY,
    supplements: [{ id: 'a' }, { id: 'b' }],
    checkins: {
      '2026-11-11': { supplements: { a: { taken: true }, b: { taken: true } } },
      '2026-11-10': { supplements: { a: { taken: true } } },
    },
  };
  const { cells, rate } = supplementCalendar(data);
  assert.equal(cells.length, 28);
  assert.deepEqual(cells.slice(-3).map((c) => c.level), [1, 2, 0]);
  // 27일 중 1일 100% + 1일 50% → 150/27 ≈ 6%
  assert.equal(rate, 6);
});

test('운동 기간·종목 필터, 가민과 연결된 헬스 기록은 두 번 세지 않음', () => {
  const data = {
    activities: [
      { date: '2026-11-05', sport: 'run' }, { date: '2026-11-12', sport: 'swim' }, { date: '2026-11-13', sport: 'run' },
    ],
    strength: [
      { date: '2026-11-10', durationMin: 60 }, { date: '2026-11-11', durationMin: 45, activityId: 'g1' }, { date: '2026-11-11' },
    ],
  };
  assert.equal(activitiesBetween(data, '2026-11-06', TODAY).length, 1);
  assert.equal(activitiesBetween(data, '2026-11-01', TODAY, 'run').length, 1);
  const logs = strengthLogsBetween(data, '2026-11-06', TODAY);
  assert.equal(logs.length, 2);
  assert.equal(strengthSecs(logs), 3600); // 시간 없는 기록은 0
  assert.deepEqual(strengthLogsBetween(data, '2026-11-06', TODAY, 'run'), []);
});

test('강도 분포: 존1–2 쉬움·존3 보통·존4+ 고강도, 합이 100', () => {
  const r = intensity([
    { hrZoneSecs: [600, 1200, 300, 200, 100] },
    { hrZoneSecs: null }, // 심박 없는 수영
  ]);
  assert.deepEqual(r, { easy: 75, mid: 13, hard: 12 });
  assert.equal(intensity([{}]), null);
});

test('오늘 밤 취침: 수면 30분 넘게 부족하거나 회복 필요면 30분 일찍', () => {
  const target = { baseline: { sleepTargetSecs: 8 * 3600 } };
  assert.equal(tonightBedtime({}, null), null);
  assert.deepEqual(tonightBedtime({ bedtime: '23:30' }, { ...target, wellness: { sleepSecs: 7 * 3600 } }), { earlier: 30, reason: '어젯밤 수면이 부족해서' });
  assert.deepEqual(tonightBedtime({ bedtime: '23:30' }, { ...target, wellness: { sleepSecs: 7.6 * 3600 } }), { earlier: 0, reason: '' });
  assert.deepEqual(tonightBedtime({ bedtime: '23:30' }, { score: { band: 'low' } }), { earlier: 30, reason: '회복이 필요해서' });
});
