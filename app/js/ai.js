// Gemini 코칭 (CLAUDE.md 4장·5장). 무료 플랜은 입력이 학습에 쓰일 수 있으므로
// 이름·이메일·활동 제목·메모는 보내지 않고 수치와 종목·운동 이름만 보낸다.
import { addDays } from './score.js';
import { dateRange, pickDisplayDay } from './model.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(status) {
    super(status === 429 ? 'Gemini 무료 한도를 넘었어요. 잠시 후 다시 시도해 주세요.'
      : status === 400 || status === 401 || status === 403 ? 'Gemini API 키를 확인해 주세요.'
      : `Gemini 오류 (HTTP ${status})`);
    this.status = status;
  }
}

// 사용 가능한 모델 중 최신 일반 flash 모델 (모델 이름이 바뀌어도 동작하게 목록에서 고른다)
let cachedModel = null;
async function pickModel(key) {
  if (cachedModel) return cachedModel;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw new GeminiError(res.status);
  const { models = [] } = await res.json();
  const names = models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name);
  const version = (n) => parseFloat(n.match(/gemini-([\d.]+)/)?.[1] ?? '0');
  const stable = names.filter((n) => /^models\/gemini-[\d.]+-flash$/.test(n)).sort((a, b) => version(b) - version(a));
  const pick = stable[0]
    ?? names.find((n) => /flash/.test(n) && !/(lite|image|tts|audio|live|embedding)/.test(n))
    ?? names[0];
  if (!pick) throw new Error('사용할 수 있는 Gemini 모델이 없어요.');
  cachedModel = pick;
  return pick;
}

async function generate(key, system, payload, schema) {
  const model = await pickModel(key);
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.5 },
    }),
  });
  if (!res.ok) throw new GeminiError(res.status);
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini 응답이 비어 있어요.');
  return { model: model.replace('models/', ''), result: JSON.parse(text) };
}

const str = { type: 'STRING' };
const objectOf = (keys) => ({ type: 'OBJECT', properties: Object.fromEntries(keys.map((k) => [k, str])), required: keys });

const COMMON = `
- 건강이 우선이다. 퍼포먼스 향상은 보조 관점이다.
- 진단하지 않는다. 걱정되는 패턴은 "이런 패턴이 보이니 이어지면 병원에서 확인해 보세요" 수준으로만 말한다.
- 남과 비교하지 않고 이 사람의 평소(baseline·최근 기록)와 비교한다.
- 입력 수치를 근거로 구체적으로 말한다. 입력에 없는 데이터(수면 단계, SpO2, 호흡수, 스트레스 등)는 추측하거나 언급하지 않는다.
- 한국어 존댓말 '~요'체. 짧고 실천할 수 있게. 이모지·마크다운 쓰지 않는다.`;

const SLEEP_SYSTEM = `너는 수면·회복을 건강 관점에서 봐 주는 코치다.${COMMON}
- sleepQuality는 1 아주 좋음 ~ 4 나쁨 척도다. 컨디션 점수는 수면40+회복40+운동부하20 고정 계산식이며 band는 good/normal/low다.
- headline: 오늘 아침 홈 화면 한 줄(45자 안팎). 오늘 어떻게 지내면 좋을지까지.
- today: 어젯밤 수면과 회복을 평소와 비교한 평가 1~2문장.
- pattern: 최근 14일 기록에서 보이는 패턴과 이 사람에게 맞는 수면 습관 제안 1~2문장. 데이터가 적으면 그렇다고 말한다.
- caution: 건강 경고가 필요할 때만 1문장, 없으면 빈 문자열.
- tonight: 오늘 밤 실천할 것 한 가지(취침 시각·운동 강도 등) 1문장.`;

