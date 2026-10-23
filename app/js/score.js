// 컨디션 점수 (CLAUDE.md 6장). AI가 아니라 정해진 계산식.
// 점수 = 수면 40 + 회복 40 + 운동 부하 20. 남이 아니라 "내 최근 30일"과 비교한다.
// GitHub Actions(scripts/sync.mjs)와 앱이 같이 쓰므로 DOM·Node 전용 API를 쓰지 않는다.

export const FORMULA_VERSION = 1;
export const DEFAULT_WEIGHTS = { sleep: 40, recovery: 40, load: 20 };
export const BASELINE_WINDOW_DAYS = 30;
export const BASELINE_MIN_DAYS = 14;   // 이보다 적으면 "기준값 수집 중"

const H = 3600;
// 적정 수면 시간 = 내 최근 30일 중앙값을 성인 권장 범위(7~9시간)로 제한
const SLEEP_TARGET_MIN = 7 * H;
const SLEEP_TARGET_MAX = 9 * H;
// 존3 이상이 이만큼이면 "고강도한 날"
const HIGH_INTENSITY_SECS = 20 * 60;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const round2 = (x) => Math.round(x * 100) / 100;
const round1 = (x) => Math.round(x * 10) / 10;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 'YYYY-MM-DD' 날짜 계산 (시간대 영향 없음)
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function bandOf(total) {
  if (!isNum(total)) return null;
  if (total >= 80) return 'good';
  if (total >= 60) return 'normal';
  return 'low';
}

// 기준값: 해당 날짜 "이전" 30일 (당일 제외). 수면·HRV·안정시 심박이 모두 있는 날만 센다.
export function computeBaseline(wellnessByDate, date) {
  const rows = [];
  for (let i = 1; i <= BASELINE_WINDOW_DAYS; i++) {
    const w = wellnessByDate[addDays(date, -i)];
    if (w && isNum(w.sleepSecs) && isNum(w.hrv) && isNum(w.restingHR)) rows.push(w);
  }
  if (rows.length === 0) {
    return { days: 0, ready: false, hrv30: null, restingHR30: null, sleepTargetSecs: null };
  }
  const target = median(rows.map((r) => r.sleepSecs));
  return {
    days: rows.length,
    ready: rows.length >= BASELINE_MIN_DAYS,
    hrv30: round1(mean(rows.map((r) => r.hrv))),
    restingHR30: round1(mean(rows.map((r) => r.restingHR))),
    sleepTargetSecs: Math.round(Math.min(SLEEP_TARGET_MAX, Math.max(SLEEP_TARGET_MIN, target))),
  };
}

export function isHighIntensity(activity) {
  const z = activity.hrZoneSecs;
  if (!Array.isArray(z)) return false;
  return z.slice(2).reduce((s, x) => s + (isNum(x) ? x : 0), 0) >= HIGH_INTENSITY_SECS;
}

// 운동 부하: 최근 7일(당일 포함) vs 그 앞 4주의 주 평균, 그리고 어제·그제 연속 고강도 여부
export function computeLoad(activities, date) {
  const sum = (from, to) => activities
    .filter((a) => a.date >= from && a.date <= to)
    .reduce((s, a) => s + (isNum(a.trainingLoad) ? a.trainingLoad : 0), 0);
  const load7 = sum(addDays(date, -6), date);
  const load28avg = sum(addDays(date, -34), addDays(date, -7)) / 4;
  const highOn = (d) => activities.some((a) => a.date === d && isHighIntensity(a));
  return {
    load7: Math.round(load7),
    load28avg: round1(load28avg),
    loadRatio: load28avg > 0 ? round2(load7 / load28avg) : null,
    consecutiveHigh: highOn(addDays(date, -1)) && highOn(addDays(date, -2)),
  };
}

