// 여러 화면 히어로에 들어가는 동기화 버튼
const SYNC_ICON = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1B25" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/></svg>';

// 진행 문구는 지금 보고 있는 화면 기준 (운동 탭에서 "수면 분석 중"이 뜨지 않게)
function stepText(sync, screen) {
  if (sync.busy) return sync.step ?? '동기화 중…';
  const pending = sync.pending ?? [];
  if (screen === 'exercise' && pending.includes('exercise')) return '운동 코칭 중…';
  if (screen === 'sleep' && pending.includes('sleep')) return '수면 분석 중…';
  return 'AI 분석 중…';
}

export function syncButton({ sync }, screen) {
  // 데이터 동기화 중이거나 AI 분석을 받는 중
  const busy = !!(sync?.busy || sync?.ai);
  const step = busy ? stepText(sync, screen) : '';
  return `<button type="button" class="sync-btn ${busy ? 'is-busy' : ''}" data-action="sync" ${busy ? 'disabled' : ''}
    aria-label="${busy ? esc(step) : '지금 동기화'}">${SYNC_ICON}${busy ? `<span class="sync-step">${esc(step)}</span>` : ''}</button>`;
}

// '08:12 동기화' / '10.25 08:12 동기화'
export function lastSyncText(data) {
  const t = data.lastSyncAt;
  if (!t) return '아직 동기화 전';
  const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const day = new Intl.DateTimeFormat('en-CA').format(t);
  return day === data.today ? `${hhmm} 동기화` : `${day.slice(5).replace('-', '.')} ${hhmm} 동기화`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
