import { SPORT_LABEL, esc, hm, mmdd } from '../format.js';
import { intensity } from '../model.js';
import { paceText } from '../run.js';

const AI_ROWS = [
  ['summary', '요약'], ['pacing', '페이스'], ['heartRate', '심박'], ['form', '자세·효율'],
  ['intervals', '인터벌'], ['comparison', '최근 비교'], ['nextRun', '다음 러닝'],
];

// 초 → '3:05' (인터벌 구간 시간)
function mmss(secs) {
  if (secs == null) return '—';
  const s = Math.round(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 러닝·트레일 한 번의 상세 + AI 분석 (#run=ID)
export function renderRun({ data, ui }, id) {
  const a = data.activities.find((x) => x.id === id);
  if (!a) {
    return `<section class="hero hero-short"><div class="hero-top"><a class="back-link" href="#exercise">← 운동</a></div>
      <span class="hero-msg">기록을 찾을 수 없어요. 최근 4주 기록만 볼 수 있어요.</span></section>`;
  }
  const km = a.distanceM ? a.distanceM / 1000 : null;
  const pace = km && a.movingSecs ? a.movingSecs / km : null;
  // 케이던스가 100 미만이면 한쪽 발 기준 → 분당 걸음 수로
  const spm = a.cadence ? Math.round(a.cadence < 100 ? a.cadence * 2 : a.cadence) : null;
  const dist = intensity([a]);
  const metrics = [
    ['시간', hm(a.movingSecs)],
    ['평균 페이스', pace ? `${paceText(pace)}/km` : '—'],
    ['평균 심박', a.avgHr ? `${Math.round(a.avgHr)}` : '—'],
    ['최대 심박', a.maxHr ?? '—'],
    ['케이던스', spm ? `${spm}spm` : '—'],
    [a.sport === 'trail' ? '상승' : '훈련 부하', a.sport === 'trail' ? `${Math.round(a.elevationGainM ?? 0)}m` : (a.trainingLoad ?? '—')],
  ];

  return `
    <section class="hero hero-short">
      <div class="hero-top">
        <a class="back-link" href="#exercise">← 운동</a>
        <span class="hero-date">${a.sport === 'trail' ? 'TRAIL' : 'RUN'} · ${mmdd(a.date)}</span>
      </div>
      <span class="hero-caption hero-caption-tight">${SPORT_LABEL[a.sport] ?? esc(a.rawType)}</span>
      <div class="hero-row hero-row-tight">
        <span class="hero-big hero-big-md">${km ? km.toFixed(2) : '—'}</span>
        <span class="hero-total num">km</span>
      </div>
    </section>

    <div class="section">
      <div class="metrics">
        ${metrics.map(([label, value]) => `
          <div class="metric"><span class="sub">${label}</span><span class="metric-value num">${esc(value)}</span></div>`).join('')}
      </div>

      ${dist ? `
        <div class="block">
          <div class="block-head"><span class="block-title-sm">강도 분포</span><span class="sub">쉬움 = 존1–2</span></div>
          <div class="dist" role="img" aria-label="쉬움 ${dist.easy}%, 보통 ${dist.mid}%, 고강도 ${dist.hard}%">
            <div class="dist-easy" style="width:${dist.easy}%"></div>
            <div class="dist-mid" style="width:${dist.mid}%"></div>
            <div class="dist-hard" style="width:${dist.hard}%"></div>
          </div>
          <div class="dist-labels num"><span>쉬움 ${dist.easy}</span><span>보통 ${dist.mid}</span><span class="warn-ink">고강도 ${dist.hard}</span></div>
        </div>` : ''}

      ${aiBlock(a, data, ui.runJobs?.[id])}
      ${splitsBlock(a.detail)}
      ${lapsBlock(a.detail)}
    </div>`;
}

function aiBlock(a, data, job) {
  let body;
  if (a.ai) {
    const rows = AI_ROWS.filter(([k]) => a.ai[k]).map(([k, label]) => [label, a.ai[k], false]);
    if (a.ai.caution) rows.push(['주의', a.ai.caution, true]);
    body = rows.map(([k, text, warn]) => `
      <div class="ai-row"><span class="ai-key ${warn ? 'is-warn' : 'accent'}">${k}</span><span class="ai-text">${esc(text)}</span></div>`).join('')
      + `<span class="sub ai-meta">${esc(a.ai.model ?? '')}</span>`;
  } else if (job?.busy) {
    body = `<p class="sub analyzing">AI가 이 러닝을 구간별로 분석하고 있어요… (보통 10~30초)</p>`;
  } else if (job?.error) {
    body = `<p class="sub warn-ink">${esc(job.error)}</p>
      <button type="button" class="ghost-btn" data-action="run-retry" data-id="${esc(a.id)}">다시 분석</button>`;
  } else if (!data.keys.geminiApiKey || !data.keys.intervalsApiKey) {
    body = '<a class="sub link-inline" href="#settings">설정에서 intervals.icu·Gemini 키를 넣으면 분석해 드려요 →</a>';
  } else {
    body = '<p class="sub">분석을 준비하고 있어요…</p>';
  }
  return `<div class="block block-line"><span class="block-title">AI 러닝 분석</span>${body}</div>`;
}

function splitsBlock(detail) {
  const splits = detail?.splits;
  if (!splits?.length) return '';
  const paces = splits.filter((s) => !s.partialM && s.paceSecPerKm).map((s) => s.paceSecPerKm);
  const best = paces.length ? Math.min(...paces) : null;
  return `
    <div class="block block-line">
      <div class="block-head">
        <span class="block-title">km 구간</span>
        ${detail.decouplingPct != null ? `<span class="sub">후반 디커플링 ${detail.decouplingPct}%</span>` : ''}
      </div>
      <div class="split-table" role="table" aria-label="1km 구간별 페이스와 심박">
        <div class="split-tr split-th" role="row"><span>km</span><span>페이스</span><span>심박</span><span>케이던스</span><span>↑m</span></div>
        ${splits.map((s) => `
          <div class="split-tr ${s.paceSecPerKm === best ? 'is-best' : ''}" role="row">
            <span class="num">${s.partialM ? `+${s.partialM}m` : s.km}</span>
            <span class="num">${paceText(s.paceSecPerKm)}</span>
            <span class="num">${s.avgHr ?? '—'}</span>
            <span class="num">${s.cadence ? Math.round(s.cadence < 100 ? s.cadence * 2 : s.cadence) : '—'}</span>
            <span class="num">${s.elevGainM ?? '—'}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

// 인터벌 훈련처럼 WORK 구간이 있을 때만 랩 표시
function lapsBlock(detail) {
  const laps = detail?.laps ?? [];
  if (!laps.some((l) => l.type === 'WORK')) return '';
  return `
    <div class="block block-line">
      <span class="block-title">인터벌</span>
      <div class="split-table" role="table" aria-label="인터벌 구간">
        <div class="split-tr split-th" role="row"><span>구분</span><span>거리</span><span>페이스</span><span>심박</span><span>시간</span></div>
        ${laps.map((l) => `
          <div class="split-tr ${l.type === 'WORK' ? 'is-work' : ''}" role="row">
            <span>${l.type === 'WORK' ? '질주' : l.type === 'RECOVERY' ? '회복' : '기타'}</span>
            <span class="num">${l.distanceM != null ? `${l.distanceM}m` : '—'}</span>
            <span class="num">${paceText(l.paceSecPerKm)}</span>
            <span class="num">${l.avgHr ?? '—'}</span>
            <span class="num">${mmss(l.movingSecs)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}
