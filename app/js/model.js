// Firestore 데이터 → 화면에 보여 줄 값
import { addDays } from './score.js';
import { SLOT_LABEL, SLOT_ORDER } from './format.js';

// 화면 기준일: 오늘 점수가 아직 없으면(잠들기 전·동기화 전) 어제 점수를 보여 준다
export function pickDisplayDay(data) {
  const candidates = [data.today, addDays(data.today, -1)];
  for (const d of candidates) if (data.days[d]?.status === 'ok') return data.days[d];
  for (const d of candidates) if (data.days[d]) return data.days[d];
  return null;
}

// endDate까지 n일 날짜 목록 (오래된 날 → 최근)
export function dateRange(endDate, n) {
  return Array.from({ length: n }, (_, i) => addDays(endDate, i - n + 1));
}

const frac = (score, key) => score[key] / score.weights[key];

// AI 문장(8단계)이 없을 때 쓰는 규칙 문장
export function headline(day) {
  if (day?.ai?.headline) return day.ai.headline;
  if (!day) return '아직 데이터가 없어요. 아침 동기화가 끝나면 점수가 나와요.';
  if (day.status === 'collecting') return '처음 2주 정도는 내 평소 상태를 쌓는 기간이에요.';
  if (day.status !== 'ok') return '워치 데이터가 아직 들어오지 않았어요.';
  const s = day.score;
  if (s.band === 'good') return '수면과 회복 모두 좋아요. 계획한 운동을 그대로 해도 괜찮은 날이에요.';
  if (s.band === 'low') return '몸이 회복을 원하고 있어요. 오늘은 산책 정도만 하고 일찍 쉬어 주세요.';
  const weakest = ['sleep', 'recovery', 'load'].sort((a, b) => frac(s, a) - frac(s, b))[0];
  if (frac(s, weakest) < 0.7) {
    return {
      sleep: '잠이 조금 부족했어요. 무리하지 말고 오늘은 일찍 쉬어 주세요.',
      recovery: '잠은 괜찮았지만 회복이 덜 됐어요. 가벼운 존2 운동이면 충분해요.',
      load: '최근 운동량이 많이 늘었어요. 오늘은 강도를 낮춰 주세요.',
    }[weakest];
  }
  return '무난한 상태예요. 평소대로 지내도 좋아요.';
}

export function recommendedExercise(day) {
  const band = day?.score?.band;
  if (band === 'good') return '계획대로 OK';
  if (band === 'normal') return '존2 · 30분';
  if (band === 'low') return '오늘은 휴식';
  return '—';
}

// 오늘 영양제: 시간대별로 묶고 체크·알 수 반영
export function supplementSlots(data) {
  const taken = data.checkins[data.today]?.supplements ?? {};
  let takenPills = 0;
  let totalPills = 0;
  const slots = SLOT_ORDER.map((slot) => {
    const items = data.supplements.filter((s) => s.slot === slot).map((s) => {
      const t = taken[s.id];
      const count = t?.count ?? s.countPerDose ?? 1;
      totalPills += count;
      if (t?.taken) takenPills += count;
      return { id: s.id, name: s.name, taken: !!t?.taken, count };
    });
    const times = data.supplements.filter((s) => s.slot === slot && s.time).map((s) => s.time).sort();
    return { slot, label: SLOT_LABEL[slot], time: times[0] ?? '', items, done: items.length > 0 && items.every((i) => i.taken) };
  }).filter((s) => s.items.length);
  return { slots, takenPills, totalPills };
}

// 최근 28일 복용률: 0 안 먹음 / 1 일부 / 2 전부
export function supplementCalendar(data) {
  const ids = data.supplements.map((s) => s.id);
  const dates = dateRange(data.today, 28);
  let sumRatio = 0;
  let counted = 0;
  const cells = dates.map((date) => {
    const sup = data.checkins[date]?.supplements ?? {};
    const n = ids.filter((id) => sup[id]?.taken).length;
    const ratio = ids.length ? n / ids.length : 0;
    if (date !== data.today || n > 0) { sumRatio += ratio; counted++; }
    return { date, level: n === 0 ? 0 : n === ids.length ? 2 : 1 };
  });
  return { cells, rate: counted ? Math.round((sumRatio / counted) * 100) : 0 };
}

// 운동: 기간 안의 활동
export function activitiesBetween(data, from, to, sport = 'all') {
  return data.activities.filter((a) => a.date >= from && a.date <= to && (sport === 'all' || a.sport === sport));
}

// 강도 분포: 쉬움 = 존1–2, 보통 = 존3, 고강도 = 존4 이상
export function intensity(acts) {
  let easy = 0;
  let mid = 0;
  let hard = 0;
  for (const a of acts) {
    const z = a.hrZoneSecs;
    if (!Array.isArray(z)) continue;
    easy += (z[0] ?? 0) + (z[1] ?? 0);
    mid += z[2] ?? 0;
    hard += z.slice(3).reduce((s, x) => s + (x ?? 0), 0);
  }
  const total = easy + mid + hard;
  if (!total) return null;
  const pct = (x) => Math.round((x / total) * 100);
  return { easy: pct(easy), mid: pct(mid), hard: 100 - pct(easy) - pct(mid) };
}

// 오늘 밤 권장 취침: 평소 취침 시각, 수면 부족·회복 필요면 30분 앞당김
export function tonightBedtime(settings, day) {
  if (!settings.bedtime) return null;
  const short = day?.wellness?.sleepSecs != null && day?.baseline?.sleepTargetSecs != null
    && day.wellness.sleepSecs < day.baseline.sleepTargetSecs - 30 * 60;
  const tired = day?.score?.band === 'low';
  const earlier = short || tired ? 30 : 0;
  const reason = short ? '어젯밤 수면이 부족해서' : tired ? '회복이 필요해서' : '';
  return { earlier, reason };
}
