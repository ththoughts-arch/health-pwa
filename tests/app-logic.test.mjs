// 실행: npm test — app.js의 판단 로직 (화면·Firebase 없이)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiResultMessage, bodyBatteryValue, buildStrengthEntry, nextSupplementEntry, parseRoute } from '../app/js/app-logic.js';

const SCREENS = ['today', 'exercise', 'strength', 'run', 'memo'];

test('주소: 화면과 ID를 읽고, 모르는 화면·빈 주소는 오늘', () => {
  assert.deepEqual(parseRoute('#strength=abc', SCREENS), { name: 'strength', param: 'abc' });
  assert.deepEqual(parseRoute('#run=12%2F3', SCREENS), { name: 'run', param: '12/3' });
  assert.deepEqual(parseRoute('#memo', SCREENS), { name: 'memo', param: null });
  assert.deepEqual(parseRoute('', SCREENS), { name: 'today', param: null });
  assert.deepEqual(parseRoute('#nope=1', SCREENS), { name: 'today', param: null });
});

test('바디 배터리: 0~100 정수만, 빈칸은 지우기, 그 밖은 무시', () => {
  assert.equal(bodyBatteryValue(' 72 '), 72);
  assert.equal(bodyBatteryValue('64.6'), 65);
  assert.equal(bodyBatteryValue('0'), 0);
  assert.equal(bodyBatteryValue(''), null);
  assert.equal(bodyBatteryValue('101'), undefined);
  assert.equal(bodyBatteryValue('-1'), undefined);
  assert.equal(bodyBatteryValue('abc'), undefined);
});

test('영양제 체크: 처음엔 1회 알 수로 시작, 이후엔 바꾼 값만 덮어씀', () => {
  assert.deepEqual(nextSupplementEntry(undefined, { countPerDose: 2 }, { taken: true }), { taken: true, count: 2 });
  assert.deepEqual(nextSupplementEntry(undefined, undefined, { taken: true }), { taken: true, count: 1 });
  assert.deepEqual(nextSupplementEntry({ taken: true, count: 3 }, { countPerDose: 2 }, { taken: false }), { taken: false, count: 3 });
});

const draft = (over = {}) => ({
  date: '2026-11-12', note: ' 상체 ', durationMin: 59.6,
  exercises: [
    { name: ' 평벤치 프레스 ', setList: [
      { weightKg: 20, reps: 10, warmup: true },
      { weightKg: 52.3, reps: 8.4, warmup: false },
      { weightKg: null, reps: null, warmup: false }, // 빈 세트
    ] },
    { name: '  ', setList: [{ weightKg: 40, reps: 10 }] }, // 이름 없는 운동
  ],
  ...over,
});

test('헬스 저장: 빈 칸 버리고 무게 0.5kg·횟수·시간 정수로, 같은 날 가민 헬스와 연결', () => {
  const { entry, error } = buildStrengthEntry(draft(), {
    today: '2026-11-12',
    activities: [{ id: 'r1', date: '2026-11-12', sport: 'run' }, { id: 'g1', date: '2026-11-12', sport: 'strength' }],
  });
  assert.equal(error, undefined);
  assert.equal(entry.note, '상체');
  assert.equal(entry.durationMin, 60);
  assert.equal(entry.activityId, 'g1');
  assert.equal(entry.exercises.length, 1);
  assert.equal(entry.exercises[0].name, '평벤치 프레스');
  assert.deepEqual(entry.exercises[0].setList, [
    { weightKg: 20, reps: 10, warmup: true },
    { weightKg: 52.5, reps: 8, warmup: false },
  ]);
});

test('헬스 저장: 운동이 없거나 미래 날짜면 저장하지 않는다', () => {
  const ctx = { today: '2026-11-12', activities: [] };
  assert.ok(buildStrengthEntry(draft({ exercises: [{ name: '', setList: [] }] }), ctx).error);
  assert.ok(buildStrengthEntry(draft({ date: '2026-11-13' }), ctx).error);
  assert.ok(buildStrengthEntry(draft({ date: '' }), ctx).error);
  assert.equal(buildStrengthEntry(draft({ durationMin: null }), ctx).entry.activityId, null);
});

test('AI 결과 문구: 받은 것·실패 이유, 지연만이면 다시 시도 안내', () => {
  assert.equal(aiResultMessage({ done: ['sleep', 'day'], errors: [] }), 'AI 수면 분석·하루 가이드 받았어요');
  assert.equal(aiResultMessage({ done: [], errors: [] }), null);
  const slow = aiResultMessage({ done: ['sleep'], errors: [{ label: '운동', message: 'x', transient: true }] });
  assert.ok(slow.startsWith('AI 수면 분석 받았어요 · AI 운동 분석 실패'));
  assert.ok(slow.includes('앱으로 돌아오면 다시 시도해요'));
  const bad = aiResultMessage({ done: [], errors: [{ label: '수면', message: '키 오류', transient: false }, { label: '운동', message: '늦음', transient: true }] });
  assert.equal(bad, 'AI 분석 실패: 수면: 키 오류 / 운동: 늦음');
});
