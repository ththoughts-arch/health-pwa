// 2단계: intervals.icu 응답에 어떤 필드가 들어오는지 확인한다.
// 공개 저장소의 Actions 로그는 누구나 볼 수 있으므로 실제 값은 출력하지 않고
// 필드 이름 · 값이 있는 건수 · 값의 종류만 출력한다.
// 실행: INTERVALS_API_KEY, INTERVALS_ATHLETE_ID 환경변수 필요 (Node 20+, 의존성 없음)

const API = 'https://intervals.icu/api/v1';
const { INTERVALS_API_KEY: key, INTERVALS_ATHLETE_ID: athlete } = process.env;

if (!key || !athlete) {
  console.error('INTERVALS_API_KEY / INTERVALS_ATHLETE_ID 가 설정되지 않았습니다 (GitHub Secrets 확인).');
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`API_KEY:${key}`).toString('base64');

function isoDate(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function get(path, params) {
  const url = `${API}/athlete/${athlete}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (!res.ok) {
    // 응답 본문에 개인 데이터가 섞일 수 있으니 상태 코드만 출력
    throw new Error(`${path}: HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' — API 키 또는 Athlete ID 확인' : ''}`);
  }
  return res.json();
}

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

const wellness = await get('wellness', { oldest: isoDate(14), newest: isoDate(0) });
console.log(`\n=== 웰니스 (최근 14일, ${wellness.length}일치) ===`);
console.log('  필드                          있음/전체  종류');
console.log(summarize(wellness).join('\n'));
const watched = [...new Set(wellness.flatMap((r) => Object.keys(r)))].filter((k) => WATCH.test(k));
console.log(`\n관심 필드: ${watched.join(', ') || '(없음)'}`);

const activities = await get('activities', { oldest: isoDate(28), newest: isoDate(0) });
console.log(`\n=== 활동 (최근 28일, ${activities.length}건) ===`);
const types = {};
for (const a of activities) types[a.type ?? '(없음)'] = (types[a.type ?? '(없음)'] ?? 0) + 1;
console.log('종목별 건수:', JSON.stringify(types));
console.log('  필드                          있음/전체  종류');
console.log(summarize(activities).join('\n'));
