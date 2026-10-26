import { esc } from '../format.js';
import { FORMULA_VERSION } from '../score.js';
import { lastSyncText } from './common.js';

// 비밀 키는 화면에 값을 다시 그리지 않는다. 저장 여부와 끝 4자리만
function keyRow(keys, field, title, help) {
  const saved = keys[field];
  return `
    <label class="key-row">
      <span class="setting-title">${title}</span>
      <span class="sub">${help}</span>
      <input class="text-input" type="password" autocomplete="off" spellcheck="false"
        placeholder="${saved ? `저장됨 · 끝 ${esc(saved.slice(-4))} (바꾸려면 새로 붙여넣기)` : '붙여넣기'}"
        data-change="key" data-field="${field}">
    </label>`;
}

export function renderSettings({ data, user }) {
  const s = data.settings;
  const k = data.keys;
  return `
    <section class="hero hero-short">
      <div class="hero-top">
        <a class="back-link" href="#today">← 오늘</a>
        <span class="hero-date">SETTINGS</span>
      </div>
      <span class="hero-caption">설정</span>
    </section>
    <div class="section">
      ${data.rulesOutdated ? `
        <div class="warn-row">
          <span class="warn-dot" aria-hidden="true"></span>
          <div><span class="warn-title">Firebase 규칙을 다시 게시해 주세요</span>
          <span class="warn-text">Firebase 콘솔 → Firestore → 규칙에 저장소의 firestore.rules 내용을 붙여넣고 게시하면, API 키 저장·동기화·AI 코칭이 동작해요.</span></div>
        </div>` : ''}

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

      <div class="block">
        <span class="block-title">동기화 · AI 연결</span>
        <p class="sub">키는 내 계정에만 저장되고 나만 읽을 수 있어요. ${lastSyncText(data)}</p>
      </div>
      ${keyRow(k, 'intervalsApiKey', 'intervals.icu API 키', 'intervals.icu → Settings → 맨 아래 Developer Settings')}
      <label class="key-row">
        <span class="setting-title">intervals.icu Athlete ID</span>
        <span class="sub">같은 화면의 i로 시작하는 번호 (예: i123456)</span>
        <input class="text-input" type="text" autocomplete="off" spellcheck="false" value="${esc(k.intervalsAthleteId ?? '')}"
          placeholder="i123456" data-change="key" data-field="intervalsAthleteId">
      </label>
      ${keyRow(k, 'geminiApiKey', 'Gemini API 키 (무료)', 'aistudio.google.com → Get API key. 수치만 보내고 이름·메모는 보내지 않아요')}

      <div class="setting-row">
        <span class="setting-text">
          <span class="setting-title">로그인 계정</span>
          <span class="sub">${esc(user.email)}</span>
        </span>
        <button type="button" class="ghost-btn" data-action="logout">로그아웃</button>
      </div>
      <p class="sub foot">점수 계산식 v${FORMULA_VERSION} · 동기화 버튼을 누르면 intervals.icu에서 최신 데이터를 가져와요</p>
    </div>`;
}
