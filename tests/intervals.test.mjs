// 실행: npm test — intervals.icu 요청·정리 (가짜 fetch, 실제 계정에 접속하지 않음)
// 동기화 전체 흐름(저장·개인정보 제외)은 sync.test.mjs에서 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FETCH_DAYS, IntervalsError, RECOMPUTE_DAYS, fetchActivityDetail, fetchAndSummarize, intervalsClient,
} from '../app/js/intervals.js';

const TODAY = '2026-11-12';

// 주소별 응답: { 'wellness': [...], 'streams.json': 500 } 처럼 경로 끝부분 → 본문 또는 오류 상태
function useFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const parts = u.pathname.split('/').map(decodeURIComponent);
    const body = routes[parts.at(-1)] ?? routes[parts.at(-2)];
    if (typeof body === 'number') return new Response('', { status: body });
    return new Response(JSON.stringify(body ?? null));
  };
  return calls;
}

test('키나 Athlete ID가 없으면 요청 전에 멈춘다', () => {
  assert.throws(() => intervalsClient({ apiKey: 'K' }), /Athlete ID/);
  assert.throws(() => intervalsClient({ athleteId: 'i1' }), /API 키/);
});

test('오류 문구: 401·403은 키 확인 안내, 그 밖은 상태 코드만', () => {
  assert.match(new IntervalsError(403, 'wellness').message, /API 키 또는 Athlete ID/);
  assert.equal(new IntervalsError(500, 'activities').message, 'intervals.icu activities: HTTP 500');
});

test('수집 기간: 점수 계산에 필요한 만큼 과거부터, 35일치 점수', async () => {
  const calls = useFetch({ wellness: [], activities: [] });
  const r = await fetchAndSummarize({ apiKey: 'K', athleteId: 'i 1', today: TODAY });
  assert.equal(calls[0].pathname, '/api/v1/athlete/i%201/wellness');
  assert.equal(calls[0].searchParams.get('newest'), TODAY);
  const oldest = calls[0].searchParams.get('oldest');
  const daysBack = (new Date(TODAY) - new Date(oldest)) / 86400000;
  assert.equal(daysBack, FETCH_DAYS);
  assert.equal(r.days.length, RECOMPUTE_DAYS);
  assert.equal(r.days[0].date, '2026-10-09');
  assert.equal(r.days.at(-1).date, TODAY);
});

test('활동 정리: 종목 이름, 숫자 ID는 글자로, 인터벌 요약은 10개까지', async () => {
  useFetch({
    wellness: [{ id: TODAY, sleepSecs: 25200 }],
    activities: [
      { id: 1, type: 'VirtualRun', start_date_local: '2026-11-12T07:00:00' },
      { id: 2, type: 'OpenWaterSwim' },
      { id: 3, type: 'WeightTraining', interval_summary: Array.from({ length: 12 }, (_, i) => i) },
    ],
  });
  const { activities, days, wellnessCount } = await fetchAndSummarize({ apiKey: 'K', athleteId: 'i1', today: TODAY });
  assert.equal(wellnessCount, 1);
  assert.deepEqual(activities.map((a) => [a.id, a.sport]), [['1', 'run'], ['2', 'swim'], ['3', 'strength']]);
  assert.equal(activities[0].date, TODAY);
  assert.equal(activities[1].date, null); // 시작 시각이 없으면 날짜도 없음
  assert.equal(activities[2].intervalSummary.length, 10);
  assert.equal(typeof activities[2].intervalSummary[0], 'string');
  // 웰니스는 정해 둔 항목만, 없는 값은 null
  assert.equal(days.at(-1).wellness.sleepSecs, 25200);
  assert.equal(days.at(-1).wellness.hrv, null);
});

test('러닝 상세: 랩과 스트림을 받고, 스트림이 실패해도 랩만으로 진행', async () => {
  const laps = [{ distance: 1000 }];
  const calls = useFetch({ 'a 9': { icu_intervals: laps }, 'streams.json': [{ type: 'time', data: [0, 1] }] });
  const r = await fetchActivityDetail({ apiKey: 'K' }, 'a 9');
  assert.deepEqual(r.intervals, laps);
  assert.equal(r.streams.length, 1);
  assert.equal(calls[0].pathname, '/api/v1/activity/a%209');
  assert.equal(calls[0].searchParams.get('intervals'), 'true');

  useFetch({ 'a 9': {}, 'streams.json': 500 });
  assert.deepEqual(await fetchActivityDetail({ apiKey: 'K' }, 'a 9'), { intervals: [], streams: null });

  useFetch({ 'a 9': 404 });
  await assert.rejects(fetchActivityDetail({ apiKey: 'K' }, 'a 9'), (e) => e instanceof IntervalsError && e.status === 404);
  await assert.rejects(fetchActivityDetail({}, 'a 9'), /API 키/);
});
