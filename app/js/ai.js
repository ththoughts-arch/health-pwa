// Gemini 코칭 (CLAUDE.md 4장·5장). 무료 플랜은 입력이 학습에 쓰일 수 있으므로
// 이름·이메일·활동 제목·메모는 보내지 않고 수치와 종목·운동 이름만 보낸다.
import { addDays } from './score.js';
import { dateRange, pickDisplayDay, strengthLogsBetween, strengthSecs, tonightBedtime } from './model.js';
import { shiftTime } from './format.js';
import { setsOf } from './strength.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';

// detail: Gemini가 돌려준 오류 문구 (개인정보 없음, 원인 파악용으로 화면에 함께 표시)
export class GeminiError extends Error {
  constructor(status, detail = '') {
    const keyProblem = status === 401 || status === 403 || (status === 400 && /api key/i.test(detail));
    const base = status === 429 ? 'Gemini 무료 한도를 넘었어요. 잠시 후 다시 동기화해 주세요.'
      : keyProblem ? 'Gemini API 키를 확인해 주세요.'
      : BUSY.includes(status) ? 'Gemini 서버가 바빠요. 잠시 후 다시 동기화해 주세요.'
      : `Gemini 요청 오류 (HTTP ${status})`;
    super(detail ? `${base} [${detail.slice(0, 140)}]` : base);
    this.status = status;
    this.detail = detail;
    this.keyProblem = keyProblem;
  }
}

async function errorFrom(res) {
  let detail = '';
  try { detail = (await res.json())?.error?.message ?? ''; } catch { /* 본문 없음 */ }
  return new GeminiError(res.status, detail);
}

// 서버가 바쁠 때(일시적) → 기다렸다 재시도, 그래도 안 되면 다음 모델
const BUSY = [500, 502, 503, 504];
const RETRY_WAITS_MS = [1500, 4000];
const MAX_MODELS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 후보 모델: 최신 일반 flash → flash-lite → 기타 flash (모델 이름이 바뀌어도 동작하게 목록에서 고른다)
let cachedModels = null;
async function candidateModels(key) {
  if (cachedModels) return cachedModels;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw await errorFrom(res);
  const { models = [] } = await res.json();
  const names = models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name);
  const version = (n) => parseFloat(n.match(/gemini-([\d.]+)/)?.[1] ?? '0');
  const byVersion = (re) => names.filter((n) => re.test(n)).sort((a, b) => version(b) - version(a));
  const list = [...new Set([
    ...byVersion(/^models\/gemini-[\d.]+-flash$/),
    ...byVersion(/^models\/gemini-[\d.]+-flash-lite$/),
    ...names.filter((n) => /flash/.test(n) && !/(image|tts|audio|live|embedding)/.test(n)),
  ])].slice(0, MAX_MODELS);
  if (!list.length) throw new Error('사용할 수 있는 Gemini 모델이 없어요.');
  // 이 기기에서 지난번에 성공한 모델이 아직 목록에 있으면 먼저 쓴다
  const preferred = readPreferred();
  cachedModels = preferred && names.includes(preferred) ? [preferred, ...list.filter((m) => m !== preferred)] : list;
  return cachedModels;
}

const PREFERRED_KEY = 'gemini.preferredModel';
function readPreferred() {
  try { return localStorage.getItem(PREFERRED_KEY); } catch { return null; }
}
function rememberModel(model) {
  try { localStorage.setItem(PREFERRED_KEY, model); } catch { /* 저장 못 해도 동작에는 지장 없음 */ }
}

// 응답 본문 → JSON. 비었거나 잘렸으면 이유(finishReason)를 담아 오류
function parseResult(json) {
  const cand = json.candidates?.[0];
  const text = cand?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  const why = cand?.finishReason ?? json.promptFeedback?.blockReason ?? '이유 없음';
  if (!text) throw new Error(`Gemini 응답이 비어 있어요 (${why})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Gemini 응답을 읽지 못했어요 (${why})`);
  }
}

async function callModel(key, model, body) {
  for (let attempt = 0; ; attempt++) {
    // 한 번 호출이 너무 오래 걸리면 끊고 다음 모델로 (generate에서 처리)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`${CALL_TIMEOUT_MS / 1000}초 안에 응답이 없어요`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return res.json();
    if (!BUSY.includes(res.status) || attempt >= RETRY_WAITS_MS.length) throw await errorFrom(res);
    await sleep(RETRY_WAITS_MS[attempt]);
  }
}

const CALL_TIMEOUT_MS = 30000;
// 최신 모델은 답하기 전 생각(thinking)에 시간을 쓴다 → 짧게(low). 지원하지 않는 모델은 빼고 다시 보낸다
const THINKING = { thinkingLevel: 'low' };
const noThinkingConfig = new Set();

