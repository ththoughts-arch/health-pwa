import { SLOT_DEFAULT_TIME, SLOT_LABEL, SLOT_ORDER, STARTER_SUPPLEMENTS, esc } from '../format.js';

function slotSelect(value, attrs) {
  return `<select class="select" ${attrs}>
    ${SLOT_ORDER.map((s) => `<option value="${s}" ${s === value ? 'selected' : ''}>${SLOT_LABEL[s]}</option>`).join('')}
  </select>`;
}

// 변경 즉시 저장 (data-change="supp-edit" + data-field)
function row(s) {
  const id = esc(s.id);
  return `
    <div class="edit-row">
      <div class="edit-line">
        <input class="text-input edit-name" type="text" maxlength="30" value="${esc(s.name)}"
          aria-label="이름" data-change="supp-edit" data-id="${id}" data-field="name">
        <button type="button" class="ghost-btn ghost-btn-sm" data-action="supp-hide" data-id="${id}">빼기</button>
      </div>
      <div class="edit-line">
        ${slotSelect(s.slot, `aria-label="${esc(s.name)} 시간대" data-change="supp-edit" data-id="${id}" data-field="slot"`)}
        <input class="num-input time-input-sm" type="time" value="${esc(s.time ?? '')}"
          aria-label="${esc(s.name)} 알림 시각" data-change="supp-edit" data-id="${id}" data-field="time">
        <div class="stepper">
          <button type="button" data-action="supp-def-count" data-id="${id}" data-delta="-1" aria-label="${esc(s.name)} 1회 알 수 줄이기">−</button>
          <span class="num">${s.countPerDose ?? 1}</span>
          <button type="button" data-action="supp-def-count" data-id="${id}" data-delta="1" aria-label="${esc(s.name)} 1회 알 수 늘리기">+</button>
        </div>
      </div>
    </div>`;
}

export function renderSupplementsEdit({ data }) {
  const list = [...data.supplements].sort((a, b) =>
    SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || (a.order ?? 0) - (b.order ?? 0));

  const starter = list.length ? '' : `
    <div class="block">
      <span class="block-title">처음이라면</span>
      <p class="sub">${STARTER_SUPPLEMENTS.map((s) => s.name).join(' · ')}</p>
      <p class="sub">시간대와 알 수는 넣은 뒤 바로 고칠 수 있어요.</p>
      <button type="button" class="primary-btn" data-action="supp-seed">이 목록으로 시작</button>
    </div>`;

  return `
    <section class="hero hero-short">
      <div class="hero-top">
        <a class="back-link" href="#supplements">← 영양제</a>
        <span class="hero-date">SUPPLEMENTS · LIST</span>
      </div>
      <span class="hero-caption">영양제 목록</span>
      <span class="hero-msg">시간대·알림 시각·1회 알 수를 바꾸면 바로 저장돼요. 뺀 영양제의 지난 기록은 그대로 남아요.</span>
    </section>
    <div class="section">
      ${starter}
      ${list.map(row).join('')}

      <form class="block add-form" data-submit="supp-add">
        <span class="block-title">추가</span>
        <input class="text-input" type="text" name="name" maxlength="30" placeholder="이름 (예: 철분)" required aria-label="새 영양제 이름">
        <div class="edit-line">
          ${slotSelect('morning', 'name="slot" aria-label="새 영양제 시간대"')}
          <input class="num-input time-input-sm" type="time" name="time" value="${SLOT_DEFAULT_TIME.morning}" aria-label="새 영양제 알림 시각">
          <input class="num-input count-input" type="number" name="count" inputmode="numeric" min="1" max="10" value="1" aria-label="1회 알 수">
        </div>
        <button type="submit" class="primary-btn">추가</button>
      </form>
    </div>`;
}
