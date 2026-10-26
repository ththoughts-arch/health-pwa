import { esc, mmdd } from '../format.js';

export const MEMO_KIND = { plan: '훈련 계획', idea: '아이디어' };
const FILTERS = [['all', '전체'], ['plan', '훈련 계획'], ['idea', '아이디어']];

// 입력 중 상태는 state.ui.memoDraft (data-input으로 갱신, 다시 그려도 유지)
function composer(d, editing) {
  return `
    <form class="memo-form" data-submit="memo-save">
      <div class="seg memo-kind" role="group" aria-label="종류">
        ${Object.entries(MEMO_KIND).map(([k, label]) => `
          <button type="button" data-action="memo-kind" data-kind="${k}" aria-pressed="${d.kind === k}">${label}</button>`).join('')}
      </div>
      <textarea class="text-input memo-text" rows="${editing ? 8 : 4}" maxlength="2000" data-input="memo-text"
        placeholder="${d.kind === 'plan' ? '예: 이번 주 화 인터벌 6×800m, 토 롱런 16km' : '떠오른 생각을 바로 적어 두세요'}"
        aria-label="메모 내용">${esc(d.text)}</textarea>
      <label class="memo-share">
        <input type="checkbox" ${d.shareAI ? 'checked' : ''} data-input="memo-share">
        <span>
          <span class="setting-title">AI 코치에 공유</span>
          <span class="sub">운동 코칭·러닝 분석이 이 메모를 참고해요. Gemini 무료 플랜은 입력이 학습에 쓰일 수 있으니 개인정보는 적지 마세요.</span>
        </span>
      </label>
      <button type="submit" class="primary-btn">${editing ? '저장' : '메모 추가'}</button>
      ${editing ? `
        <button type="button" class="ghost-btn danger-btn" data-action="memo-delete">이 메모 삭제</button>` : ''}
    </form>`;
}

export function renderMemo({ data, ui }, id) {
  const d = ui.memoDraft;
  if (id) {
    return `
      <section class="hero hero-short">
        <div class="hero-top">
          <a class="back-link" href="#memo">← 메모</a>
          <span class="hero-date">MEMO</span>
        </div>
        <span class="hero-caption">메모 수정</span>
      </section>
      <div class="section">${composer(d, true)}</div>`;
  }

  const filter = ui.memoFilter ?? 'all';
  const list = data.memos.filter((m) => filter === 'all' || m.kind === filter);
  const shared = data.memos.filter((m) => m.shareAI).length;
  return `
    <section class="hero hero-short">
      <div class="hero-top">
        <span class="hero-date">MEMO</span>
        <span class="sub ink2">AI 공유 ${shared}개</span>
      </div>
      <span class="hero-caption">훈련 계획 · 아이디어</span>
    </section>
    <div class="section">
      ${composer(d, false)}

      <div class="pills" role="group" aria-label="메모 종류">
        ${FILTERS.map(([k, label]) => `<button type="button" class="pill" data-action="memo-filter" data-filter="${k}" aria-pressed="${k === filter}">${label}</button>`).join('')}
      </div>
      ${list.length ? list.map((m) => `
        <a class="memo-row" href="#memo=${encodeURIComponent(m.id)}">
          <span class="memo-meta">
            <span class="memo-tag ${m.kind === 'plan' ? 'is-plan' : ''}">${MEMO_KIND[m.kind] ?? '메모'}</span>
            <span class="num sub">${m.date ? mmdd(m.date) : ''}</span>
            ${m.shareAI ? '<span class="ai-badge">AI</span>' : ''}
          </span>
          <span class="memo-body">${esc(m.text)}</span>
        </a>`).join('') : '<p class="sub memo-empty">아직 메모가 없어요.</p>'}
    </div>`;
}
