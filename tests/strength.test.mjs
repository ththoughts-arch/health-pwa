// 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseSummary, parseStrengthText, setsOf } from '../app/js/strength.js';

const pairs = (e) => e.setList.map((s) => [s.weightKg, s.reps]);

test('세로 형식: 운동 이름 + 세트 줄, 빈바는 20kg', () => {
  const r = parseStrengthText('평벤치 프레스\n빈바 : 10개\n40kg : 12개\n50kg : 8개\n50kg : 5개');
  assert.equal(r.exercises.length, 1);
  assert.equal(r.exercises[0].name, '평벤치 프레스');
  assert.deepEqual(pairs(r.exercises[0]), [[20, 10], [40, 12], [50, 8], [50, 5]]);
  assert.deepEqual(r.unparsed, []);
});

test('한 줄 형식 + 날짜·메모·첫 세트 워밍업, 소수 무게', () => {
  const r = parseStrengthText(`2026-11-05 상체 (kg×회, 첫 세트는 워밍업)
- 평벤치 프레스: 20×10, 40×12, 50×8, 50×5
- 케이블 푸시다운: 15×10, 15×6, 12.5×8`);
  assert.equal(r.date, '2026-11-05');
  assert.equal(r.note, '상체');
  assert.deepEqual(pairs(r.exercises[1]), [[15, 10], [15, 6], [12.5, 8]]);
  assert.equal(r.exercises[0].setList[0].warmup, true);
  assert.equal(r.exercises[0].setList[1].warmup, false);
});

test('읽지 못한 줄은 버리지 않고 알려 준다', () => {
  const r = parseStrengthText('40kg : 12개\n스쿼트\n60 x 10\n50\n런지');
  assert.deepEqual(pairs(r.exercises[0]), [[60, 10]]);
  assert.deepEqual(r.unparsed, ['40kg : 12개', '50', '런지']);
});

test('옛 기록(무게 하나 × 세트 × 횟수)도 세트 목록으로 읽는다', () => {
  const old = { name: '스쿼트', weightKg: 60, sets: 3, reps: 10 };
  assert.equal(setsOf(old).length, 3);
  assert.equal(exerciseSummary(old), '스쿼트 60kg 3×10');
});

test('요약: 무게가 다르면 최고 무게, 워밍업은 세지 않음', () => {
  const e = { name: '평벤치 프레스', setList: [
    { weightKg: 20, reps: 10, warmup: true }, { weightKg: 40, reps: 12, warmup: false },
    { weightKg: 50, reps: 8, warmup: false }, { weightKg: 50, reps: 5, warmup: false },
  ] };
  assert.equal(exerciseSummary(e), '평벤치 프레스 최고 50kg · 3세트');
});