function requestBody(system, payload, schema, withThinking) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.5,
      ...(withThinking ? { thinkingConfig: THINKING } : {}),
    },
  });
}

async function callWithThinkingFallback(key, model, system, payload, schema) {
  if (!noThinkingConfig.has(model)) {
    try {
      return await callModel(key, model, requestBody(system, payload, schema, true));
    } catch (e) {
      if (!(e instanceof GeminiError && e.status === 400 && /thinking/i.test(e.detail))) throw e;
      noThinkingConfig.add(model);
    }
  }
  return callModel(key, model, requestBody(system, payload, schema, false));
}

async function generate(key, system, payload, schema) {
  const models = await candidateModels(key);
  const errors = [];
  for (const model of models) {
    const name = model.replace('models/', '');
    try {
      const result = parseResult(await callWithThinkingFallback(key, model, system, payload, schema));
      // 이번에 된 모델을 다음 호출(이 기기에서는 다음에 앱을 열 때도) 먼저 쓴다
      cachedModels = [model, ...models.filter((m) => m !== model)];
      rememberModel(model);
      return { model: name, result };
    } catch (e) {
      // 키 문제는 다른 모델로 바꿔도 같으니 바로 중단. 그 밖(바쁨·한도·요청 오류·응답 잘림)은 다음 모델로
      if (e instanceof GeminiError && e.keyProblem) throw e;
      errors.push(`${name}: ${e.message}`);
    }
  }
  // 모든 모델 실패: 모델별 이유를 함께 보여 준다
  throw new Error(errors.join(' / '));
}

// 설정의 "AI 연결 테스트": 후보 모델마다 짧은 JSON 응답을 요청해 결과를 줄 단위로 돌려준다
export async function diagnoseGemini(key) {
  cachedModels = null;
  let models;
  try {
    models = await candidateModels(key);
  } catch (e) {
    return [`모델 목록: ${e.message}`];
  }
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: '{"ping":1}' }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: objectOf(['ok']), maxOutputTokens: 20 },
  });
  const lines = [`후보 모델: ${models.map((m) => m.replace('models/', '')).join(', ')}`];
  for (const model of models) {
    const res = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body,
    });
    const name = model.replace('models/', '');
    lines.push(res.ok ? `${name}: 성공` : `${name}: ${(await errorFrom(res)).message}`);
  }
  return lines;
}

const str = { type: 'STRING' };
const objectOf = (keys) => ({ type: 'OBJECT', properties: Object.fromEntries(keys.map((k) => [k, str])), required: keys });

const COMMON = `
- 건강이 우선이다. 퍼포먼스 향상은 보조 관점이다.
- 진단하지 않는다. 걱정되는 패턴은 "이런 패턴이 보이니 이어지면 병원에서 확인해 보세요" 수준으로만 말한다.
- 남과 비교하지 않고 이 사람의 평소(baseline·최근 기록)와 비교한다.
- 입력 수치를 근거로 구체적으로 말한다. 입력에 없는 데이터(수면 단계, SpO2, 호흡수, 스트레스 등)는 추측하거나 언급하지 않는다.
- 한국어 존댓말 '~요'체. 짧고 실천할 수 있게. 이모지·마크다운 쓰지 않는다.`;

const SLEEP_SYSTEM = `너는 수면·회복을 건강 관점에서 자세히 봐 주는 코치다.${COMMON}
- sleepQuality는 1 아주 좋음 ~ 4 나쁨 척도다. 컨디션 점수는 수면40+회복40+운동부하20 고정 계산식이며 band는 good/normal/low다.
- stats는 앱이 계산한 값이다: last7(최근 7일 평균), sleepDebt7Min(최근 7일 적정 수면 대비 부족분 합, 분), sleepStdMin(14일 수면 시간 표준편차, 클수록 불규칙), weekdayAvgMin/weekendAvgMin, hrvOnTargetNights/hrvOnShortNights(적정 수면을 채운 밤과 못 채운 밤의 평균 HRV), hrv7vs30Pct, restingHR7vs30.
- 모든 항목은 입력 숫자를 직접 인용하며 2~3문장. 판단할 데이터가 없으면 빈 문자열.
- headline: 오늘 아침 홈 화면 한 줄(45자 안팎). 오늘 어떻게 지내면 좋을지까지.
- today: 어젯밤 수면 시간·점수·질을 평소·적정 수면과 비교한 평가.
- recovery: 밤사이 HRV·안정시 심박을 30일 기준과 비교하고, 최근 7일 흐름(hrv7vs30Pct·restingHR7vs30)이 오르는지 내려가는지.
- debt: 최근 7일 수면 빚이 얼마나 쌓였는지와 며칠에 걸쳐 어떻게 갚을지(하루 몇 분 더 자기 등).
- pattern: 규칙성(표준편차·평일/주말 차이)과 이 사람에게서 보이는 관계(적정 수면을 채운 밤의 HRV 차이 등), 이 사람에게 맞는 수면 습관.
- training: 어제 운동(종료 시각·강도·부하)이 어젯밤 수면에 준 영향과 오늘 운동 강도 제안. 어제 운동이 없으면 빈 문자열.
- supplements: 어제 먹은 영양제와 수면의 관계는 데이터가 적으면 '참고 수준'이라고 밝히고 짧게. 없으면 빈 문자열.
- tonight: 오늘 밤 권장 잠드는 시각(usualBedtime·수면 빚 반영, 'HH:MM')과 실천 두 가지(카페인 마감 시각, 저녁 운동 강도, 화면 끄기 등).
- caution: 건강 경고가 필요할 때만, 없으면 빈 문자열.`;

