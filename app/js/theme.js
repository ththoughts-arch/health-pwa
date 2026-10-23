// 컨디션 구간 → 테마 (CLAUDE.md 6·7장)
const THEME_COLOR = { good: '#FFF0B8', normal: '#CFF6E6', low: '#EFEDFF' };

export function conditionFromScore(score) {
  if (score == null) return 'normal';
  if (score >= 80) return 'good';
  if (score >= 60) return 'normal';
  return 'low';
}

export function setCondition(condition) {
  document.body.dataset.condition = condition;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[condition]);
}
