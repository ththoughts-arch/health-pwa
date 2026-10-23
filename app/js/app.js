import { setCondition, conditionFromScore } from './theme.js';
import { initFirebase } from './firebase.js';
import {
  loadAll, newSupplementId, saveBodyBattery, saveSettings, saveSupplement, saveSupplementDef, seedSupplements,
} from './data.js';
import { SLOT_DEFAULT_TIME, STARTER_SUPPLEMENTS } from './format.js';
import { pickDisplayDay, supplementSlots } from './model.js';
import { renderLogin, loginErrorText } from './screens/login.js';
import { renderToday } from './screens/today.js';
import { renderSleep } from './screens/sleep.js';
import { renderExercise } from './screens/exercise.js';
import { renderSupplements } from './screens/supplements.js';
import { renderSettings } from './screens/settings.js';
import { renderSupplementsEdit } from './screens/supplements-edit.js';

const screens = {
  today: renderToday,
  sleep: renderSleep,
  exercise: renderExercise,
  supplements: renderSupplements,
  'supplements-edit': renderSupplementsEdit,
  settings: renderSettings,
};

// 하위 화면에서 켜 둘 하단 탭
const TAB_OF = { 'supplements-edit': 'supplements' };

const state = {
  fb: null,
  user: undefined,      // undefined: 로그인 상태 확인 중, null: 로그아웃
  data: null,
  error: null,
  loginError: null,
  busy: false,
  ui: { sleepRange: 'week', sport: 'all', feedback: 'health' },
};

const view = document.getElementById('view');
const tabbar = document.querySelector('.tabbar');

function route() {
  const name = location.hash.slice(1);
  return screens[name] ? name : 'today';
}

function message(text) {
  return `<section class="hero hero-tall"><span class="hero-date">HEALTH</span><span class="hero-msg">${text}</span></section>`;
}

function render() {
  const name = route();
  tabbar.hidden = !state.user;
  tabbar.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === (TAB_OF[name] ?? name)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (state.user === undefined) { view.innerHTML = message('불러오는 중…'); return; }
  if (!state.fb) { view.innerHTML = message('Firebase 설정 전이에요. app/js/firebase-config.js를 채워 주세요.'); return; }
  if (!state.user) {
    setCondition('normal');
    view.innerHTML = renderLogin(state);
    return;
  }
  if (!state.data) { view.innerHTML = message(state.error ?? '불러오는 중…'); return; }

  setCondition(conditionFromScore(pickDisplayDay(state.data)?.score?.total));
  view.innerHTML = screens[name](state)
    + (state.error ? `<p class="toast" role="alert">${state.error}</p>` : '');
}

async function refresh() {
  try {
    state.data = await loadAll(state.fb, state.user.uid);
    state.error = null;
  } catch (e) {
    console.error(e);
    state.error = '데이터를 불러오지 못했어요. 네트워크를 확인해 주세요.';
  }
  render();
}

// 화면을 먼저 바꾸고(낙관적 업데이트) 저장. 실패하면 다시 불러온다
async function save(fn) {
  render();
  try {
    await fn();
    state.error = null;
  } catch (e) {
    console.error(e);
    state.error = '저장하지 못했어요. 다시 시도해 주세요.';
    await refresh();
  }
}

function setSupplement(id, patch) {
  const d = state.data;
  const checkin = (d.checkins[d.today] ??= { date: d.today });
  const sup = (checkin.supplements ??= {});
  const def = d.supplements.find((s) => s.id === id);
  const next = { taken: false, count: def?.countPerDose ?? 1, ...sup[id], ...patch };
  sup[id] = next;
  return saveSupplement(state.fb, state.user.uid, d.today, id, next);
}

// 영양제 목록 항목 수정 (화면 먼저, 저장은 뒤)
function editSupplement(id, patch) {
  const s = state.data.supplements.find((x) => x.id === id);
  if (!s) return;
  Object.assign(s, patch);
  save(() => saveSupplementDef(state.fb, state.user.uid, id, patch));
}