const EXERCISE_SYSTEM = `너는 두 역할을 한다.${COMMON}
1) 건강 전문가(health): 최근 7일 운동 시간이 주 150분 권장에 맞는지, 강도 분포(대부분 존2 이하가 바람직, 존2 상한 zone2MaxHr bpm), 급격한 부하 증가(최근 7일 ÷ 그 앞 4주 주평균)와 회복 지표(HRV·안정시 심박)를 함께 본 과훈련·부상 위험, 꾸준함. 2~3문장.
2) 종목 코치(coach): 기록을 보고 다음에 어떻게 할지 구체적으로 추천한다(거리·시간·페이스·심박 범위·세트 등). 각 2~3문장.
   - run(러닝)·trail(트레일): 페이스와 심박의 관계(같은 심박에서 페이스 변화), 존 분포, 케이던스, 인터벌 구성, 롱런 비중. 러닝이 가장 중요하니 가장 자세히.
   - swim(수영): 100m 페이스 변화와 후반 처짐, 세트 구성, 주간 거리·빈도. 다음 수영을 '8×100m @2:05 휴식 20초'처럼 세트로 적고 드릴 하나를 붙인다. 3~4문장.
   - strength(헬스): strengthLogs의 세트별 kg·reps(warmup은 워밍업 세트라 본세트 평가에서 뺀다)로 본 종목별 무게·횟수 진행, 러닝과의 균형. 헬스는 시간(minutes)만 직접 적어 weeklyTotals.minutes에 들어가고 훈련 부하(load)에는 들어가지 않는다.
   - all: 종목 전체를 보는 이번 주 계획 요약.
   - 해당 종목 기록이 없으면 그 종목은 빈 문자열.
- warning: 회복 지표가 나쁘거나 부하가 급증해 코치 추천보다 휴식이 먼저일 때만 1문장, 없으면 빈 문자열. 건강 경고가 코치 추천과 충돌하면 코치 문장도 그에 맞춰 낮춘다.
3) 오늘의 운동(todayWorkout): today(날짜)·todayWeekday(요일)에 할 운동 하나.
   - trainingPlanNotes(사용자가 공유한 훈련 계획 메모)에 오늘 요일·날짜에 해당하는 운동이 있으면 그것을 기본으로 한다. 계획에 없으면 최근 기록과 주간 흐름으로 정한다(휴식일 포함).
   - 회복 상태(recovery의 score·warnings, warning)가 나쁘면 강도·시간을 낮추거나 휴식으로 바꾸고, 그 이유를 reason에 적는다.
   - activities에 오늘 날짜 기록이 이미 있으면 계획한 운동을 마쳤는지 판단해 title을 '완료: …'로 하고, plan에 남은 회복·보강을 적는다.
   - title: 운동 이름과 핵심 수치 한 줄(예: '존2 러닝 50분', '수영 1,500m 인터벌', '휴식').
   - plan: 워밍업 → 메인 → 쿨다운 구성과 페이스·심박 범위(존2 상한 zone2MaxHr)·세트를 구체적으로 2~3문장.
   - reason: 계획 메모의 어느 부분을 따랐는지와 회복 상태를 근거로 왜 이 운동인지 1~2문장.`;

