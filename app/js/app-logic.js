// app.js의 판단 로직 (화면·Firebase 없이 테스트할 수 있게 분리, tests/app-logic.test.mjs)

// '#strength=ID' → { name: 'strength', param: 'ID' }. 모르는 화면이면 오늘
export function parseRoute(hash, screenNames) {
  const [name, param] = hash.slice(1).split('=');
  return screenNames.includes(name) ? { name, param: param ? decodeURIComponent(param) : null } : { name: 'today', param: null };
}

// 바디 배터리 입력값 → 0~100 정수, 빈칸은 null(지우기), 잘못된 값은 undefined(무시)
export function bodyBatteryValue(raw) {
  const s = String(raw).trim();
  if (s === '') return null;
  const n = Math.round(Number(s));
  return n >= 0 && n <= 100 ? n : undefined;
}

// 영양제 체크 한 칸의 다음 값: 처음이면 1회 알 수로 시작
export function nextSupplementEntry(current, def, patch) {
  return { taken: false, count: def?.countPerDose ?? 1, ...current, ...patch };
}

// 헬스 입력 화면 → 저장할 기록. 빈 칸은 버리고, 무게는 0.5kg 단위, 횟수·시간은 정수
// 같은 날 가민 헬스 활동이 있으면 연결. 문제가 있으면 { error }
export function buildStrengthEntry(draft, { today, activities }) {
  const num = (v, int) => {
    if (v == null || !Number.isFinite(v) || v <= 0) return null;
    return int ? Math.round(v) : Math.round(v * 2) / 2;
  };
  const exercises = draft.exercises
    .map((e) => ({
      name: e.name.trim(),
      setList: e.setList
        .map((s) => ({ weightKg: num(s.weightKg, false), reps: num(s.reps, true), warmup: !!s.warmup }))
        .filter((s) => s.weightKg != null || s.reps != null),
    }))
    .filter((e) => e.name);
  if (!exercises.length) return { error: '운동 이름을 하나 이상 적어 주세요.' };
  if (!draft.date || draft.date > today) return { error: '날짜를 확인해 주세요.' };
  const act = activities.find((a) => a.date === draft.date && a.sport === 'strength');
  return {
    entry: { date: draft.date, durationMin: num(draft.durationMin, true), exercises, note: draft.note.trim(), activityId: act?.id ?? null },
  };
}

// AI 분석 결과 → 알림 문구. 지연·끊김으로만 실패하면 앱으로 돌아올 때 다시 시도한다고 알림
const DONE_LABEL = { sleep: '수면 분석', exercise: '운동 코칭', day: '하루 가이드' };
export function aiResultMessage(result) {
  const parts = [];
  if (result.done.length) parts.push(`AI ${result.done.map((d) => DONE_LABEL[d]).join('·')} 받았어요`);
  if (result.errors.length) {
    const labels = result.errors.map((e) => e.label).join('·');
    parts.push(result.errors.every((e) => e.transient)
      ? `AI ${labels} 분석 실패: 응답이 늦거나 연결이 끊겼어요. 기다리는 동안 앱을 내리면 끊길 수 있어요 · 앱으로 돌아오면 다시 시도해요`
      : `AI 분석 실패: ${result.errors.map((e) => `${e.label}: ${e.message}`).join(' / ')}`);
  }
  return parts.join(' · ') || null;
}
