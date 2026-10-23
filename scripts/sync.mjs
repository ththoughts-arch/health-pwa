// 매일 아침: intervals.icu → Firestore users/{OWNER_UID}/ (docs/data-model.md)
//   activities/{id}  운동 기록
//   days/{date}      웰니스 + 기준값 + 컨디션 점수 + 경고 (ai 필드는 건드리지 않음)
// 공개 저장소의 Actions 로그는 누구나 볼 수 있으므로 건수·상태만 출력한다.
// 필요 환경변수: INTERVALS_API_KEY, INTERVALS_ATHLETE_ID, FIREBASE_SERVICE_ACCOUNT, OWNER_UID
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { addDays, summarizeDay, DEFAULT_WEIGHTS } from '../app/js/score.js';
import { intervalsClient, seoulToday } from './lib/intervals.mjs';

// 다시 계산할 날 수. 35일 → 4주 전 부하까지 기록이 쌓여 있게 함
const RECOMPUTE_DAYS = 35;
// 기준값 30일 + 부하 비교 35일을 계산하려면 이만큼 과거가 필요
const FETCH_DAYS = RECOMPUTE_DAYS + 35;

const { FIREBASE_SERVICE_ACCOUNT, OWNER_UID } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT || !OWNER_UID) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT / OWNER_UID 가 설정되지 않았습니다 (GitHub Secrets 확인).');
}

const WELLNESS_FIELDS = [
  'sleepSecs', 'sleepScore', 'sleepQuality', 'hrv', 'restingHR',
  'steps', 'atl', 'ctl', 'rampRate', 'vo2max', 'weight',
];

const SPORT = {
  Run: 'run', VirtualRun: 'run', TrailRun: 'trail',
  Swim: 'swim', OpenWaterSwim: 'swim', WeightTraining: 'strength',
};

function pickWellness(w) {
  return Object.fromEntries(WELLNESS_FIELDS.map((k) => [k, w[k] ?? null]));
}

// 활동 name·description은 개인 메모가 들어갈 수 있어 저장하지 않는다
function normalizeActivity(a) {
  return {
    date: a.start_date_local?.slice(0, 10) ?? null,
    startLocal: a.start_date_local ?? null,
    sport: SPORT[a.type] ?? 'other',
    rawType: a.type ?? null,
    movingSecs: a.moving_time ?? null,
    elapsedSecs: a.elapsed_time ?? null,
    distanceM: a.distance ?? null,
    trainingLoad: a.icu_training_load ?? null,
    trimp: a.trimp ?? null,
    avgHr: a.average_heartrate ?? null,
    maxHr: a.max_heartrate ?? null,
    hrZones: a.icu_hr_zones ?? null,
    hrZoneSecs: a.icu_hr_zone_times ?? null,
    pace: a.pace ?? null,
    elevationGainM: a.total_elevation_gain ?? null,
    poolLengthM: a.pool_length ?? null,
    lengths: a.lengths ?? null,
    feel: a.feel ?? null,
    rpe: a.icu_rpe ?? null,
  };
}

const get = intervalsClient();
const today = seoulToday();
const oldest = addDays(today, -FETCH_DAYS);

const [rawWellness, rawActivities] = await Promise.all([
  get('wellness', { oldest, newest: today }),
  get('activities', { oldest, newest: today }),
]);

const wellnessByDate = Object.fromEntries(rawWellness.map((w) => [w.id, pickWellness(w)]));
const activities = rawActivities.map((a) => ({ id: String(a.id), ...normalizeActivity(a) }));

initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const user = db.collection('users').doc(OWNER_UID);

const settings = (await user.get()).data()?.settings ?? {};
const weights = settings.scoreWeights ?? DEFAULT_WEIGHTS;

const batch = db.batch();
const now = FieldValue.serverTimestamp();

for (const { id, ...a } of activities) {
  batch.set(user.collection('activities').doc(id), { ...a, updatedAt: now });
}

const statusCount = {};
const missing = [];
let todayStatus = null;
for (let i = RECOMPUTE_DAYS - 1; i >= 0; i--) {
  const date = addDays(today, -i);
  const day = summarizeDay({ date, wellnessByDate, activities, weights });
  statusCount[day.status] = (statusCount[day.status] ?? 0) + 1;
  if (date === today) todayStatus = day.status;
  if (day.status === 'missing') {
    // 날짜와 빠진 필드 이름만 (값은 출력하지 않음)
    const w = wellnessByDate[date];
    const empty = w ? ['sleepSecs', 'hrv', 'restingHR'].filter((k) => w[k] == null) : ['(행 없음)'];
    missing.push(`${date}: ${empty.join(', ')}`);
  }
  // merge: ai(8단계) 필드는 유지
  batch.set(user.collection('days').doc(date), { ...day, updatedAt: now }, { merge: true });
}

await batch.commit();

console.log(`웰니스 ${rawWellness.length}일, 활동 ${activities.length}건 수집`);
// JSON 중괄호는 Secrets 마스킹(서비스 계정 JSON의 '{' 줄)에 가려지므로 쓰지 않는다
console.log(`days ${RECOMPUTE_DAYS}일 기록: ${Object.entries(statusCount).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`오늘(${today}) 상태: ${todayStatus}`);
if (missing.length) console.log(`비어 있는 날:\n  ${missing.join('\n  ')}`);
