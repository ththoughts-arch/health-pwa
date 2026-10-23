import { esc, mmdd } from '../format.js';

// 운동 한 줄 요약: '스쿼트 60kg 3×10'
export function exerciseSummary(e) {
  const kg = e.weightKg ? ` ${e.weightKg}kg` : '';
  const sr = e.sets && e.reps ? ` ${e.sets}×${e.reps}` : e.sets ? ` ${e.sets}세트` : '';
  return `${e.name}${kg}${sr}`;
}

function numField(i, field, value, unit, label, step = 1) {
  return `
    <label class="ex-num">
      <input class="num-input" type="number" inputmode="${step < 1 ? 'decimal' : 'numeric'}" min="0" step="${step}"
        value="${value ?? ''}" aria-label="${label}" data-input="strength-ex" data-i="${i}" data-field="${field}">
      <span class="sub">${unit}</span>
    </label>`;
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
      <span class="hero-msg">가민에는 무게·세트가 남지 않아서 직접 적어요. 무게가 없는 운동은 비워 두세요.</span>
    </section>

    <form class="section strength-form" data-submit="strength-save">
      <label class="setting-row">
        <span class="setting-title">날짜</span>
        <input class="num-input date-input" type="date" value="${d.date}" max="${data.today}" required data-input="strength-date">
      </label>

      ${last && !d.id && blank ? `
        <button type="button" class="ghost-btn copy-btn" data-action="strength-copy-last">
          지난 기록 그대로 · ${mmdd(last.date)} ${esc(last.exercises.map((e) => e.name).join(', '))}
        </button>` : ''}

      ${d.exercises.map((e, i) => `
        <div class="edit-row">
          <div class="edit-line">
            <input class="text-input edit-name" type="text" list="ex-names" maxlength="30" value="${esc(e.name)}"
              placeholder="운동 이름 (예: 스쿼트)" aria-label="${i + 1}번째 운동 이름" data-input="strength-ex" data-i="${i}" data-field="name">
            ${d.exercises.length > 1 ? `<button type="button" class="ghost-btn ghost-btn-sm" data-action="strength-remove" data-i="${i}">삭제</button>` : ''}
          </div>
          <div class="ex-nums">
            ${numField(i, 'weightKg', e.weightKg, 'kg', `${i + 1}번째 운동 무게`, 0.5)}
            ${numField(i, 'sets', e.sets, '세트', `${i + 1}번째 운동 세트 수`)}
            ${numField(i, 'reps', e.reps, '회', `${i + 1}번째 운동 횟수`)}
          </div>
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
