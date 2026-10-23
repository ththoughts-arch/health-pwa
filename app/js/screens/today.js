import { BAND_LABEL, SLEEP_QUALITY, duration, esc, heroDate, hm, mmdd, warningText } from '../format.js';
import { activitiesBetween, headline, pickDisplayDay, recommendedExercise, sleepLabel, supplementSlots } from '../model.js';
import { addDays } from '../score.js';

const GEAR = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1B25" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';

export function renderToday({ data }) {
  const day = pickDisplayDay(data);
  const score = day?.score;
  const pill = score ? BAND_LABEL[score.band]
    : day?.status === 'collecting' ? '기준값 수집 중' : '동기화 대기';
  const basedOn = day && day.date !== data.today ? `<span class="hero-note">${mmdd(day.date)} 데이터 기준</span>` : '';

  const warnings = (day?.warnings ?? []).map((w) => `
    <div class="warn-row">
      <span class="warn-dot" aria-hidden="true"></span>
      <div><span class="warn-title">회복 경고</span><span class="warn-text">${esc(warningText(w))}</span></div>
    </div>`).join('');

  const bb = data.checkins[data.today]?.bodyBattery;
  const bbNote = bb == null || !score ? '수식 보정용 · 아침에 한 번 입력'
    : `내 점수 ${score.total} · 차이 ${score.total - bb > 0 ? '+' : ''}${score.total - bb}`;

  const w = day?.wellness;
  const sleepMeta = [
    w?.sleepScore != null ? `점수 ${w.sleepScore}` : null,
    w?.sleepQuality != null ? `수면 질 ${SLEEP_QUALITY[w.sleepQuality] ?? w.sleepQuality}` : null,
  ].filter(Boolean).join(' · ') || '수면 기록 없음';

  const weekSecs = activitiesBetween(data, addDays(data.today, -6), data.today)
    .reduce((s, a) => s + (a.movingSecs ?? 0), 0);

  return `
    <section class="hero">
      <div class="hero-top">
        <span class="hero-date">${heroDate(data.today)}</span>
        <a class="icon-btn" href="#settings" aria-label="설정">${GEAR}</a>
      </div>
      <span class="hero-caption">오늘의 컨디션 ${basedOn}</span>
      <div class="hero-row">
        <span class="hero-big">${score ? score.total : '—'}</span>
        <span class="hero-pill">${pill}</span>
      </div>
      <span class="hero-msg">${esc(headline(day))}</span>
    </section>

    <div class="section">
      ${warnings}

      <div class="bb-row">
        <label for="bb" class="bb-label">
          <span class="bb-title">가민 바디 배터리</span>
          <span class="sub">${bbNote}</span>
        </label>
        <input id="bb" class="num-input" type="number" inputmode="numeric" min="0" max="100"
          placeholder="기상 직후" value="${bb ?? ''}" data-change="body-battery">
      </div>

      <div class="split">
        <a href="#sleep" class="split-cell">
          <span class="sub">${sleepLabel(data, day)}</span>
          <span class="split-big num">${hm(w?.sleepSecs)}</span>
          <span class="sub">${sleepMeta}</span>
        </a>
        <a href="#exercise" class="split-cell">
          <span class="sub">오늘 권장 운동</span>
          <span class="split-plan accent">${recommendedExercise(day)}</span>
          <span class="sub">이번 주 ${duration(weekSecs / 60)}</span>
        </a>
      </div>

      ${supplementBlock(data)}
    </div>`;
}

function supplementBlock(data) {
  const { slots } = supplementSlots(data);
  if (!slots.length) {
    return `<div class="block"><div class="block-head"><span class="block-title">오늘 영양제</span></div>
      <p class="sub">등록된 영양제가 없어요. 영양제 탭에서 목록을 등록할 수 있게 될 거예요.</p></div>`;
  }
  const done = slots.filter((s) => s.done).length;
  return `
    <div class="block">
      <div class="block-head">
        <span class="block-title">오늘 영양제</span>
        <span class="num sub-num">${done} / ${slots.length}</span>
      </div>
      <div class="progress" aria-hidden="true"><div style="width:${Math.round((done / slots.length) * 100)}%"></div></div>
      ${slots.map((s) => `
        <label class="slot-row">
          <input type="checkbox" ${s.done ? 'checked' : ''} data-change="slot-toggle" data-slot="${s.slot}">
          <span class="slot-text">
            <span class="slot-label ${s.done ? 'is-done' : ''}">${s.label}</span>
            <span class="sub">${s.items.map((i) => esc(i.name)).join(' · ')}</span>
          </span>
          <span class="num sub-num">${s.time}</span>
        </label>`).join('')}
    </div>`;
}
