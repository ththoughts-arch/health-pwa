// 백업용 수동 실행: intervals.icu → Firestore users/{OWNER_UID}/ (docs/data-model.md)
// 평소에는 앱의 동기화 버튼이 같은 일을 한다(app/js/sync.js). ai 필드는 건드리지 않는다.
// 공개 저장소의 Actions 로그는 누구나 볼 수 있으므로 건수·상태만 출력한다.
// 필요 환경변수: INTERVALS_API_KEY, INTERVALS_ATHLETE_ID, FIREBASE_SERVICE_ACCOUNT, OWNER_UID
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_WEIGHTS } from '../app/js/score.js';
import { RECOMPUTE_DAYS, fetchAndSummarize } from '../app/js/intervals.js';
import { seoulToday } from './lib/intervals.mjs';

const { FIREBASE_SERVICE_ACCOUNT, OWNER_UID, INTERVALS_API_KEY, INTERVALS_ATHLETE_ID } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT || !OWNER_UID) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT / OWNER_UID 가 설정되지 않았습니다 (GitHub Secrets 확인).');
}

initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const user = db.collection('users').doc(OWNER_UID);
const settings = (await user.get()).data()?.settings ?? {};

const today = seoulToday();
const { wellnessCount, activities, days } = await fetchAndSummarize({
  apiKey: INTERVALS_API_KEY,
  athleteId: INTERVALS_ATHLETE_ID,
  today,
  weights: settings.scoreWeights ?? DEFAULT_WEIGHTS,
});

const batch = db.batch();
const now = FieldValue.serverTimestamp();
for (const { id, ...a } of activities) {
  batch.set(user.collection('activities').doc(id), { ...a, updatedAt: now }, { merge: true });
}
for (const day of days) {
  batch.set(user.collection('days').doc(day.date), { ...day, updatedAt: now }, { merge: true });
}
await batch.commit();

const statusCount = {};
const missing = [];
for (const day of days) {
  statusCount[day.status] = (statusCount[day.status] ?? 0) + 1;
  if (day.status === 'missing') {
    // 날짜와 빠진 필드 이름만 (값은 출력하지 않음)
    const w = day.wellness;
    const empty = w ? ['sleepSecs', 'hrv', 'restingHR'].filter((k) => w[k] == null) : ['(행 없음)'];
    missing.push(`${day.date}: ${empty.join(', ')}`);
  }
}

console.log(`웰니스 ${wellnessCount}일, 활동 ${activities.length}건 수집`);
// JSON 중괄호는 Secrets 마스킹(서비스 계정 JSON의 '{' 줄)에 가려지므로 쓰지 않는다
console.log(`days ${RECOMPUTE_DAYS}일 기록: ${Object.entries(statusCount).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`오늘(${today}) 상태: ${days.at(-1).status}`);
if (missing.length) console.log(`비어 있는 날:\n  ${missing.join('\n  ')}`);
