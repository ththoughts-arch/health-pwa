import { bandOf } from './score.js';

// 컨디션 구간 → 테마 (CLAUDE.md 6·7장)
const THEME_COLOR = { good: '#FFF0B8', normal: '#CFF6E6', low: '#EFEDFF' };

// 점수가 없으면(기준값 수집 중 등) '보통' 테마
export function conditionFromScore(score) {
  return bandOf(score) ?? 'normal';
}

export function setCondition(condition) {
  document.body.dataset.condition = condition;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[condition]);
}
