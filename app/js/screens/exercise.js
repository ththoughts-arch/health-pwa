import { SPORT_LABEL, duration, esc, hm, mmdd, warningText } from '../format.js';
import { activitiesBetween, intensity, pickDisplayDay } from '../model.js';
import { addDays } from '../score.js';
import { exerciseSummary } from './strength.js';
import { syncButton } from './common.js';

const FILTERS = [['all', '전체'], ['run', '러닝'], ['trail', '트레일'], ['swim', '수영'], ['strength', '헬스']];
const COACH = { all: '종목 코치', run: '러닝 코치', trail: '트레일 코치', swim: '수영 코치', strength: '헬스 코치' };

// 초 → '02H 45M' (단위는 작게)
function hoursMinutes(secs) {
  const m = Math.round(secs / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(m / 60))}<small>H</small> ${pad(m % 60)}<small>M</small>`;
}

export function renderExercise(state) {
  const { data, ui } = state;
  const sport = ui.sport;
  const from = addDays(data.today, -6);
  const thisWeek = activitiesBetween(data, from, data.today, sport);
  const lastWeek = activitiesBetween(data, addDays(data.today, -13), addDays(data.today, -7), sport);
  const secs = (acts) => acts.reduce((s, a) => s + (a.movingSecs ?? 0), 0);
  const now = secs(thisWeek);
  const before = secs(lastWeek);
  const change = before ? Math.round(((now - before) / before) * 100) : null;
  const dist = intensity(thisWeek);

  return `
    <section class="hero">
      <div class="hero-top">
        <span class="hero-date">TRAINING</span>
        <div class="hero-actions">
          <a class="chip-btn" href="#strength">+ 헬스 기록</a>
          ${syncButton(state, 'exercise')}
        </div>
      </div>
      <div class="hero-split">
        <div class="hero-col">
          <span class="hero-caption hero-caption-tight">최근 7일 운동 시간</span>
          <span class="hero-big hero-hm">${hoursMinutes(now)}</span>
        </div>
        <div class="hero-side">
          <span class="hero-change num">${change == null ? '—' : `${change > 0 ? '+' : ''}${change}%`}</span>
          <span class="sub ink2">지난주 대비 · ${thisWeek.length}회</span>
        </div>
      </div>
    </section>

    <div class="section section-tight">
      <div class="pills" role="group" aria-label="종목">
        ${FILTERS.map(([id, label]) => `<button type="button" class="pill" data-action="sport" data-sport="${id}" aria-pressed="${id === sport}">${label}</button>`).join('')}
      </div>

      <div class="block block-line">
        <div class="block-head">
          <span class="block-title-sm">강도 분포</span>
          <span class="sub">권장 쉬움 80%</span>
        </div>
        ${dist ? `
          <div class="dist" role="img" aria-label="쉬움 ${dist.easy}%, 보통 ${dist.mid}%, 고강도 ${dist.hard}%">
            <div class="dist-easy" style="width:${dist.easy}%"></div>
            <div class="dist-mid" style="width:${dist.mid}%"></div>
            <div class="dist-hard" style="width:${dist.hard}%"></div>
          </div>
          <div class="dist-labels num"><span>쉬움 ${dist.easy}</span><span>보통 ${dist.mid}</span><span class="warn-ink">고강도 ${dist.hard}</span></div>`
        : '<p class="sub">이번 주 심박 기록이 있는 운동이 없어요.</p>'}
      </div>

      ${feedback(data, ui, thisWeek, dist, now)}
      ${recent(data, sport)}
    </div>`;
}

function feedback(data, ui, thisWeek, dist, secs) {
  const day = pickDisplayDay(data);
  const health = ui.feedback !== 'coach';
  const ai = data.exerciseCoach;   // coach/exercise (Gemini, 동기화 때 갱신)
  // 건강 경고를 코치 추천보다 먼저 (AI 경고 → 규칙 경고 순)
  const warnText = ai?.warning
    || (day?.warnings?.[0] ? warningText(day.warnings[0]) : null)
    || (day?.score?.band === 'low' ? '회복 지표가 낮아, 오늘은 코치 추천보다 휴식이 먼저예요.' : null);

  let lines;
  if (health) {
    if (ai?.health) lines = [ai.health];
    else {
      const mins = Math.round(secs / 60);
      lines = [mins >= 150
        ? `최근 7일 ${duration(mins)} 운동했어요. 주 150분 권장량을 넘었어요.`
        : `최근 7일 ${duration(mins)} 운동했어요. 주 150분 권장량까지 ${150 - mins}분 남았어요.`];
      if (dist) {
        lines.push(dist.easy >= 75
          ? `쉬움 강도가 ${dist.easy}%로 건강한 분포예요.`
          : `쉬움 강도가 ${dist.easy}%예요. 심박 140 이하 운동 비중을 80% 안팎으로 늘려 보세요.`);
      }
    }
  } else {
    lines = [ai?.coach?.[ui.sport]
      || (ai ? `최근 4주 ${FILTERS.find(([id]) => id === ui.sport)[1]} 기록이 없어 코치 의견이 없어요.`
        : '동기화하면 기록을 보고 AI 코치 의견을 보여 드려요. 설정에서 Gemini API 키가 필요해요.')];
  }

  return `
    <div class="block block-line">
      <div class="tabs" role="tablist" aria-label="피드백 관점">
        <button type="button" role="tab" class="tab" data-action="feedback" data-mode="health" aria-selected="${health}">건강 전문가</button>
        <button type="button" role="tab" class="tab" data-action="feedback" data-mode="coach" aria-selected="${!health}">${COACH[ui.sport]}</button>
      </div>
      ${warnText ? `<div class="warn-inline"><span class="warn-dot" aria-hidden="true"></span>
        <span class="warn-ink">${esc(warnText)}</span></div>` : ''}
      <div class="feedback-text">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      ${ai?.date ? `<span class="sub ai-meta">${ai.date.slice(5).replace('-', '.')} 분석 · ${esc(ai.model ?? '')}</span>` : ''}
    </div>`;
}

// 가민 활동 + 헬스 수동 기록. 같은 날 가민 헬스 활동과 연결된 수동 기록은 한 줄로 합친다
function recent(data, sport) {
  const from = addDays(data.today, -13);
  const acts = activitiesBetween(data, from, data.today, sport);
  const logs = sport === 'all' || sport === 'strength' ? data.strength.filter((s) => s.date >= from) : [];
  const linked = new Set(logs.map((l) => l.activityId).filter(Boolean));

  const rows = [
    ...acts.filter((a) => !linked.has(a.id)).map((a) => ({ key: a.startLocal ?? a.date, html: actRow(a) })),
    ...logs.map((l) => {
      const act = acts.find((a) => a.id === l.activityId);
      return { key: act?.startLocal ?? `${l.date}T23:59`, html: strengthRow(l, act) };
    }),
  ].sort((a, b) => b.key.localeCompare(a.key)).slice(0, 8);

  if (!rows.length) return '<div class="block block-line"><span class="block-title">최근 기록</span><p class="sub">최근 2주 기록이 없어요.</p></div>';
  return `
    <div class="block block-line">
      <span class="block-title">최근 기록</span>
      ${rows.map((r) => r.html).join('')}
    </div>`;
}

// 러닝·트레일은 눌러서 상세 분석(#run=ID)으로
function actRow(a) {
  const run = a.sport === 'run' || a.sport === 'trail';
  const tag = run ? 'a' : 'div';
  const link = run ? ` href="#run=${encodeURIComponent(a.id)}" aria-label="${mmdd(a.date)} ${SPORT_LABEL[a.sport]} 상세 분석"` : '';
  return `
    <${tag} class="act-row"${link}>
      <span class="num act-date">${mmdd(a.date)}</span>
      <span class="act-main">
        <span class="act-title">${SPORT_LABEL[a.sport] ?? esc(a.rawType)}${run && a.ai ? ' <span class="ai-badge">AI</span>' : ''}</span>
        <span class="sub">${actMeta(a)}</span>
      </span>
      <span class="num act-big">${actBig(a)}${run ? ' <span class="chev" aria-hidden="true">›</span>' : ''}</span>
    </${tag}>`;
}

function strengthRow(log, act) {
  const ex = log.exercises ?? [];
  const meta = ex.slice(0, 2).map(exerciseSummary).join(' · ') + (ex.length > 2 ? ` 외 ${ex.length - 2}` : '');
  return `
    <a class="act-row" href="#strength=${encodeURIComponent(log.id)}" aria-label="${mmdd(log.date)} 헬스 기록 수정">
      <span class="num act-date">${mmdd(log.date)}</span>
      <span class="act-main">
        <span class="act-title">헬스${log.note ? ` · ${esc(log.note)}` : ''}</span>
        <span class="sub">${esc(meta)}</span>
      </span>
      <span class="num act-big">${act?.movingSecs ? `${Math.round(act.movingSecs / 60)}′` : `${ex.length}종목`}</span>
    </a>`;
}

function actMeta(a) {
  const parts = [a.movingSecs ? hm(a.movingSecs) : null];
  if (a.sport === 'swim' && a.distanceM && a.movingSecs) {
    const per100 = a.movingSecs / (a.distanceM / 100);
    parts.push(`100m ${Math.floor(per100 / 60)}:${String(Math.round(per100 % 60)).padStart(2, '0')}`);
  } else if (a.avgHr) {
    parts.push(`평균 ${Math.round(a.avgHr)}bpm`);
  }
  if (a.sport === 'trail' && a.elevationGainM) parts.push(`상승 ${Math.round(a.elevationGainM)}m`);
  return parts.filter(Boolean).join(' · ');
}

function actBig(a) {
  if (!a.distanceM) return a.movingSecs ? `${Math.round(a.movingSecs / 60)}′` : '';
  if (a.sport === 'swim') return `${Math.round(a.distanceM).toLocaleString('ko-KR')}m`;
  return `${(a.distanceM / 1000).toFixed(1)}km`;
}
