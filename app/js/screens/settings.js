import { esc } from '../format.js';
import { FORMULA_VERSION } from '../score.js';

export function renderSettings({ data, user }) {
  const s = data.settings;
  return `
    <section class="hero hero-short">
      <div class="hero-top">
        <a class="back-link" href="#today">← 오늘</a>
        <span class="hero-date">SETTINGS</span>
      </div>
      <span class="hero-caption">설정</span>
    </section>
    <div class="section">
      <label class="setting-row">
        <span class="setting-text">
          <span class="setting-title">평소 취침 시각</span>
          <span class="sub">오늘 밤 권장 취침 시각 계산에 써요</span>
        </span>
        <input class="num-input time-input" type="time" value="${esc(s.bedtime ?? '')}" data-change="bedtime">
      </label>
      <div class="setting-row">
        <span class="setting-text">
          <span class="setting-title">존2 심박 상한</span>
          <span class="sub">강도 분포 '쉬움' 기준</span>
        </span>
        <span class="num setting-value">${s.zone2MaxHr ?? 140}bpm</span>
      </div>
      <div class="setting-row">
        <span class="setting-text">
          <span class="setting-title">로그인 계정</span>
          <span class="sub">${esc(user.email)}</span>
        </span>
        <button type="button" class="ghost-btn" data-action="logout">로그아웃</button>
      </div>
      <p class="sub foot">점수 계산식 v${FORMULA_VERSION} · 데이터는 매일 아침 07:30에 갱신돼요</p>
    </div>`;
}