const RUN_SYSTEM = `너는 러닝 코치이자 건강 전문가다. 러닝 한 번을 아주 자세히 분석한다.${COMMON}
- 입력: run(이번 러닝 요약), splits(1km 구간별 paceSecPerKm·심박·케이던스·상승, 마지막은 partialM 미터짜리 남은 구간일 수 있음), firstHalf/secondHalf(시간 기준 전반·후반), decouplingPct(같은 심박 대비 속도 저하율. 5% 미만이면 유산소 기반이 안정적), hrDriftBpm, laps(랩·인터벌), recentRuns(최근 같은 종목 기록), recovery(그날 회복 상태), zone2MaxHr, hrZoneUpperBpm(존별 상한 bpm), trainingPlanNotes(사용자가 공유한 훈련 계획 메모. 있으면 계획 대비로 평가).
- 페이스는 초/km 값을 'm:ss/km'로 바꿔 말한다. 케이던스가 100 미만이면 한쪽 발 기준이므로 2배(분당 걸음 수)로 말한다.
- 각 항목은 숫자를 근거로 2~4문장. 판단할 데이터가 없으면 빈 문자열.
- summary: 어떤 성격의 훈련이었고 잘 됐는지 한눈에.
- pacing: 구간별 페이스 흐름(일정했는지, 후반 빨라짐/느려짐, 언덕 영향).
- heartRate: 존 분포와 존2 기준 강도 평가, 심박 드리프트·디커플링 해석.
- form: 케이던스, 오르막·내리막 등 효율 관련.
- intervals: 인터벌·랩 구성이 있었다면 반복별 일관성. 없으면 빈 문자열.
- comparison: recentRuns와 비교해 좋아진 점·아쉬운 점(같은 심박에서의 페이스 등).
- nextRun: 다음 러닝 구체 제안(종류, 거리·시간, 페이스 범위, 심박 범위). 회복 상태가 나쁘면 그에 맞춰 낮춘다.
- caution: 부상·과훈련·건강 위험 신호가 있을 때만, 없으면 빈 문자열.`;

const SWIM_SYSTEM = `너는 수영 코치이자 건강 전문가다. 수영 한 번을 아주 자세히 분석한다.${COMMON}
- 입력: swim(이번 수영 요약: 거리·시간·swimPer100m·poolLengthM·lengths), splits(100m 구간별 paceSecPerKm = 100m당 초, 마지막은 partialM 미터짜리 남은 구간일 수 있음), firstHalf/secondHalf(시간 기준 전반·후반 100m 페이스), laps(세트: type WORK=수영, RECOVERY=휴식, distanceM·movingSecs·paceSecPerKm=100m당 초), recentSwims(최근 수영 기록), recovery(그날 회복 상태), trainingPlanNotes(사용자가 공유한 훈련 계획 메모).
- 페이스는 100m당 초를 'm:ss/100m'로 바꿔 말한다. 수영 심박은 손목 측정이라 없거나 부정확할 수 있으니 있으면 참고만 한다. 영법·스트로크 수 데이터는 없으니 추측하지 않는다.
- 각 항목은 숫자를 근거로 2~4문장. 판단할 데이터가 없으면 빈 문자열.
- summary: 어떤 성격의 수영(지구력·인터벌·회복 등)이었고 잘 됐는지.
- pacing: 100m 구간 페이스 흐름(일정했는지, 후반 처짐 정도와 원인 추정).
- sets: 세트·휴식 구성과 세트별 일관성. 세트 구분이 없으면 빈 문자열.
- heartRate: 심박이 있으면 강도 평가, 없으면 빈 문자열.
- technique: 페이스 처짐·세트 간 편차로 볼 때 보완할 점과 드릴 1~2개(예: 캐치업, 사이드킥).
- comparison: recentSwims와 비교해 좋아진 점·아쉬운 점.
- nextSwim: 다음 수영 세트를 구체적으로(워밍업·메인 세트 '8×100m @2:05 휴식 20초'·쿨다운, 총거리).
- caution: 과훈련·건강 위험 신호가 있을 때만, 없으면 빈 문자열.`;

const DAY_SYSTEM = `너는 이 사람의 하루를 건강 관점에서 챙겨 주는 코치다.${COMMON}
- now(현재 시각 HH:MM)부터 잠들 때까지 남은 하루를 어떻게 보내면 좋을지 말한다. 이미 지난 시간대 이야기는 하지 않는다. 늦은 밤이면 잠자리 준비에 집중한다.
- 입력: now, weekday, condition(오늘 컨디션 점수·구간·경고, 어젯밤 수면·HRV·안정시 심박과 평소 기준), sleepDebt7Min(최근 7일 수면 빚, 분), doneToday(오늘 이미 한 운동·헬스), plannedWorkout(오늘의 운동 계획, 없을 수 있음), weekMinutes(최근 7일 운동 시간, 목표 주 150분), supplementsLeft(아직 안 먹은 영양제의 시간대·알림 시각), tonightBedtime(오늘 밤 권장 잠드는 시각), usualBedtime.
- 식사는 이 앱에서 기록하지 않으니 식단 처방은 하지 않는다(수분·카페인 정도는 괜찮다).
- headline: 지금 상태 한 줄 요약과 남은 하루의 핵심(45자 안팎).
- exercise: 남은 운동을 할지, 한다면 언제·어떤 강도·얼마나. 이미 했으면 회복(스트레칭·가벼운 걷기 등). 1~2문장.
- supplements: 남은 영양제를 언제 먹을지. 남은 게 없으면 빈 문자열.
- evening: 저녁부터 잠들 때까지 카페인 마감 시각, 저녁 운동 강도, 화면 끄는 시각, 잠드는 시각. 1~2문장.
- caution: 회복 경고 등 주의가 필요할 때만 1문장, 없으면 빈 문자열.`;
const DAY_SCHEMA = objectOf(['headline', 'exercise', 'supplements', 'evening', 'caution']);

