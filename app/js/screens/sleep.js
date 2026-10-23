import { SLEEP_QUALITY, esc, hm, mmdd, shiftTime, signed, warningText, weekdayKo } from '../format.js';
import { dateRange, pickDisplayDay, tonightBedtime } from '../model.js';

const CHART_H = 130;
const CHART_MAX = 10 * 3600;   // 그래프 상단 = 10시간
const barH = (secs) => Math.round((Math.min(secs, CHART_MAX) / CHART_MAX) * CHART_H);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function renderSleep({ data, ui }) {
  const day = pickDisplayDay(data);
  const w = day?.wellness ?? {};
  const b = day?.baseline ?? {};
  const target = b.sleepTargetSecs;

  // 지표 6칸: [이름, 값, 평소 대비, 경고 여부]
  const nights7 = dateRange(day?.date ?? data.today, 7)
    .map((d) => data.days[d]?.wellness?.sleepSecs).filter((x) => x != null);
  const scores30 = Object.values(data.days).map((d) => d.wellness?.sleepScore).filter((x) => x != null);
  const scoreAvg = scores30.length ? avg(scores30) : null;
  const hrvPct = w.hrv != null && b.hrv30 ? ((w.hrv - b.hrv30) / b.hrv30) * 100 : null;
  const rhrDiff = w.restingHR != null && b.restingHR30 != null ? w.restingHR - b.restingHR30 : null;
  const vsTarget = w.sleepSecs != null && target ? (w.sleepSecs - target) / 60 : null;

  const metrics = [
    ['수면 점수', w.sleepScore ?? '—',
      scoreAvg == null || w.sleepScore == null ? '' : Math.abs(w.sleepScore - scoreAvg) < 3 ? '평소 수준' : `평소 ${signed(w.sleepScore - scoreAvg)}`,
      w.sleepScore != null && scoreAvg != null && w.sleepScore < scoreAvg - 10],
    ['HRV', w.hrv != null ? `${Math.round(w.hrv)}ms` : '—',
      hrvPct == null ? '' : Math.abs(hrvPct) < 5 ? '평소 수준' : signed(hrvPct, '%'), hrvPct != null && hrvPct <= -10],
    ['안정시 심박', w.restingHR ?? '—',
      rhrDiff == null ? '' : Math.abs(rhrDiff) < 2 ? '평소 수준' : signed(rhrDiff, 'bpm'), rhrDiff != null && rhrDiff >= 3],
    ['수면 질', w.sleepQuality != null ? (SLEEP_QUALITY[w.sleepQuality] ?? w.sleepQuality) : '—', '가민 평가', false],
    ['적정 수면 대비', vsTarget == null ? '—' : signed(vsTarget, '분'),
      target ? `목표 ${hm(target)}` : '', vsTarget != null && vsTarget <= -30],
    ['7일 평균', nights7.length ? hm(avg(nights7)) : '—', `${nights7.length}일 기록`, false],
  ];

  const heroLine = vsTarget == null ? '수면 기록이 아직 없어요.'
    : vsTarget <= -30 ? `내 적정 수면보다 ${Math.round(-vsTarget)}분 부족했어요.`
    : vsTarget >= 60 ? `내 적정 수면보다 ${Math.round(vsTarget / 60 * 10) / 10}시간 더 잤어요.`
    : '내 적정 수면만큼 잘 잤어요.';

  return `
    <section class="hero">
      <span class="hero-date">SLEEP · ${day ? mmdd(day.date) : '—'}</span>
      <span class="hero-caption">어젯밤 수면</span>
      <span class="hero-big hero-big-md">${hm(w.sleepSecs)}</span>
      <span class="hero-msg">${heroLine}</span>
    </section>

    <div class="section">
      <div class="metrics">
        ${metrics.map(([label, value, note, warn]) => `
          <div class="metric">
            <span class="sub">${label}</span>
            <span class="metric-value num">${esc(value)}</span>
            <span class="metric-note ${warn ? 'is-warn' : ''}">${note || '&nbsp;'}</span>
          </div>`).join('')}
      </div>

      ${chart(data, day, ui.sleepRange)}
      ${analysis(day)}
      ${tonight(data.settings, day)}
    </div>`;
}

