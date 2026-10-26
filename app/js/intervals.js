// intervals.icu 수집·정리·점수 계산 — 앱(동기화 버튼)과 scripts/sync.mjs(백업용)가 같이 쓴다
// 브라우저·Node 공통 API(fetch, btoa)만 쓴다
import { addDays, summarizeDay, DEFAULT_WEIGHTS } from './score.js';

const API = 'https://intervals.icu/api/v1';

// 다시 계산할 날 수. 35일 → 4주 전 부하까지 기록이 쌓여 있게 함
export const RECOMPUTE_DAYS = 35;
// 기준값 30일 + 부하 비교 35일을 계산하려면 이만큼 과거가 필요
export const FETCH_DAYS = RECOMPUTE_DAYS + 35;

const WELLNESS_FIELDS = [
  'sleepSecs', 'sleepScore', 'sleepQuality', 'hrv', 'restingHR',
  'steps', 'atl', 'ctl', 'rampRate', 'vo2max', 'weight',
];

const SPORT = {
  Run: 'run', VirtualRun: 'run', TrailRun: 'trail',
  Swim: 'swim', OpenWaterSwim: 'swim', WeightTraining: 'strength',
};

export class IntervalsError extends Error {
  constructor(status, path) {
    const hint = status === 401 || status === 403 ? 'API 키 또는 Athlete ID를 확인해 주세요' : `HTTP ${status}`;
    super(`intervals.icu ${path}: ${hint}`);
    this.status = status;
  }
}

// Basic Auth: 사용자명 API_KEY, 비밀번호 = 개인 API 키
function request(apiKey) {
  const auth = 'Basic ' + btoa(`API_KEY:${apiKey}`);
  return async (path, params = {}) => {
    const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    });
    // 응답 본문에 개인 데이터가 섞일 수 있으니 상태 코드만 남긴다
    if (!res.ok) throw new IntervalsError(res.status, path.split('/').pop());
    return res.json();
  };
}

export function intervalsClient({ apiKey, athleteId }) {
  if (!apiKey || !athleteId) throw new Error('intervals.icu API 키와 Athlete ID가 필요해요.');
  const req = request(apiKey);
  return (path, params) => req(`athlete/${encodeURIComponent(athleteId)}/${path}`, params);
}

// 러닝 상세 분석용: 랩(인터벌)과 초 단위 스트림. 스트림은 없어도 랩만으로 진행
export async function fetchActivityDetail({ apiKey }, activityId) {
  if (!apiKey) throw new Error('intervals.icu API 키가 필요해요.');
  const req = request(apiKey);
  const id = encodeURIComponent(activityId);
  const [activity, streams] = await Promise.all([
    req(`activity/${id}`, { intervals: 'true' }),
    req(`activity/${id}/streams.json`, { types: 'time,distance,heartrate,cadence,altitude' }).catch(() => null),
  ]);
  return { intervals: activity?.icu_intervals ?? [], streams: Array.isArray(streams) ? streams : null };
}

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
    gap: a.gap ?? null,
    cadence: a.average_cadence ?? null,
    elevationGainM: a.total_elevation_gain ?? null,
    poolLengthM: a.pool_length ?? null,
    lengths: a.lengths ?? null,
    intervalSummary: Array.isArray(a.interval_summary) ? a.interval_summary.slice(0, 10).map(String) : null,
    feel: a.feel ?? null,
    rpe: a.icu_rpe ?? null,
  };
}

// intervals.icu에서 받아 Firestore에 쓸 모양으로 정리
export async function fetchAndSummarize({ apiKey, athleteId, today, weights = DEFAULT_WEIGHTS }) {
  const get = intervalsClient({ apiKey, athleteId });
  const oldest = addDays(today, -FETCH_DAYS);
  const [rawWellness, rawActivities] = await Promise.all([
    get('wellness', { oldest, newest: today }),
    get('activities', { oldest, newest: today }),
  ]);

  const wellnessByDate = Object.fromEntries(rawWellness.map((w) => [w.id, pickWellness(w)]));
  const activities = rawActivities.map((a) => ({ id: String(a.id), ...normalizeActivity(a) }));
  const days = [];
  for (let i = RECOMPUTE_DAYS - 1; i >= 0; i--) {
    days.push(summarizeDay({ date: addDays(today, -i), wellnessByDate, activities, weights }));
  }
  return { wellnessCount: rawWellness.length, activities, days };
}
