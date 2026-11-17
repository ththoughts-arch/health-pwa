// 코칭 대시보드 화면 (2026-11-17). 채팅 코칭이 Firestore coach/ 아래에 쓴 내용을 그대로 보여 준다.
// 쓰는 쪽: 프로젝트 채팅(Claude) → tools/coach-write (Admin SDK). 구조: docs/coach-model.md
// 오늘·수면·운동·리포트 화면. 영양제는 기존 화면(checkins) 그대로.
import { addDays } from '../score.js';
import { supplementSlots } from '../model.js';

const SPORT = { run: '러닝', trail: '트레일러닝', strength: '헬스', swim: '수영' };
const VWORD = { green: '좋음', yellow: '주의', red: '회복 필요' };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const TARGET_MIN = 450; // 7h30 (기상 07:30 고정 → 23:45~24:00 취침)
const KIND = { checkin: '컨디션 체크', pre: '운동 전', post: '운동 후', guide: '남은 하루', note: '메모' };

const GEAR = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1B25" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wd = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const mondayOf = (d) => addDays(d, -((wd(d) + 6) % 7));
const fmtDate = (d) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일 (${WD[wd(d)]})`;
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const hm = (min) => (min == null ? '—' : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const row = (k, v, warn) => (v ? `<div class="c-row${warn ? ' c-warnrow' : ''}"><span class="c-k">${esc(k)}</span><span class="c-v">${esc(v)}</span></div>` : '');

const coachOf = (data) => data.coach ?? { days: {}, sessions: [], weeks: {}, reports: [] };

// 화면 기준 날짜: 사용자가 고른 날, 없으면 오늘(오늘 기록이 없으면 가장 최근 기록)
export function coachDate(state) {
  const { data, ui } = state;
  if (ui.coachDate) return ui.coachDate;
  const c = coachOf(data);
  if (c.days[data.today]) return data.today;
  const ks = Object.keys(c.days).filter((k) => k <= data.today).sort();
  return ks.length ? ks[ks.length - 1] : data.today;
}

// 판정 → 앱 테마 (theme.js의 good/normal/low)
export function coachCondition(state) {
  const lv = coachOf(state.data).days[coachDate(state)]?.verdict?.level;
  return { green: 'good', yellow: 'normal', red: 'low' }[lv] ?? 'normal';
}

function dateNav(state, date) {
  const t = state.data.today;
  return `<div class="c-datenav">
      <button type="button" data-action="cv-prev" aria-label="전날">‹</button>
      <span class="c-d">${fmtDate(date)}</span>
      <button type="button" data-action="cv-next" aria-label="다음 날" ${date >= t ? 'disabled' : ''}>›</button>
      ${date === t ? '' : '<button type="button" class="c-today-btn" data-action="cv-today">오늘로</button>'}
    </div>`;
}

// ---------- 오늘 ----------
export function renderCoachToday(state) {
  const { data } = state;
  const date = coachDate(state);
  const c = coachOf(data);
  const d = c.days[date];
  const v = d?.verdict;
  const s = d?.sleep ?? {};
  const chips = [
    ['수면', s.durationMin != null ? hm(s.durationMin) : null],
    ['점수', s.score], ['HRV', s.hrv], ['RHR', s.rhr],
    ['바디배터리', s.bodyBattery], ['준비상태', s.readiness],
  ].filter(([, x]) => x != null && x !== '').map(([k, x]) => `<span>${k}<b>${esc(x)}</b></span>`).join('');

  const hero = `<section class="c-hero">
      <div class="c-hero-top">${dateNav(state, date)}<a class="icon-btn" href="#settings" aria-label="설정">${GEAR}</a></div>
      <span class="c-cap">오늘 컨디션</span>
      ${v ? `<div class="c-verdict"><span class="c-vword">${VWORD[v.level] ?? ''}</span>
        ${v.intensity ? `<span class="c-pill"><i class="c-dot ${esc(v.level)}"></i>${esc(v.intensity)}</span>` : ''}</div>
        ${v.summary ? `<span class="c-hero-msg">${esc(v.summary)}</span>` : ''}`
      : '<div class="c-vword">아직 판정 전</div><span class="c-hero-msg">아침에 가민 수면·바디배터리·준비상태 캡처를 채팅으로 보내 주시면 여기에 판정이 나와요.</span>'}
      ${chips ? `<div class="c-chips">${chips}</div>` : ''}
    </section>`;

  const b = d?.brief;
  const brief = `<section class="c-sec"><h2>아침 브리핑${b?.time ? `<span class="c-meta">${esc(b.time)}</span>` : ''}</h2>
      ${b ? row('수면', b.sleep) + row('오늘 생활', b.life) + row('예정 운동', b.workout) + row('마무리', b.finish) + row('주의', b.caution, true)
    : '<p class="c-empty">이 날 아침 브리핑이 없어요.</p>'}</section>`;

  const ups = (d?.updates ?? []).slice().sort((x, y) => String(y.time).localeCompare(String(x.time)));
  const updates = `<section class="c-sec"><h2>하루 업데이트<span class="c-meta">최신이 위</span></h2>
      ${ups.length ? `<div class="c-tl">${ups.map((u) => `<div class="c-tl-item"><span class="c-t">${esc(u.time)}</span>
        <div class="c-b"><div class="c-ti">${u.kind ? `<span class="c-tag">${esc(KIND[u.kind] ?? u.kind)}</span>` : ''}${esc(u.title)}</div>
        <div class="c-tx">${esc(u.body)}</div></div></div>`).join('')}</div>`
    : '<p class="c-empty">낮에 바디배터리·스트레스 캡처를 보내거나 운동 전에 물어보시면 여기에 시간순으로 쌓여요.</p>'}</section>`;

  const sess = c.sessions.filter((x) => x.date === date);
  const todaySess = sess.length ? `<section class="c-sec"><h2>오늘 운동<a class="c-meta" href="#exercise">운동 탭 →</a></h2>
      ${sess.map((x) => row(SPORT[x.sport] ?? '', [x.title, x.summary].filter(Boolean).join('\n'))).join('')}</section>` : '';

  let supBlock = '';
  if (date === data.today) {
    const { slots } = supplementSlots(data);
    const done = slots.filter((x) => x.done).length;
    if (slots.length) {
      supBlock = `<section class="c-sec"><h2>영양제<a class="c-meta" href="#supplements">${done} / ${slots.length} 시간대 →</a></h2>
        <div class="c-progress"><div style="width:${Math.round(done / slots.length * 100)}%"></div></div></section>`;
    }
  }
  return `<div class="cv">${hero}${brief}${updates}${todaySess}${supBlock}</div>`;
}

// ---------- 수면 ----------
export function renderCoachSleep(state) {
  const date = coachDate(state);
  const c = coachOf(state.data);
  const d = c.days[date];
  const s = d?.sleep ?? {};
  const a = d?.sleepAnalysis ?? {};
  const keys = Object.keys(c.days).filter((k) => k <= date).sort().slice(-14);
  const prevKeys = keys.filter((k) => k < date).slice(-7);
  const avg = (f) => {
    const xs = prevKeys.map((k) => c.days[k]?.sleep?.[f]).filter(isNum);
    return xs.length ? xs.reduce((p, x) => p + x, 0) / xs.length : null;
  };
  const delta = (cur, base, unit, higherIsBad) => {
    if (!isNum(cur) || !isNum(base)) return '';
    const dlt = cur - base;
    if (Math.abs(dlt) < 0.5) return '<span class="c-md">7일 평균과 같음</span>';
    const bad = higherIsBad ? dlt > 0 : dlt < 0;
    return `<span class="c-md ${bad ? 'c-bad' : 'c-good'}">7일 평균 대비 ${dlt > 0 ? '+' : ''}${Math.round(dlt)}${unit}</span>`;
  };
  const last7 = Object.keys(c.days).filter((k) => k <= date && k > addDays(date, -7));
  const debt = last7.reduce((p, k) => {
    const m = c.days[k]?.sleep?.durationMin;
    return p + (isNum(m) ? Math.max(0, TARGET_MIN - m) : 0);
  }, 0);

  const hero = `<section class="c-hero">
      <div class="c-hero-top">${dateNav(state, date)}</div>
      <span class="c-cap">직전 수면</span>
      <div class="c-big">${s.durationMin != null ? `${Math.floor(s.durationMin / 60)}<small>h</small>${String(s.durationMin % 60).padStart(2, '0')}<small>m</small>` : '—'}</div>
      <span class="c-hero-msg">${esc(a.headline || (s.durationMin != null ? `목표 7시간 30분 대비 ${s.durationMin >= TARGET_MIN ? '충분' : `${hm(TARGET_MIN - s.durationMin)} 부족`}` : '이 날 수면 기록이 없어요.'))}</span>
    </section>`;

  const alert = a.alert ? `<section class="c-sec"><div class="c-alert"><i class="c-dot"></i><div><b>반드시 개선 필요</b><span>${esc(a.alert)}</span></div></div></section>` : '';
  const bed = (a.bedtime || a.tonight) ? `<section class="c-sec"><div class="c-bed"><span class="c-cap">오늘 밤 취침</span>
      <div class="c-big">${esc(a.bedtime || '')}</div><span>${esc(a.tonight || '')}</span></div></section>` : '';

  const st = s.stages;
  const stTot = st ? (st.deep || 0) + (st.light || 0) + (st.rem || 0) + (st.awake || 0) : 0;
  const C = { deep: '#3B4FB8', light: '#8FA8FF', rem: '#C58BE8', awake: '#FFB38A' };
  const stages = stTot ? `<div class="c-stages" role="img" aria-label="수면 단계 비율">${['deep', 'light', 'rem', 'awake'].map((k) => `<i style="width:${(st[k] || 0) / stTot * 100}%;background:${C[k]}"></i>`).join('')}</div>
      <div class="c-legend">${[['deep', '깊은'], ['light', '얕은'], ['rem', 'REM'], ['awake', '깸']].map(([k, l]) => `<span style="--c:${C[k]}">${l} ${hm(st[k] || 0)}</span>`).join('')}</div>` : '';

  const metrics = `<section class="c-sec"><h2>지표</h2>
      <div class="c-metrics">
        <div><div class="c-mk">수면 점수</div><div class="c-mv">${s.score ?? '—'}</div>${delta(s.score, avg('score'), '', false)}</div>
        <div><div class="c-mk">HRV (밤)</div><div class="c-mv">${s.hrv ?? '—'}<small class="c-md"> ms</small></div>${delta(s.hrv, avg('hrv'), 'ms', false)}</div>
        <div><div class="c-mk">안정시 심박</div><div class="c-mv">${s.rhr ?? '—'}</div>${delta(s.rhr, avg('rhr'), 'bpm', true)}</div>
        <div><div class="c-mk">7일 수면 빚</div><div class="c-mv">${hm(debt)}</div><span class="c-md">목표 7h30 대비 부족 합</span></div>
        <div><div class="c-mk">바디배터리</div><div class="c-mv">${esc(s.bodyBattery ?? '—')}</div></div>
        <div><div class="c-mk">준비상태</div><div class="c-mv">${s.readiness ?? '—'}</div>${s.hrvStatus ? `<span class="c-md">HRV ${esc(s.hrvStatus)}</span>` : ''}</div>
      </div>${stages}</section>`;

  const chart = `<section class="c-sec"><h2>최근 2주 수면<span class="c-meta">점선 = 목표 7h30</span></h2>
      <div class="c-chart">${sleepChart(c, keys, date)}</div><div class="c-chart">${trendChart(c, keys, date)}</div></section>`;

  const analysis = `<section class="c-sec"><h2>수면 분석</h2>
      ${[a.last, a.trend, a.recovery, a.debt, a.pattern, a.exercise].some(Boolean)
    ? row('직전 수면', a.last) + row('추이', a.trend) + row('회복', a.recovery) + row('수면 빚', a.debt) + row('패턴', a.pattern) + row('운동 영향', a.exercise)
    : '<p class="c-empty">이 날 수면 분석이 없어요.</p>'}</section>`;

  return `<div class="cv">${hero}${alert}${bed}${metrics}${chart}${analysis}</div>`;
}

function sleepChart(c, keys, date) {
  if (!keys.length) return '<p class="c-empty">기록이 쌓이면 그래프가 나와요.</p>';
  const W = 340, H = 150, L = 28, R = 6, T = 10, B = 22, maxMin = 540;
  const bw = (W - L - R) / keys.length;
  const y = (m) => T + (H - T - B) * (1 - Math.min(m, maxMin) / maxMin);
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 수면 시간 막대그래프">`;
  for (const h of [5, 6, 7, 8, 9]) out += `<line x1="${L}" x2="${W - R}" y1="${y(h * 60)}" y2="${y(h * 60)}" stroke="#ECEDF1"/><text x="${L - 6}" y="${y(h * 60) + 3}" text-anchor="end">${h}h</text>`;
  out += '<defs><linearGradient id="cpg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#9FB4FF"/><stop offset="1" stop-color="#6C8CFF"/></linearGradient></defs>';
  keys.forEach((k, i) => {
    const m = c.days[k]?.sleep?.durationMin;
    const x = L + i * bw + bw * 0.18, w = bw * 0.64;
    if (isNum(m)) out += `<rect x="${x}" y="${y(m)}" width="${w}" height="${y(0) - y(m)}" rx="3" fill="${k === date ? 'url(#cpg)' : (m < 360 ? '#F4B3A6' : '#D5DCF2')}"/>`;
    if (i % 2 === (keys.length - 1) % 2) out += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${md(k)}</text>`;
  });
  out += `<line x1="${L}" x2="${W - R}" y1="${y(TARGET_MIN)}" y2="${y(TARGET_MIN)}" stroke="#1A1B25" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  return `${out}</svg>`;
}

function trendChart(c, keys, date) {
  const pts = keys.map((k) => ({ k, hrv: c.days[k]?.sleep?.hrv, rhr: c.days[k]?.sleep?.rhr }));
  const hv = pts.map((p) => p.hrv).filter(isNum), rv = pts.map((p) => p.rhr).filter(isNum);
  if (hv.length < 2) return '';
  const W = 340, H = 120, L = 28, R = 28, T = 14, B = 20;
  const n = keys.length, step = n > 1 ? (W - L - R) / (n - 1) : 0;
  const hMin = Math.min(...hv) - 4, hMax = Math.max(...hv) + 4;
  const rMin = Math.min(...rv) - 2, rMax = Math.max(...rv) + 2;
  const yh = (v) => T + (H - T - B) * (1 - (v - hMin) / (hMax - hMin));
  const yr = (v) => T + (H - T - B) * (1 - (v - rMin) / (rMax - rMin));
  const line = (f, yf) => pts.map((p, i) => (isNum(p[f]) ? `${L + i * step},${yf(p[f])}` : null)).filter(Boolean).join(' ');
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="HRV와 안정시 심박 추이">`;
  out += `<text x="${L}" y="10">HRV ms (파랑)</text><text x="${W - R}" y="10" text-anchor="end">RHR bpm (주황)</text>`;
  out += `<polyline points="${line('hrv', yh)}" fill="none" stroke="#4A6CF0" stroke-width="2"/>`;
  if (rv.length > 1) out += `<polyline points="${line('rhr', yr)}" fill="none" stroke="#E8590C" stroke-width="2"/>`;
  pts.forEach((p, i) => {
    const x = L + i * step, sel = p.k === date;
    if (isNum(p.hrv)) out += `<circle cx="${x}" cy="${yh(p.hrv)}" r="${sel ? 4 : 2.5}" fill="#4A6CF0"/>`;
    if (isNum(p.rhr)) out += `<circle cx="${x}" cy="${yr(p.rhr)}" r="${sel ? 4 : 2.5}" fill="#E8590C"/>`;
    if (sel && isNum(p.hrv)) out += `<text x="${x}" y="${yh(p.hrv) - 7}" text-anchor="middle" class="c-strong">${p.hrv}</text>`;
    if (sel && isNum(p.rhr)) out += `<text x="${x}" y="${yr(p.rhr) + 14}" text-anchor="middle" class="c-strong">${p.rhr}</text>`;
    if (i === 0 || i === n - 1) out += `<text x="${x}" y="${H - 4}" text-anchor="middle">${md(p.k)}</text>`;
  });
  return `${out}</svg>`;
}

// ---------- 운동 ----------
export function renderCoachExercise(state) {
  const date = coachDate(state);
  const sport = state.ui.coachSport ?? 'all';
  const c = coachOf(state.data);
  const mon = mondayOf(date);
  const week = c.weeks[mon];
  const inWeek = c.sessions.filter((x) => x.date >= mon && x.date <= addDays(mon, 6));
  const runKm = inWeek.filter((x) => x.sport === 'run' || x.sport === 'trail').reduce((p, x) => p + (x.distanceKm || 0), 0);
  const mins = inWeek.reduce((p, x) => p + (x.durationMin || 0), 0);
  const strN = inWeek.filter((x) => x.sport === 'strength').length;
  const swimM = inWeek.filter((x) => x.sport === 'swim').reduce((p, x) => p + (x.distanceM || 0), 0);

  const hero = `<section class="c-hero">
      <div class="c-hero-top">${dateNav(state, date)}</div>
      <span class="c-cap">이번 주 (${md(mon)}~${md(addDays(mon, 6))}) 운동 시간</span>
      <div class="c-big">${hm(mins)}</div>
      <div class="c-chips"><span>러닝<b>${runKm.toFixed(1)}km</b></span><span>헬스<b>${strN}회</b></span><span>수영<b>${swimM.toLocaleString()}m</b></span></div>
      ${week?.focus ? `<span class="c-hero-msg">${esc(week.focus)}</span>` : ''}
    </section>`;

  const filters = `<section class="c-sec c-sec-tight"><div class="c-filters" role="group" aria-label="종목">
      ${[['all', '전체'], ['run', '러닝'], ['trail', '트레일러닝'], ['strength', '헬스'], ['swim', '수영']].map(([k, l]) => `<button type="button" data-action="cv-sport" data-sport="${k}" aria-pressed="${sport === k}">${l}</button>`).join('')}
    </div></section>`;

  let plan = '';
  if (week?.plan?.length && sport === 'all') {
    const ST = { done: ['완료', 'c-st-ok'], missed: ['미수행', 'c-st-miss'], partial: ['일부', 'c-st-part'], planned: ['예정', 'c-st-plan'], rest: ['휴식', 'c-st-plan'] };
    plan = `<section class="c-sec"><h2>이번 주 계획 대비 실행</h2><div class="c-tw"><table class="c-table">
        <thead><tr><th>요일</th><th>계획</th><th>실행</th></tr></thead><tbody>
        ${week.plan.map((p) => { const st = ST[p.status] ?? ['', '']; return `<tr><td>${esc(p.day)}</td><td>${esc(p.plan)}</td><td><span class="${st[1]}">${st[0]}</span>${p.actual ? `<br><span class="c-md">${esc(p.actual)}</span>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div></section>`;
  }

  let strength = '';
  if (week && (sport === 'all' || sport === 'strength') && (week.muscleSets || week.lifts?.length)) {
    const ms = week.muscleSets ? Object.entries(week.muscleSets) : [];
    const goal = 10, max = Math.max(goal * 1.4, ...ms.map(([, v]) => v));
    strength = `<section class="c-sec"><h2>헬스 · 부위별 주간 작업 세트<span class="c-meta">눈금 = 10세트</span></h2>
        ${ms.length ? `<div class="c-bars">${ms.map(([k, v]) => `<div class="c-bar"><span>${esc(k)}</span><span class="c-track"><span class="c-fill" style="width:${v / max * 100}%"></span><span class="c-goal" style="left:${goal / max * 100}%"></span></span><span class="num">${v}</span></div>`).join('')}</div>` : ''}
        ${week.lifts?.length ? `<div class="c-tw"><table class="c-table"><thead><tr><th>종목</th><th class="c-n">이번</th><th class="c-n">e1RM</th><th>다음 목표</th></tr></thead><tbody>
          ${week.lifts.map((l) => `<tr><td>${esc(l.name)}</td><td class="c-n">${esc(l.best)}</td><td class="c-n">${esc(l.e1rm ?? '')}</td><td>${esc(l.next)}</td></tr>`).join('')}
        </tbody></table></div>` : ''}</section>`;
  }

  const list = c.sessions.filter((x) => (sport === 'all' || x.sport === sport) && x.date <= date).slice(0, 30);
  const sessions = `<section class="c-sec"><h2>세션 기록<span class="c-meta">${sport === 'all' ? '전체' : SPORT[sport]} · 최근 순</span></h2>
      ${list.length ? list.map(sessionHtml).join('') : '<p class="c-empty">아직 기록이 없어요. 운동 후 캡처나 TCX를 채팅으로 보내 주시면 분석과 함께 여기에 쌓여요.</p>'}</section>`;

  return `<div class="cv">${hero}${filters}${plan}${strength}${sessions}</div>`;
}

function sessionHtml(x) {
  const m = x.metrics ? Object.entries(x.metrics).map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('') : '';
  const sets = x.sets?.length ? `<div class="c-sets">${x.sets.map((s) => `<div><span class="c-nm">${esc(s.name)}</span><span class="c-sv">${esc(s.sets)}</span></div>`).join('')}</div>` : '';
  const splits = x.splits?.length ? `<details class="c-details"><summary>km 스플릿</summary><div class="c-kv">${x.splits.map((s, i) => `<span>${i + 1}km <b>${esc(s)}</b></span>`).join('')}</div></details>` : '';
  return `<article class="c-sess">
      <div class="c-sess-h"><span class="c-ti"><span class="c-tag">${SPORT[x.sport] ?? ''}</span>${esc(x.title)}</span><span class="c-when">${md(x.date)} ${esc(x.time ?? '')}</span></div>
      ${m ? `<div class="c-kv">${m}</div>` : ''}
      ${row('운동 전', x.pre)}${sets}${splits}${row('분석', x.analysis)}${row('다음', x.next)}
    </article>`;
}

// ---------- 리포트 ----------
export function renderReports(state) {
  const reports = coachOf(state.data).reports;
  const hero = `<section class="c-hero">
      <span class="c-cap">주간·월간 건강 리포트</span>
      <div class="c-big">${reports.length}<small>개</small></div>
      <span class="c-hero-msg">주간은 매주 월요일 08:30, 월간은 매월 1일 08:30에 올라와요. A4 PDF는 프로젝트 파일의 reports 폴더에 함께 저장돼요.</span>
    </section>`;
  const list = reports.length ? reports.map((r, i) => `<article class="c-rep">
      <span class="c-cap">${r.kind === 'monthly' ? '월간' : '주간'} · ${esc(r.period)}</span>
      <span class="c-ti">${esc(r.title)}</span>
      ${r.summary ? `<div class="c-pre">${esc(r.summary)}</div>` : ''}
      ${(r.sections?.length || r.focus?.length) ? `<details class="c-details" ${i === 0 ? 'open' : ''}><summary>자세히</summary>
        ${(r.sections ?? []).map((s) => row(s.title, s.body)).join('')}
        ${r.focus?.length ? row('다음 포커스', r.focus.map((f, j) => `${j + 1}. ${f}`).join('\n')) : ''}
      </details>` : ''}
    </article>`).join('') : '<section class="c-sec"><p class="c-empty">아직 리포트가 없어요.</p></section>';
  return `<div class="cv">${hero}${list}</div>`;
}
