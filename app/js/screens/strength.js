import { esc, mmdd } from '../format.js';

function setRow(s, i, j) {
  const num = (field, value, label, step) => `
    <input class="num-input" type="number" inputmode="${step < 1 ? 'decimal' : 'numeric'}" min="0" step="${step}"
      value="${value ?? ''}" aria-label="${i + 1}번째 운동 ${j + 1}세트 ${label}"
      data-input="strength-set" data-i="${i}" data-s="${j}" data-field="${field}">`;
  return `
    <div class="set-row">
      <span class="num set-no">${j + 1}</span>
      <label class="ex-num">${num('weightKg', s.weightKg, '무게', 0.5)}<span class="sub">kg</span></label>
      <label class="ex-num">${num('reps', s.reps, '횟수', 1)}<span class="sub">회</span></label>
      <button type="button" class="set-btn ${s.warmup ? 'is-on' : ''}" data-action="strength-warmup" data-i="${i}" data-s="${j}"
        aria-pressed="${!!s.warmup}" aria-label="${j + 1}세트 워밍업">W</button>
      <button type="button" class="set-btn" data-action="strength-remove-set" data-i="${i}" data-s="${j}" aria-label="${j + 1}세트 삭제">×</button>
    </div>`;
}

// 입력은 state.ui.strengthDraft에 바로 반영(data-input), 저장은 제출 때
export function renderStrength({ data, ui }) {
  const d = ui.strengthDraft;
  const last = data.strength.find((s) => s.id !== d.id);
  const blank = d.exercises.every((e) => !e.name);
  const names = [...new Set(data.strength.flatMap((s) => s.exercises.map((e) => e.name)))];

  return `
    <section class="hero hero-short">
      <div class="hero-top">
        <a class="back-link" href="#exercise">← 운동</a>
        <span class="hero-date">STRENGTH</span>
      </div>
      <span class="hero-caption">${d.id ? '헬스 기록 수정' : '헬스 기록'}</span>
      <span class="hero-msg">가민에는 무게·세트가 남지 않아서 직접 적어요. 세트마다 무게와 횟수를 따로 적을 수 있어요.</span>
    </section>

    <form class="section strength-form" data-submit="strength-save">
      <label class="setting-row">
        <span class="setting-title">날짜</span>
        <input class="num-input date-input" type="date" value="${d.date}" max="${data.today}" required data-input="strength-date">
      </label>
      <label class="setting-row">
        <span class="setting-text">
          <span class="setting-title">운동 시간</span>
          <span class="sub">최근 7일 운동 시간과 주 150분 목표에 더해져요</span>
        </span>
        <span class="ex-num duration-field">
          <input class="num-input" type="number" inputmode="numeric" min="0" step="1" value="${d.durationMin ?? ''}"
            aria-label="운동 시간(분)" data-input="strength-duration">
          <span class="sub">분</span>
        </span>
      </label>

      <div class="bulk">
        <span class="field-label">글로 한 번에 입력</span>
        <textarea class="text-input memo-text" rows="5" aria-label="운동 기록 글" data-input="strength-bulk"
          placeholder="평벤치 프레스&#10;빈바 : 10개&#10;40kg : 12개&#10;50kg : 8개&#10;&#10;또는 랫풀다운: 20×10, 35×10, 45×10">${esc(d.bulk ?? '')}</textarea>
        <button type="button" class="ghost-btn" data-action="strength-parse">아래 칸에 채우기</button>
      </div>

      ${last && !d.id && blank ? `
        <button type="button" class="ghost-btn copy-btn" data-action="strength-copy-last">
          지난 기록 그대로 · ${mmdd(last.date)} ${esc(last.exercises.map((e) => e.name).join(', '))}
        </button>` : ''}

      ${d.exercises.map((e, i) => `
        <div class="edit-row">
          <div class="edit-line">
            <input class="text-input edit-name" type="text" list="ex-names" maxlength="30" value="${esc(e.name)}"
              placeholder="운동 이름 (예: 스쿼트)" aria-label="${i + 1}번째 운동 이름" data-input="strength-name" data-i="${i}">
            ${d.exercises.length > 1 ? `<button type="button" class="ghost-btn ghost-btn-sm" data-action="strength-remove" data-i="${i}">삭제</button>` : ''}
          </div>
          ${e.setList.map((s, j) => setRow(s, i, j)).join('')}
          <button type="button" class="ghost-btn ghost-btn-sm add-set-btn" data-action="strength-add-set" data-i="${i}">+ 세트</button>
        </div>`).join('')}

      <button type="button" class="ghost-btn add-row-btn" data-action="strength-add-row">+ 운동 추가</button>

      <label class="field note-field">
        <span class="field-label">메모</span>
        <input class="text-input" type="text" maxlength="100" value="${esc(d.note)}" placeholder="예: 하체, 컨디션 좋음" data-input="strength-note">
      </label>
      <datalist id="ex-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>

      <button type="submit" class="primary-btn">저장</button>
      ${d.id ? '<button type="button" class="ghost-btn danger-btn" data-action="strength-delete">이 기록 삭제</button>' : ''}
    </form>`;
}
