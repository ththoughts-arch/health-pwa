// 화면 표시용 형식 함수

const DAYS_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 기기 시간 기준 오늘 'YYYY-MM-DD'
export function localToday() {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

const parse = (date) => new Date(`${date}T00:00:00`);

export function mmdd(date) {
  return date.slice(5).replace('-', '.');
}

export function heroDate(date) {
  return `${DAYS_EN[parse(date).getDay()]} · ${mmdd(date)}`;
}

export function weekdayKo(date) {
  return DAYS_KO[parse(date).getDay()];
}

// 초 → '7:12'
export function hm(secs) {
  if (secs == null) return '—';
  const m = Math.round(secs / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// 분 → '4h 10m' / '45분'
export function duration(mins) {
  const m = Math.round(mins);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// '23:30' ± 분
export function shiftTime(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function signed(n, unit = '') {
  const r = Math.round(n);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}${unit}`;
}

// Firestore에서 온 문자열은 항상 이걸 거쳐 HTML에 넣는다
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const BAND_LABEL = { good: '좋음', normal: '보통', low: '회복 필요' };

// intervals.icu 수면 질 척도 (1 최상 ~ 4 나쁨으로 추정, 실제 값 보고 확인 필요)
export const SLEEP_QUALITY = { 1: '아주 좋음', 2: '좋음', 3: '보통', 4: '나쁨' };

export const SPORT_LABEL = { run: '러닝', trail: '트레일', swim: '수영', strength: '헬스', other: '기타' };

export const SLOT_LABEL = { morning: '아침', lunch: '점심', evening: '저녁', bedtime: '자기 전' };
export const SLOT_ORDER = ['morning', 'lunch', 'evening', 'bedtime'];
export const SLOT_DEFAULT_TIME = { morning: '08:00', lunch: '12:30', evening: '18:30', bedtime: '23:00' };

// 처음 시작용 목록 (CLAUDE.md 3장). 시간대·알 수는 시안 기준, 사용자가 수정
export const STARTER_SUPPLEMENTS = [
  { id: 'omega3', name: '오메가3', slot: 'morning', countPerDose: 2 },
  { id: 'vitamin-c', name: '비타민C', slot: 'morning', countPerDose: 1 },
  { id: 'multivitamin', name: '종합영양제', slot: 'morning', countPerDose: 1 },
  { id: 'vitamin-d', name: '비타민D', slot: 'morning', countPerDose: 1 },
  { id: 'probiotics', name: '프로바이오틱스', slot: 'lunch', countPerDose: 1 },
  { id: 'curcumin', name: '커큐민', slot: 'lunch', countPerDose: 2 },
  { id: 'magnesium', name: '마그네슘', slot: 'bedtime', countPerDose: 1 },
].map((s, order) => ({ ...s, time: SLOT_DEFAULT_TIME[s.slot], order, ingredients: null }));

// score.js 경고 코드 → 문장 (진단하지 않는다)
export function warningText(w) {
  if (w.code === 'rhr_up_hrv_down') {
    return `안정시 심박은 높고 HRV는 낮은 상태가 ${w.days}일째예요. 고강도는 쉬어 주세요. 일주일 넘게 이어지면 병원 확인을 권해요.`;
  }
  if (w.code === 'short_sleep') {
    return `적정 수면보다 1시간 반 넘게 부족한 날이 ${w.days}일째예요. 오늘은 일찍 잠자리에 들어 주세요.`;
  }
  return '';
}