const SLEEP_FIELDS = ['today', 'recovery', 'debt', 'pattern', 'training', 'supplements', 'tonight', 'caution'];
const SLEEP_SCHEMA = objectOf(['headline', ...SLEEP_FIELDS]);
// 수면 프롬프트를 바꾸면 올린다 → 같은 날 데이터라도 새 형식으로 다시 분석
const SLEEP_PROMPT_VERSION = 2;
const RUN_SCHEMA = objectOf(['summary', 'pacing', 'heartRate', 'form', 'intervals', 'comparison', 'nextRun', 'caution']);
const SWIM_SCHEMA = objectOf(['summary', 'pacing', 'sets', 'heartRate', 'technique', 'comparison', 'nextSwim', 'caution']);
// 운동 코칭 형식을 바꾸면 올린다 → 다음 동기화 때 새 형식으로 다시 받음 (2: 오늘의 운동 추가)
const EXERCISE_PROMPT_VERSION = 2;
const EXERCISE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    warning: str,
    health: str,
    coach: objectOf(['all', 'run', 'trail', 'swim', 'strength']),
    todayWorkout: objectOf(['title', 'plan', 'reason']),
  },
  required: ['warning', 'health', 'coach', 'todayWorkout'],
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
    poolLengthM: a.sport === 'swim' ? a.poolLengthM ?? null : null,
    lengths: a.sport === 'swim' ? a.lengths ?? null : null,
    avgHr: a.avgHr ? Math.round(a.avgHr) : null,
    maxHr: a.maxHr ?? null,
    cadence: a.cadence ? Math.round(a.cadence) : null,
    elevationGainM: a.elevationGainM ? Math.round(a.elevationGainM) : null,
    trainingLoad: a.trainingLoad ?? null,
    hrZoneMinutes: Array.isArray(a.hrZoneSecs) ? a.hrZoneSecs.map((s) => mins(s)) : null,
    intervals: a.intervalSummary ?? null,
    rpe: a.rpe ?? null,
  };
}

// 값 없는 필드는 빼서 입력을 짧게 (응답 시간 단축)
function compact(o) {
  if (Array.isArray(o)) return o.map(compact);
  if (o && typeof o === 'object') {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, compact(v)]));
  }
  return o;
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

const avgOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// 수면 코칭이 근거로 쓸 통계 (AI가 계산하게 두지 않고 앱이 계산)
function sleepStats(data, day) {
  const nights = (n) => dateRange(day.date, n).map((d) => data.days[d]?.wellness).filter((w) => w?.sleepSecs != null);
  const n7 = nights(7);
  const n14 = nights(14);
  const target = day.baseline?.sleepTargetSecs;
  const b = day.baseline ?? {};
  const pick = (ws, k) => ws.map((w) => w[k]).filter((v) => v != null);
  const sleepMin14 = n14.map((w) => w.sleepSecs / 60);
  const mean14 = avgOf(sleepMin14);
  const std = mean14 == null ? null : Math.sqrt(avgOf(sleepMin14.map((m) => (m - mean14) ** 2)));
  const weekend = (d) => [0, 6].includes(new Date(`${d}T00:00:00`).getDay());
  const dated14 = dateRange(day.date, 14).map((d) => ({ d, w: data.days[d]?.wellness })).filter((x) => x.w?.sleepSecs != null);
  const hrv7 = avgOf(pick(n7, 'hrv'));
  const rhr7 = avgOf(pick(n7, 'restingHR'));
  const sleep7 = avgOf(pick(n7, 'sleepSecs'));
  return {
    last7: { sleepMin: sleep7 == null ? null : r1(sleep7 / 60), sleepScore: r1(avgOf(pick(n7, 'sleepScore'))), hrv: r1(hrv7), restingHR: r1(rhr7), nights: n7.length },
    sleepDebt7Min: target ? Math.round(n7.reduce((s, w) => s + Math.max(0, target - w.sleepSecs), 0) / 60) : null,
    sleepStdMin: std == null ? null : Math.round(std),
    weekdayAvgMin: r1(avgOf(dated14.filter((x) => !weekend(x.d)).map((x) => x.w.sleepSecs / 60))),
    weekendAvgMin: r1(avgOf(dated14.filter((x) => weekend(x.d)).map((x) => x.w.sleepSecs / 60))),
    hrvOnTargetNights: target ? r1(avgOf(n14.filter((w) => w.sleepSecs >= target && w.hrv != null).map((w) => w.hrv))) : null,
    hrvOnShortNights: target ? r1(avgOf(n14.filter((w) => w.sleepSecs < target && w.hrv != null).map((w) => w.hrv))) : null,
    hrv7vs30Pct: hrv7 != null && b.hrv30 ? r1(((hrv7 - b.hrv30) / b.hrv30) * 100) : null,
    restingHR7vs30: rhr7 != null && b.restingHR30 != null ? r1(rhr7 - b.restingHR30) : null,
  };
}

