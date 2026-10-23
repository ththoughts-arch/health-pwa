// 2단계: intervals.icu 응답에 어떤 필드가 들어오는지 확인한다.
// 공개 저장소의 Actions 로그는 누구나 볼 수 있으므로 실제 값은 출력하지 않고
// 필드 이름 · 값이 있는 건수 · 값의 종류만 출력한다.
// 실행: INTERVALS_API_KEY, INTERVALS_ATHLETE_ID 환경변수 필요 (Node 20+)
import { addDays } from '../app/js/score.js';
import { intervalsClient, seoulToday } from './lib/intervals.mjs';

const get = intervalsClient();
const today = seoulToday();

function kind(v) {
  if (Array.isArray(v)) return `array[${v.length}]`;
  return typeof v;
}

// 필드별: 값이 있는 레코드 수, 값 종류
function summarize(records) {
  const fields = new Map();
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      const f = fields.get(k) ?? { present: 0, kinds: new Set() };
      if (v !== null && v !== undefined && v !== '') {
        f.present++;
        f.kinds.add(kind(v));
      }
      fields.set(k, f);
    }
  }
  return [...fields.entries()]
    .sort((a, b) => b[1].present - a[1].present || a[0].localeCompare(b[0]))
    .map(([k, f]) => `  ${k.padEnd(28)} ${String(f.present).padStart(3)}/${records.length}  ${[...f.kinds].join(',') || '-'}`);
}

// CLAUDE.md 4장에서 "불확실"로 남긴 항목 + 점수 계산에 필요한 항목
const WATCH = /sleep|hrv|resting|spo2|respir|battery|readiness|stress|steps|weight|wake|deep|rem|light|awake/i;

const wellness = await get('wellness', { oldest: addDays(today, -14), newest: today });
console.log(`\n=== 웰니스 (최근 14일, ${wellness.length}일치) ===`);
console.log('  필드                          있음/전체  종류');
console.log(summarize(wellness).join('\n'));
const watched = [...new Set(wellness.flatMap((r) => Object.keys(r)))].filter((k) => WATCH.test(k));
console.log(`\n관심 필드: ${watched.join(', ') || '(없음)'}`);

const activities = await get('activities', { oldest: addDays(today, -28), newest: today });
console.log(`\n=== 활동 (최근 28일, ${activities.length}건) ===`);
const types = {};
for (const a of activities) types[a.type ?? '(없음)'] = (types[a.type ?? '(없음)'] ?? 0) + 1;
console.log('종목별 건수:', JSON.stringify(types));
console.log('  필드                          있음/전체  종류');
console.log(summarize(activities).join('\n'));