// 각 항목은 0~1 비율로 계산한 뒤 비중을 곱한다 (10단계에서 비중만 바꿔 보정)
export function computeScore({ wellness, baseline, load, weights = DEFAULT_WEIGHTS }) {
  if (!baseline?.ready) return null;
  if (!wellness || !isNum(wellness.sleepSecs) || !isNum(wellness.hrv) || !isNum(wellness.restingHR)) return null;

  // 수면: 적정 시간과의 차이 + 가민 수면 점수. 부족은 2시간이면 0, 초과는 1시간까지 감점 없음
  const diff = wellness.sleepSecs - baseline.sleepTargetSecs;
  const duration = diff >= 0
    ? Math.max(0.75, 1 - Math.max(0, diff - H) / (4 * H))
    : clamp01(1 + diff / (2 * H));
  const quality = isNum(wellness.sleepScore) ? clamp01(wellness.sleepScore / 100) : null;
  const sleep = quality == null ? duration : (duration + quality) / 2;

  // 회복: HRV가 평소의 75% 이하면 0, 안정시 심박이 평소 +8bpm 이상이면 0
  const hrv = clamp01((wellness.hrv / baseline.hrv30 - 0.75) / 0.25);
  const restingHR = clamp01(1 - (wellness.restingHR - baseline.restingHR30) / 8);
  const recovery = (hrv + restingHR) / 2;

  // 운동 부하: 7일 부하가 4주 평균의 1.3배를 넘으면 감점(2배에서 최대), 연속 고강도 감점
  const ratioPenalty = isNum(load?.loadRatio) ? clamp01((load.loadRatio - 1.3) / 0.7) * 0.7 : 0;
  const streakPenalty = load?.consecutiveHigh ? 0.3 : 0;
  const loadFrac = clamp01(1 - ratioPenalty - streakPenalty);

  const parts = {
    sleep: Math.round(sleep * weights.sleep),
    recovery: Math.round(recovery * weights.recovery),
    load: Math.round(loadFrac * weights.load),
  };
  const total = parts.sleep + parts.recovery + parts.load;
  return {
    total,
    ...parts,
    band: bandOf(total),
    weights: { ...weights },
    formulaVersion: FORMULA_VERSION,
    // 점수 설명(AI 문장)과 비중 보정(10단계)에 쓰는 0~1 세부값
    detail: {
      sleepDuration: round2(duration),
      sleepQuality: quality == null ? null : round2(quality),
      hrv: round2(hrv),
      restingHR: round2(restingHR),
      load: round2(loadFrac),
    },
  };
}

// 경고: 진단이 아니라 "며칠째 이런 패턴" 감지 (문장은 AI가 씀)
export function detectWarnings(wellnessByDate, baseline, date) {
  if (!baseline?.ready) return [];
  const streak = (test) => {
    let n = 0;
    for (let i = 0; i < 14; i++) {
      const w = wellnessByDate[addDays(date, -i)];
      if (w && test(w)) n++;
      else break;
    }
    return n;
  };
  const out = [];
  const strain = streak((w) => isNum(w.hrv) && isNum(w.restingHR)
    && w.restingHR >= baseline.restingHR30 + 5 && w.hrv <= baseline.hrv30 * 0.85);
  if (strain >= 3) out.push({ code: 'rhr_up_hrv_down', days: strain });
  const short = streak((w) => isNum(w.sleepSecs) && w.sleepSecs <= baseline.sleepTargetSecs - 1.5 * H);
  if (short >= 3) out.push({ code: 'short_sleep', days: short });
  return out;
}

// 하루치 요약 → Firestore days/{date} 에 그대로 저장하는 모양 (docs/data-model.md)
export function summarizeDay({ date, wellnessByDate, activities, weights = DEFAULT_WEIGHTS }) {
  const wellness = wellnessByDate[date] ?? null;
  const baseline = computeBaseline(wellnessByDate, date);
  const load = computeLoad(activities, date);
  const score = computeScore({ wellness, baseline, load, weights });
  return {
    date,
    wellness,
    baseline: { ...baseline, ...load },
    score,
    // collecting: 기준값 수집 중 / missing: 오늘 데이터 아직 없음 / ok
    status: !baseline.ready ? 'collecting' : score ? 'ok' : 'missing',
    warnings: detectWarnings(wellnessByDate, baseline, date),
  };
}