function sleepPayload(data, day) {
  const yesterday = addDays(day.date, -1);
  const taken = data.checkins[yesterday]?.supplements ?? {};
  return compact({
    ...recoveryForAI(day),
    stats: sleepStats(data, day),
    last14Nights: dateRange(day.date, 14).map((d) => ({ date: d, ...wellnessForAI(data.days[d]?.wellness) })),
    // 운동 끝난 시각이 수면에 영향 → 시작 시각과 시간을 함께
    yesterdayTraining: data.activities.filter((a) => a.date === yesterday).map((a) => ({
      ...activityForAI(a),
      startTime: a.startLocal?.slice(11, 16) ?? null,
    })),
    yesterdayStrengthMin: strengthSecs(strengthLogsBetween(data, yesterday, yesterday)) / 60 || null,
    supplementsTakenYesterday: data.supplements.filter((s) => taken[s.id]?.taken).map((s) => ({ name: s.name, slot: s.slot })),
    usualBedtime: data.settings.bedtime ?? null,
  });
}

function exercisePayload(data, day) {
  const weeks = [0, 1, 2, 3].map((w) => {
    const to = addDays(data.today, -7 * w);
    const from = addDays(to, -6);
    const acts = data.activities.filter((a) => a.date >= from && a.date <= to);
    const logs = strengthLogsBetween(data, from, to);
    return {
      from, to,
      minutes: mins(acts.reduce((s, a) => s + (a.movingSecs ?? 0), 0) + strengthSecs(logs)),
      load: Math.round(acts.reduce((s, a) => s + (a.trainingLoad ?? 0), 0)),
      sessions: acts.length + logs.length,
    };
  });
  // 자세한 기록은 최근 2주만, 4주 흐름은 weeklyTotals로
  const from = addDays(data.today, -13);
  const recent = data.activities.filter((a) => a.date >= from).sort((a, b) => b.date.localeCompare(a.date));
  return compact({
    today: data.today,
    todayWeekday: ['일', '월', '화', '수', '목', '금', '토'][new Date(`${data.today}T00:00:00`).getDay()],
    zone2MaxHr: data.settings.zone2MaxHr ?? 140,
    hrZoneUpperBpm: recent.find((a) => a.hrZones)?.hrZones ?? null,
    recovery: recoveryForAI(day),
    weeklyTotals: weeks,
    activities: recent.map(activityForAI),
    strengthLogs: data.strength.filter((s) => s.date >= from).map((s) => ({
      date: s.date,
      minutes: s.durationMin ?? null,
      exercises: (s.exercises ?? []).map((e) => ({
        name: e.name,
        sets: setsOf(e).map((x) => ({ kg: x.weightKg, reps: x.reps, warmup: x.warmup || null })),
      })),
    })),
    trainingPlanNotes: sharedPlanNotes(data),
  });
}

// 사용자가 "AI 코치에 공유"한 훈련 계획 메모 (메모 탭). 이것만 Gemini로 간다
const MAX_SHARED_MEMOS = 5;
function sharedPlanNotes(data) {
  return (data.memos ?? [])
    .filter((m) => m.shareAI && m.text)
    .slice(0, MAX_SHARED_MEMOS)
    .map((m) => ({ date: m.date, kind: m.kind, text: m.text.slice(0, 500) }));
}

// 같은 입력이면 다시 부르지 않기 위한 키
function sleepKey(day) {
  const w = day?.wellness;
  if (w?.sleepSecs == null) return null;
  return [`v${SLEEP_PROMPT_VERSION}`, day.date, w.sleepSecs, w.sleepScore, w.hrv, w.restingHR, day.score?.total ?? '-'].join('|');
}