const EXERCISE_SYSTEM = `너는 두 역할을 한다.${COMMON}
1) 건강 전문가(health): 최근 7일 운동 시간이 주 150분 권장에 맞는지, 강도 분포(대부분 존2 이하가 바람직, 존2 상한 zone2MaxHr bpm), 급격한 부하 증가(최근 7일 ÷ 그 앞 4주 주평균)와 회복 지표(HRV·안정시 심박)를 함께 본 과훈련·부상 위험, 꾸준함. 2~3문장.
2) 종목 코치(coach): 기록을 보고 다음에 어떻게 할지 구체적으로 추천한다(거리·시간·페이스·심박 범위·세트 등). 각 2~3문장.
   - run(러닝)·trail(트레일): 페이스와 심박의 관계(같은 심박에서 페이스 변화), 존 분포, 케이던스, 인터벌 구성, 롱런 비중. 러닝이 가장 중요하니 가장 자세히.
   - swim(수영): 100m 페이스, 거리, 빈도.
   - strength(헬스): 운동 종목·무게·세트×횟수의 진행, 러닝과의 균형.
   - all: 종목 전체를 보는 이번 주 계획 요약.
   - 해당 종목 기록이 없으면 그 종목은 빈 문자열.
- warning: 회복 지표가 나쁘거나 부하가 급증해 코치 추천보다 휴식이 먼저일 때만 1문장, 없으면 빈 문자열. 건강 경고가 코치 추천과 충돌하면 코치 문장도 그에 맞춰 낮춘다.`;

const SLEEP_SCHEMA = objectOf(['headline', 'today', 'pattern', 'caution', 'tonight']);
const EXERCISE_SCHEMA = {
  type: 'OBJECT',
  properties: { warning: str, health: str, coach: objectOf(['all', 'run', 'trail', 'swim', 'strength']) },
  required: ['warning', 'health', 'coach'],
};

const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const mins = (secs) => (secs == null ? null : Math.round(secs / 60));
const paceStr = (secsPerKm) => (secsPerKm ? `${Math.floor(secsPerKm / 60)}:${String(Math.round(secsPerKm % 60)).padStart(2, '0')}` : null);

function activityForAI(a) {
  const km = a.distanceM ? a.distanceM / 1000 : null;
  const run = a.sport === 'run' || a.sport === 'trail';
  return {
    date: a.date,
    sport: a.sport,
    minutes: mins(a.movingSecs),
    distanceKm: r1(km),
    pacePerKm: run && km && a.movingSecs ? paceStr(a.movingSecs / km) : null,
    gapPerKm: run && a.gap ? paceStr(1000 / a.gap) : null,
    swimPer100m: a.sport === 'swim' && a.distanceM && a.movingSecs ? paceStr(a.movingSecs / (a.distanceM / 100)) : null,
    avgHr: a.avgHr ? Math.round(a.avgHr) : null,
    maxHr: a.maxHr ?? null,
    cadence: a.cadence ? Math.round(a.cadence) : null,
    elevationGainM: a.elevationGainM ? Math.round(a.elevationGainM) : null,
    trainingLoad: a.trainingLoad ?? null,
    hrZoneMinutes: Array.isArray(a.hrZoneSecs) ? a.hrZoneSecs.map((s) => mins(s)) : null,
    hrZoneUpperBpm: a.hrZones ?? null,
    intervals: a.intervalSummary ?? null,
    rpe: a.rpe ?? null,
  };
}

function wellnessForAI(w) {
  if (!w) return null;
  return { sleepMin: mins(w.sleepSecs), sleepScore: w.sleepScore, sleepQuality: w.sleepQuality, hrv: w.hrv, restingHR: w.restingHR };
}

function recoveryForAI(day) {
  if (!day) return null;
  return {
    date: day.date,
    score: day.score ? { total: day.score.total, band: day.score.band, sleep: day.score.sleep, recovery: day.score.recovery, load: day.score.load } : null,
    lastNight: wellnessForAI(day.wellness),
    baseline: day.baseline ? {
      hrv30: day.baseline.hrv30, restingHR30: day.baseline.restingHR30, sleepTargetMin: mins(day.baseline.sleepTargetSecs),
      load7: day.baseline.load7, load28weeklyAvg: day.baseline.load28avg, loadRatio: day.baseline.loadRatio,
    } : null,
    warnings: (day.warnings ?? []).map((w) => `${w.code}:${w.days}일`),
  };
}