const actions = {
  'sleep-range': (el) => { state.ui.sleepRange = el.dataset.range; render(); },
  sport: (el) => { state.ui.sport = el.dataset.sport; render(); },
  feedback: (el) => { state.ui.feedback = el.dataset.mode; render(); },
  'supp-toggle': (el) => {
    const cur = state.data.checkins[state.data.today]?.supplements?.[el.dataset.id];
    save(() => setSupplement(el.dataset.id, { taken: !cur?.taken }));
  },
  'supp-count': (el) => {
    const { slots } = supplementSlots(state.data);
    const item = slots.flatMap((s) => s.items).find((i) => i.id === el.dataset.id);
    const count = Math.max(0, Math.min(20, item.count + Number(el.dataset.delta)));
    save(() => setSupplement(el.dataset.id, { count }));
  },
  'supp-def-count': (el) => {
    const s = state.data.supplements.find((x) => x.id === el.dataset.id);
    const countPerDose = Math.max(1, Math.min(10, (s.countPerDose ?? 1) + Number(el.dataset.delta)));
    if (countPerDose !== s.countPerDose) editSupplement(s.id, { countPerDose });
  },
  'supp-hide': (el) => {
    const s = state.data.supplements.find((x) => x.id === el.dataset.id);
    if (!window.confirm(`${s.name}을(를) 목록에서 뺄까요? 지난 복용 기록은 남아요.`)) return;
    state.data.supplements = state.data.supplements.filter((x) => x.id !== s.id);
    save(() => saveSupplementDef(state.fb, state.user.uid, s.id, { active: false }));
  },
  'supp-seed': () => {
    const list = STARTER_SUPPLEMENTS.map((s) => ({ ...s }));
    state.data.supplements = list.map((s) => ({ ...s, active: true }));
    save(() => seedSupplements(state.fb, state.user.uid, list));
  },
  logout: () => state.fb.au.signOut(state.fb.auth),
};

const changes = {
  'body-battery': (el) => {
    const raw = el.value.trim();
    const n = raw === '' ? null : Math.round(Number(raw));
    if (n != null && !(n >= 0 && n <= 100)) { el.value = ''; return; }
    const d = state.data;
    const checkin = (d.checkins[d.today] ??= { date: d.today });
    if (n == null) delete checkin.bodyBattery; else checkin.bodyBattery = n;
    save(() => saveBodyBattery(state.fb, state.user.uid, d.today, n));
  },
  'slot-toggle': (el) => {
    const slot = supplementSlots(state.data).slots.find((s) => s.slot === el.dataset.slot);
    const taken = !slot.done;
    save(() => Promise.all(slot.items.map((it) => setSupplement(it.id, { taken }))));
  },
  'supp-edit': (el) => {
    const s = state.data.supplements.find((x) => x.id === el.dataset.id);
    const field = el.dataset.field;
    const value = el.value.trim();
    if (field === 'name') {
      if (!value) { el.value = s.name; return; }
      editSupplement(s.id, { name: value });
    } else if (field === 'slot') {
      // 알림 시각이 이전 시간대 기본값 그대로면 새 시간대 기본값으로 같이 바꾼다
      const patch = { slot: value };
      if (!s.time || s.time === SLOT_DEFAULT_TIME[s.slot]) patch.time = SLOT_DEFAULT_TIME[value];
      editSupplement(s.id, patch);
    } else if (field === 'time') {
      editSupplement(s.id, { time: value || null });
    }
  },
  bedtime: (el) => {
    state.data.settings.bedtime = el.value || null;
    save(() => saveSettings(state.fb, state.user.uid, { bedtime: el.value || null }));
  },
};

view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) actions[el.dataset.action]?.(el);
});

view.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) changes[el.dataset.change]?.(el);
});

view.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);

  if (e.target.dataset.submit === 'supp-add') {
    const name = String(form.get('name')).trim();
    if (!name) return;
    const slot = form.get('slot');
    const list = state.data.supplements;
    const s = {
      id: newSupplementId(state.fb, state.user.uid),
      name,
      slot,
      time: form.get('time') || SLOT_DEFAULT_TIME[slot],
      countPerDose: Math.max(1, Math.min(10, Number(form.get('count')) || 1)),
      order: list.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1,
      ingredients: null,
    };
    list.push({ ...s, active: true });
    const { id, ...fields } = s;
    save(() => saveSupplementDef(state.fb, state.user.uid, id, fields, true));
    return;
  }

  if (e.target.dataset.submit !== 'login') return;
  state.busy = true;
  state.loginError = null;
  render();
  try {
    await state.fb.au.signInWithEmailAndPassword(state.fb.auth, form.get('email'), form.get('password'));
  } catch (err) {
    state.loginError = loginErrorText(err.code);
  }
  state.busy = false;
  render();
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// 앱으로 돌아올 때 날짜가 바뀌었거나 아침 동기화가 끝났을 수 있으니 다시 불러온다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) refresh();
});

render();

initFirebase()
  .then((fb) => {
    state.fb = fb;
    if (!fb) { state.user = null; render(); return; }
    fb.au.onAuthStateChanged(fb.auth, (user) => {
      state.user = user;
      state.data = null;
      render();
      if (user) refresh();
    });
  })
  .catch((e) => {
    console.error(e);
    state.user = null;
    view.innerHTML = message('Firebase에 연결하지 못했어요. 네트워크를 확인해 주세요.');
  });

if ('serviceWorker' in navigator) {
  // 새 버전 서비스 워커가 자리 잡으면 한 번 새로고침 → 배포한 화면이 바로 보이게
  // (처음 설치될 때는 이전 컨트롤러가 없으므로 새로고침하지 않음)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      // 홈 화면 앱은 오래 켜 두기도 하므로, 다시 볼 때마다 새 버전 확인
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch((e) => console.error('SW 등록 실패', e));
}