function exerciseKey(data) {
  const from = addDays(data.today, -13);
  const ids = data.activities.filter((a) => a.date >= from).map((a) => a.id).sort();
  const logs = data.strength.filter((s) => s.date >= from).map((s) => `${s.id}:${(s.exercises ?? []).length}:${s.durationMin ?? ''}`).sort();
  // 최근 운동이 없어도 공유한 계획 메모가 있으면 오늘의 운동을 만든다
  if (!ids.length && !logs.length && !sharedPlanNotes(data).length) return null;
  // 계획 메모 변경은 여기서 판단하지 않는다 → 공유 메모를 저장·삭제하면 recoachExercise로 무조건 다시 받음
  return [`v${EXERCISE_PROMPT_VERSION}`, data.today, ...ids, ...logs].join('|');
}

// 운동 코칭 한 번 받아 저장. 반영한 공유 메모의 작성 날짜를 함께 남겨 화면에 표시
async function coachExercise(fb, uid, data, day, key) {
  const { doc, setDoc, serverTimestamp } = fb.fs;
  const { model, result } = await generate(data.keys.geminiApiKey, EXERCISE_SYSTEM, exercisePayload(data, day), EXERCISE_SCHEMA);
  const coach = { ...result, key, date: data.today, model, memoDates: sharedPlanNotes(data).map((n) => n.date) };
  await setDoc(doc(fb.db, 'users', uid, 'coach', 'exercise'), { ...coach, createdAt: serverTimestamp() });
  data.exerciseCoach = { ...coach, createdAt: new Date() };
}

// 공유 메모를 저장·삭제했을 때: 운동 기록 변화와 상관없이 바로 다시 코칭
// ── 남은 하루 가이드 (동기화 때, 현재 시각 기준) ──
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function dayPayload(data, day, now) {
  const { today } = data;
  const taken = data.checkins[today]?.supplements ?? {};
  const weekFrom = addDays(today, -6);
  const weekSecs = data.activities.filter((a) => a.date >= weekFrom && a.date <= today).reduce((s, a) => s + (a.movingSecs ?? 0), 0)
    + strengthSecs(strengthLogsBetween(data, weekFrom, today));
  const bed = tonightBedtime(data.settings, day);
  return compact({
    now: hhmm(now),
    weekday: ['일', '월', '화', '수', '목', '금', '토'][now.getDay()],
    condition: recoveryForAI(day),
    sleepDebt7Min: day ? sleepStats(data, day).sleepDebt7Min : null,
    doneToday: {
      activities: data.activities.filter((a) => a.date === today)
        .map((a) => ({ ...activityForAI(a), startTime: a.startLocal?.slice(11, 16) ?? null })),
      strength: data.strength.filter((s) => s.date === today)
        .map((s) => ({ minutes: s.durationMin ?? null, exercises: (s.exercises ?? []).map((e) => e.name) })),
    },
    plannedWorkout: data.exerciseCoach?.date === today ? data.exerciseCoach.todayWorkout ?? null : null,
    weekMinutes: Math.round(weekSecs / 60),
    supplementsLeft: data.supplements.filter((s) => !taken[s.id]?.taken).map((s) => ({ name: s.name, slot: s.slot, time: s.time ?? null })),
    tonightBedtime: bed ? shiftTime(data.settings.bedtime, -bed.earlier) : null,
    usualBedtime: data.settings.bedtime ?? null,
  });
}

// 같은 시간대(시)에 오늘 운동·헬스·영양제·점수·계획이 그대로면 다시 부르지 않는다
function dayKey(data, day, now) {
  const { today } = data;
  const taken = Object.entries(data.checkins[today]?.supplements ?? {}).filter(([, v]) => v?.taken).map(([id]) => id).sort();
  return [
    today, now.getHours(),
    ...data.activities.filter((a) => a.date === today).map((a) => a.id).sort(),
    ...data.strength.filter((s) => s.date === today).map((s) => `${s.id}:${s.durationMin ?? ''}`).sort(),
    `s:${taken.join(',')}`, day?.score?.total ?? '-', data.exerciseCoach?.todayWorkout?.title ?? '-',
  ].join('|');
}

async function guideDay(fb, uid, data, day, key, now) {
  const { doc, setDoc, serverTimestamp } = fb.fs;
  const { model, result } = await generate(data.keys.geminiApiKey, DAY_SYSTEM, dayPayload(data, day, now), DAY_SCHEMA);
  const guide = { ...result, key, date: data.today, time: hhmm(now), model };
  await setDoc(doc(fb.db, 'users', uid, 'coach', 'day'), { ...guide, createdAt: serverTimestamp() });
  data.dayGuide = { ...guide, createdAt: new Date() };
}

