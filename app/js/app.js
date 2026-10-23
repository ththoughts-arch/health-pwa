import { setCondition, conditionFromScore } from './theme.js';
import { initFirebase } from './firebase.js';

// 1단계: 화면은 자리만 잡아 둔다. 실제 화면은 5단계에서 시안 기준으로 구현.
const screens = {
  today: () => `
    <section class="hero">
      <div class="hero-top">
        <span class="hero-date">${formatDate(new Date())}</span>
      </div>
      <span class="hero-caption">오늘의 컨디션</span>
      <div class="hero-row">
        <span class="hero-big">—</span>
        <span class="hero-pill">기준값 수집 중</span>
      </div>
      <span class="hero-msg">처음 2주 정도는 내 평소 상태를 쌓는 기간이에요.</span>
    </section>
    <div class="section">
      <div class="row muted" id="fb-status">저장소 연결 확인 중…</div>
    </div>`,
  sleep: () => placeholder('수면', '어젯밤 수면'),
  exercise: () => placeholder('운동', '이번 주 운동 시간'),
  supplements: () => placeholder('영양제', '오늘 복용'),
};

function placeholder(title, caption) {
  return `
    <section class="hero">
      <div class="hero-top"><span class="hero-date">${formatDate(new Date())}</span></div>
      <span class="hero-caption">${caption}</span>
      <div class="hero-row"><span class="hero-big">—</span></div>
      <span class="hero-msg">${title} 화면은 준비 중이에요.</span>
    </section>`;
}

function formatDate(d) {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${days[d.getDay()]} · ${mm}.${dd}`;
}

function route() {
  const name = location.hash.slice(1) || 'today';
  const render = screens[name] || screens.today;
  document.getElementById('view').innerHTML = render();
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (name === 'today') showFirebaseStatus();
}

let fbState = 'pending';
async function showFirebaseStatus() {
  const el = document.getElementById('fb-status');
  if (!el) return;
  const text = {
    pending: '저장소 연결 확인 중…',
    unconfigured: 'Firebase 설정 전 — app/js/firebase-config.js를 채워 주세요.',
    ready: 'Firebase 연결됨',
    error: 'Firebase 연결 실패 — 콘솔을 확인해 주세요.',
  };
  el.textContent = text[fbState];
}

window.addEventListener('hashchange', route);

// 점수가 생기기 전까지는 '보통' 테마
setCondition(conditionFromScore(null));
route();

initFirebase()
  .then((fb) => { fbState = fb ? 'ready' : 'unconfigured'; })
  .catch((e) => { console.error(e); fbState = 'error'; })
  .finally(showFirebaseStatus);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.error('SW 등록 실패', e));
}