function chart(data, day, range) {
  const n = range === 'month' ? 30 : 7;
  const end = day?.date ?? data.today;
  const dates = dateRange(end, n);
  const target = day?.baseline?.sleepTargetSecs;
  const values = dates.map((d) => data.days[d]?.wellness?.sleepSecs ?? null);
  const known = values.filter((v) => v != null);
  const mean = known.length ? avg(known) : null;
  const diff = mean != null && target ? Math.round((mean - target) / 60) : null;

  const bars = dates.map((d, i) => {
    const v = values[i];
    const cls = d === end ? 'bar is-today' : v != null && target && v < target ? 'bar is-short' : 'bar';
    return `<div class="bar-cell"><div class="${cls}" style="height:${v == null ? 0 : barH(v)}px"></div></div>`;
  }).join('');

  const labels = range === 'month'
    ? `<div class="chart-labels chart-labels-ends"><span>${mmdd(dates[0])}</span><span>${mmdd(end)}</span></div>`
    : `<div class="chart-labels">${dates.map((d) => `<span class="${d === end ? 'is-today' : ''}">${weekdayKo(d)}</span>`).join('')}</div>`;

  return `
    <div class="block chart-block">
      <div class="block-head">
        <span class="block-title">수면 시간 추이</span>
        <div class="seg" role="group" aria-label="기간">
          <button type="button" data-action="sleep-range" data-range="week" aria-pressed="${range !== 'month'}">1주</button>
          <button type="button" data-action="sleep-range" data-range="month" aria-pressed="${range === 'month'}">1개월</button>
        </div>
      </div>
      <div class="chart ${range === 'month' ? 'is-month' : ''}" role="img" aria-label="최근 ${n}일 수면 시간">
        ${target ? `<div class="target-line" style="bottom:${barH(target)}px"></div><span class="target-label num" style="bottom:${barH(target) + 4}px">${hm(target)}</span>` : ''}
        ${bars}
      </div>
      ${labels}
      <span class="chart-summary">${mean == null ? '기록 없음' : `평균 <span class="num ink">${hm(mean)}</span>${diff == null ? '' : diff < 0 ? ` · 목표보다 ${-diff}분 부족` : ' · 목표 달성'}`}</span>
    </div>`;
}

function analysis(day) {
  const ai = day?.ai?.sleep;
  const rows = [];
  if (ai?.today) rows.push(['오늘', ai.today, false]);
  if (ai?.pattern) rows.push(['패턴', ai.pattern, false]);
  for (const w of day?.warnings ?? []) rows.push(['주의', warningText(w), true]);
  if (ai?.caution) rows.push(['주의', ai.caution, true]);
  if (!ai) rows.unshift(['오늘', 'AI 분석은 준비 중이에요. 연결되면 매일 아침 여기에 보여 드려요.', false]);
  return `
    <div class="block">
      <span class="block-title">AI 분석</span>
      ${rows.map(([k, text, warn]) => `
        <div class="ai-row">
          <span class="ai-key ${warn ? 'is-warn' : 'accent'}">${k}</span>
          <span class="ai-text">${esc(text)}</span>
        </div>`).join('')}
    </div>`;
}

function tonight(settings, day) {
  const plan = tonightBedtime(settings, day);
  if (!plan) {
    return `<a class="grad-card" href="#settings">
      <div class="grad-card-text"><span class="grad-card-title">평소 취침 시간을 알려 주세요</span>
      <span class="sub ink2">설정에서 입력하면 오늘 밤 권장 취침 시각을 알려 드려요</span></div>
      <span class="grad-card-big num">→</span></a>`;
  }
  const time = shiftTime(settings.bedtime, -plan.earlier);
  const note = plan.earlier ? `${plan.reason} 평소보다 ${plan.earlier}분 일찍` : '평소 취침 시간';
  return `
    <div class="grad-card">
      <div class="grad-card-text">
        <span class="grad-card-title">오늘 밤 이때까지 잠들기</span>
        <span class="sub ink2">${note}</span>
      </div>
      <span class="grad-card-big num">${time}</span>
    </div>`;
}