export async function recoachExercise(fb, uid, data) {
  if (!data.keys.geminiApiKey) throw new Error('설정에서 Gemini API 키를 넣어 주세요.');
  await coachExercise(fb, uid, data, pickDisplayDay(data), exerciseKey(data) ?? data.today);
}

// 러닝·트레일·수영 한 번 상세 분석 → activities/{id}.ai, 계산한 스플릿 등은 .detail (다음에 열 때 다시 부르지 않음)
export async function analyzeActivity(fb, uid, data, activity, detail) {
  const key = data.keys.geminiApiKey;
  if (!key) throw new Error('설정에서 Gemini API 키를 넣어 주세요.');
  const swim = activity.sport === 'swim';
  const recent = data.activities
    .filter((a) => a.id !== activity.id && a.sport === activity.sport && a.date <= activity.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map(activityForAI);
  const common = {
    splits: detail.splits,
    firstHalf: detail.firstHalf,
    secondHalf: detail.secondHalf,
    // 랩 이름(label)은 사용자가 붙인 글일 수 있어 보내지 않는다
    laps: (detail.laps ?? []).map(({ label, ...l }) => l),
    recovery: recoveryForAI(data.days[activity.date] ?? pickDisplayDay(data)),
    trainingPlanNotes: sharedPlanNotes(data),
  };
  const payload = compact(swim
    ? { swim: activityForAI(activity), ...common, recentSwims: recent }
    : {
      run: activityForAI(activity),
      ...common,
      decouplingPct: detail.decouplingPct,
      hrDriftBpm: detail.hrDriftBpm,
      recentRuns: recent,
      zone2MaxHr: data.settings.zone2MaxHr ?? 140,
      hrZoneUpperBpm: activity.hrZones ?? null,
    });
  const { model, result } = swim
    ? await generate(key, SWIM_SYSTEM, payload, SWIM_SCHEMA)
    : await generate(key, RUN_SYSTEM, payload, RUN_SCHEMA);
  const ai = { ...result, model };
  const { doc, setDoc, serverTimestamp } = fb.fs;
  await setDoc(doc(fb.db, 'users', uid, 'activities', activity.id),
    { ai: { ...ai, createdAt: serverTimestamp() }, detail }, { merge: true });
  activity.ai = { ...ai, createdAt: new Date() };
  activity.detail = detail;
}

// 동기화 후 실행. 새 데이터가 있을 때만, 수면·운동을 동시에 요청 (최대 2회).
// 각각 끝나는 대로 data에 반영하고 onResult(kind)를 불러 화면을 바로 갱신하게 한다.
export async function runCoaching(fb, uid, data, onResult = () => {}, onStart = () => {}) {
  const key = data.keys.geminiApiKey;
  if (!key) return { done: [], errors: [], skipped: 'no-key' };
  const { doc, setDoc, serverTimestamp } = fb.fs;
  const day = pickDisplayDay(data);
  const tasks = [];

  const sk = sleepKey(day);
  if (sk && day.ai?.sleepKey !== sk) {
    tasks.push(['sleep', async () => {
      const { model, result } = await generate(key, SLEEP_SYSTEM, sleepPayload(data, day), SLEEP_SCHEMA);
      const ai = {
        headline: result.headline,
        sleep: Object.fromEntries(SLEEP_FIELDS.map((k) => [k, result[k] ?? ''])),
        sleepKey: sk,
        model,
      };
      await setDoc(doc(fb.db, 'users', uid, 'days', day.date), { ai: { ...ai, createdAt: serverTimestamp() } }, { merge: true });
      day.ai = { ...ai, createdAt: new Date() };
    }]);
  }

  const ek = exerciseKey(data);
  if (ek && data.exerciseCoach?.key !== ek) {
    tasks.push(['exercise', () => coachExercise(fb, uid, data, day, ek)]);
  }

  // 남은 하루 가이드는 오늘의 운동 계획을 참고하므로 다른 분석이 끝난 뒤에
  const now = new Date();
  const dk = dayKey(data, day, now);
  const needDay = data.dayGuide?.key !== dk;

  const done = [];
  const errors = [];
  const label = { sleep: '수면', exercise: '운동', day: '하루 가이드' };
  const runTask = async ([kind, run]) => {
    try {
      await run();
      done.push(kind);
      onResult(kind);
    } catch (e) {
      console.error(e);
      errors.push(`${label[kind]}: ${e.message}`);
    }
  };
  onStart([...tasks.map(([kind]) => kind), ...(needDay ? ['day'] : [])]);
  await Promise.all(tasks.map(runTask));
  if (needDay) await runTask(['day', () => guideDay(fb, uid, data, day, dayKey(data, day, now), now)]);
  return { done, errors, pending: tasks.length + (needDay ? 1 : 0) };
}
