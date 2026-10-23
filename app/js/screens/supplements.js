import { esc, weekdayKo } from '../format.js';
import { supplementCalendar, supplementSlots } from '../model.js';

const CHECK = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const LEVEL_WORD = ['안 먹음', '일부', '전부'];

export function renderSupplements({ data }) {
  const { slots, takenPills, totalPills } = supplementSlots(data);

  const hero = `
    <section class="hero">
      <span class="hero-date">SUPPLEMENTS · TODAY</span>
      <span class="hero-caption">오늘 복용</span>
      <div class="hero-row hero-row-tight">
        <span class="hero-big hero-big-md">${takenPills}</span>
        <span class="hero-total num">/ ${totalPills}알</span>
      </div>
    </section>`;

  if (!slots.length) {
    return `${hero}
      <div class="section">
        <div class="block">
          <span class="block-title">등록된 영양제가 없어요</span>
          <p class="sub">영양제 목록 등록은 다음 업데이트(6단계)에서 추가돼요. 등록하면 여기서 시간대별로 체크하고 알 수를 조절할 수 있어요.</p>
        </div>
      </div>`;
  }

  const cal = supplementCalendar(data);
  const firstDay = cal.cells[0].date;

  return `${hero}
    <div class="section section-tight">
      ${slots.map((s, i) => {
        const n = s.items.filter((it) => it.taken).length;
        return `
        <div class="slot ${i ? 'has-line' : ''}">
          <div class="block-head">
            <span class="block-title">${s.label} <span class="num slot-time">${s.time}</span></span>
            <span class="slot-status ${s.done ? 'is-done' : ''}">${s.done ? '완료' : `${n} / ${s.items.length}`}</span>
          </div>
          ${s.items.map((it) => `
            <div class="supp-row">
              <button type="button" class="check ${it.taken ? 'is-on' : ''}" data-action="supp-toggle" data-id="${esc(it.id)}"
                aria-pressed="${it.taken}" aria-label="${esc(it.name)} ${it.taken ? '복용함' : '복용 체크'}">${it.taken ? CHECK : ''}</button>
              <span class="supp-name ${it.taken ? 'is-done' : ''}">${esc(it.name)}</span>
              <div class="stepper">
                <button type="button" data-action="supp-count" data-id="${esc(it.id)}" data-delta="-1" aria-label="${esc(it.name)} 한 알 줄이기">−</button>
                <span class="num">${it.count}</span>
                <button type="button" data-action="supp-count" data-id="${esc(it.id)}" data-delta="1" aria-label="${esc(it.name)} 한 알 늘리기">+</button>
              </div>
            </div>`).join('')}
        </div>`;
      }).join('')}

      <div class="block block-line">
        <div class="block-head">
          <span class="block-title">최근 4주</span>
          <span class="num rate">${cal.rate}<span class="sub">%</span></span>
        </div>
        <div class="calendar">
          ${Array.from({ length: 7 }, (_, i) => `<span class="cal-head">${weekdayKo(cal.cells[i].date)}</span>`).join('')}
          ${cal.cells.map((c) => `<span class="cal-cell level-${c.level}" role="img" aria-label="${c.date} ${LEVEL_WORD[c.level]}"></span>`).join('')}
        </div>
        <span class="sub">${firstDay.slice(5).replace('-', '.')}부터</span>
      </div>

      <div class="grad-card grad-card-col">
        <span class="grad-card-title">AI가 찾은 패턴</span>
        <span class="ai-text">기록이 4주쯤 쌓이면 영양제와 수면 점수·HRV의 관계를 찾아 보여 드려요. 데이터가 적을 땐 참고 수준이에요.</span>
      </div>
    </div>`;
}