function sleepPayload(data, day) {
  const yesterday = addDays(day.date, -1);
  const taken = data.checkins[yesterday]?.supplements ?? {};
  return {
    ...recoveryForAI(day),
    last14Nights: dateRange(day.date, 14).map((d) => ({ date: d, ...wellnessForAI(data.days[d]?.wellness) })),
    yesterdayTraining: data.activities.filter((a) => a.date === yesterday).map(activityForAI),
    supplementsTakenYesterday: data.supplements.filter((s) => taken[s.id]?.taken).map((s) => s.name),
    usualBedtime: data.settings.bedtime ?? null,
  };
}

function exercisePayload(data, day) {
  const weeks = [0, 1, 2, 3].map((w) => {
    const to = addDays(data.today, -7 * w);
    const from = addDays(to, -6);
    const acts = data.activities.filter((a) => a.date >= from && a.date <= to);
    return {
      from, to,
      minutes: mins(acts.reduce((s, a) => s + (a.movingSecs ?? 0), 0)),
      load: Math.round(acts.reduce((s, a) => s + (a.trainingLoad ?? 0), 0)),
      sessions: acts.length,
    };
  });
  return {
    today: data.today,
    zone2MaxHr: data.settings.zone2MaxHr ?? 140,
    recovery: recoveryForAI(day),
    weeklyTotals: weeks,
    activities: [...data.activities].sort((a, b) => b.date.localeCompare(a.date)).map(activityForAI),
    strengthLogs: data.strength.map((s) => ({
      date: s.date,
      exercises: (s.exercises ?? []).map((e) => ({ name: e.name, kg: e.weightKg, sets: e.sets, reps: e.reps })),
    })),
  };
}

// 같은 입력이면 다시 부르지 않기 위한 키
function sleepKey(day) {
  const w = day?.wellness;
  if (w?.sleepSecs == null) return null;
  return [day.date, w.sleepSecs, w.sleepScore, w.hrv, w.restingHR, day.score?.total ?? '-'].join('|');
}

function exerciseKey(data) {
  const from = addDays(data.today, -13);
  const ids = data.activities.filter((a) => a.date >= from).map((a) => a.id).sort();
  const logs = data.strength.filter((s) => s.date >= from).map((s) => `${s.id}:${(s.exercises ?? []).length}`).sort();
  if (!ids.length && !logs.length) return null;
  return [data.today, ...ids, ...logs].join('|');
}

// 동기화 후 실행. 새 데이터가 있을 때만 Gemini 호출 (최대 2회)
export async function runCoaching(fb, uid, data, onStep = () => {}) {
  const key = data.keys.geminiApiKey;
  if (!key) return { done: [], skipped: 'no-key' };
  const { doc, setDoc, serverTimestamp } = fb.fs;
  const done = [];
  const day = pickDisplayDay(data);

  const sk = sleepKey(day);
  if (sk && day.ai?.sleepKey !== sk) {
    onStep('수면 분석 중…');
    const { model, result } = await generate(key, SLEEP_SYSTEM, sleepPayload(data, day), SLEEP_SCHEMA);
    const ai = {
      headline: result.headline,
      sleep: { today: result.today, pattern: result.pattern, caution: result.caution, tonight: result.tonight },
      sleepKey: sk,
      model,
    };
    await setDoc(doc(fb.db, 'users', uid, 'days', day.date), { ai: { ...ai, createdAt: serverTimestamp() } }, { merge: true });
    day.ai = { ...ai, createdAt: new Date() };
    done.push('sleep');
  }

  const ek = exerciseKey(data);
  if (ek && data.exerciseCoach?.key !== ek) {
    onStep('운동 코칭 중…');
    const { model, result } = await generate(key, EXERCISE_SYSTEM, exercisePayload(data, day), EXERCISE_SCHEMA);
    const coach = { ...result, key: ek, date: data.today, model };
    await setDoc(doc(fb.db, 'users', uid, 'coach', 'exercise'), { ...coach, createdAt: serverTimestamp() });
    data.exerciseCoach = { ...coach, createdAt: new Date() };
    done.push('exercise');
  }
  return { done };
}
