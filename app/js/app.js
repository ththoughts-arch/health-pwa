import { setCondition, conditionFromScore } from './theme.js';
import { initFirebase } from './firebase.js';
import {
  deleteStrength, loadAll, newStrengthId, newSupplementId, saveBodyBattery, saveKeys, saveSettings, saveStrength,
  saveSupplement, saveSupplementDef, seedSupplements, sortStrength,
} from './data.js';
import { syncNow } from './sync.js';
import { diagnoseGemini, runCoaching } from './ai.js';
import { IntervalsError } from './intervals.js';
import { SLOT_DEFAULT_TIME, STARTER_SUPPLEMENTS } from './format.js';
import { pickDisplayDay, supplementSlots } from './model.js';
import { renderLogin, loginErrorText } from './screens/login.js';
import { renderToday } from './screens/today.js';
import { renderSleep } from './screens/sleep.js';
import { renderExercise } from './screens/exercise.js';
import { renderSupplements } from './screens/supplements.js';
import { renderSettings } from './screens/settings.js';
import { renderSupplementsEdit } from './screens/supplements-edit.js';
import { renderStrength } from './screens/strength.js';

const screens = {
  today: renderToday,
  sleep: renderSleep,
  exercise: renderExercise,
  supplements: renderSupplements,
  'supplements-edit': renderSupplementsEdit,
  strength: renderStrength,
  settings: renderSettings,
};

// 하위 화면에서 켜 둘 하단 탭
const TAB_OF = { 'supplements-edit': 'supplements', strength: 'exercise' };

const state = {
  fb: null,
  user: undefined,      // undefined: 로그인 상태 확인 중, null: 로그아웃
  data: null,
  error: null,
  loginError: null,
  busy: false,
  sync: { busy: false, step: null, message: null },
  ui: { sleepRange: 'week', sport: 'all', feedback: 'health' },
};

const view = document.getElementById('view');
const tabbar = document.querySelector('.tabbar');

// '#strength=ID' → { name: 'strength', param: 'ID' }
function route() {
  const [name, param] = location.hash.slice(1).split('=');
  return screens[name] ? { name, param: param ? decodeURIComponent(param) : null } : { name: 'today', param: null };
}

const emptyExercise = () => ({ name: '', weightKg: null, sets: null, reps: null });

// 헬스 기록 화면의 입력 중 상태. 같은 기록(또는 새 기록)이면 유지
function ensureStrengthDraft(param) {
  const key = param ?? 'new';
  if (state.ui.strengthDraft?.key === key) return;
  const log = param && state.data.strength.find((s) => s.id === param);
  state.ui.strengthDraft = log
    ? { key, id: log.id, date: log.date, note: log.note ?? '', exercises: log.exercises.map((e) => ({ ...e })) }
    : { key, id: null, date: state.data.today, note: '', exercises: [emptyExercise()] };
}

function message(text) {
  return `<section class="hero hero-tall"><span class="hero-date">HEALTH</span><span class="hero-msg">${text}</span></section>`;
}

function render() {
  const { name, param } = route();
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

  if (name === 'strength') ensureStrengthDraft(param);
  setCondition(conditionFromScore(pickDisplayDay(state.data)?.score?.total));
  const toast = state.error ?? state.sync.message;
  view.innerHTML = screens[name](state)
    + (toast ? `<p class="toast" role="status">${toast}</p>` : '');
}

// 동기화 버튼: intervals.icu → 점수 → 저장 → (새 데이터면) AI 코칭
async function runSync() {
  if (state.sync.busy) return;
  const { keys } = state.data;
  if (!keys.intervalsApiKey || !keys.intervalsAthleteId) {
    window.alert('설정에서 intervals.icu API 키와 Athlete ID를 먼저 넣어 주세요.');
    location.hash = '#settings';
    return;
  }
  state.sync = { busy: true, step: '데이터 가져오는 중…', message: null };
  render();
  let message;
  try {
    await syncNow(state.fb, state.user.uid, { keys, settings: state.data.settings, today: state.data.today });
    state.data = await loadAll(state.fb, state.user.uid);
    message = '동기화했어요';
    if (keys.geminiApiKey) {
      try {
        const { done } = await runCoaching(state.fb, state.user.uid, state.data, (step) => {
          state.sync.step = step;
          render();
        });
        if (done.length) message += ` · AI ${done.map((d) => (d === 'sleep' ? '수면 분석' : '운동 코칭')).join('·')} 새로 받음`;
      } catch (e) {
        console.error(e);
        message += ` · AI 분석 실패: ${e.message}`;
      }
    } else {
      message += ' · AI 분석은 설정에서 Gemini 키를 넣으면 시작돼요';
    }
  } catch (e) {
    console.error(e);
    message = e instanceof IntervalsError ? e.message
      : e.code === 'permission-denied' ? 'Firebase 규칙을 다시 게시해야 해요 (설정 참고)'
      : '동기화하지 못했어요. 네트워크를 확인해 주세요.';
  }
  state.sync = { busy: false, step: null, message };
  render();
  // 실패 문구는 원인을 읽을 수 있게 더 오래 둔다
  setTimeout(() => {
    if (state.sync.message === message) { state.sync.message = null; render(); }
  }, message.includes('실패') || message.includes('못했') ? 12000 : 5000);
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
  'strength-add-row': () => {
    state.ui.strengthDraft.exercises.push(emptyExercise());
    render();
    const names = view.querySelectorAll('.edit-name');
    names[names.length - 1]?.focus();
  },
  'strength-remove': (el) => {
    state.ui.strengthDraft.exercises.splice(Number(el.dataset.i), 1);
    render();
  },
  'strength-copy-last': () => {
    const d = state.ui.strengthDraft;
    const last = state.data.strength.find((s) => s.id !== d.id);
    if (last) d.exercises = last.exercises.map((e) => ({ ...e }));
    render();
  },
  'strength-delete': () => {
    const d = state.ui.strengthDraft;
    if (!window.confirm('이 헬스 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
    state.data.strength = state.data.strength.filter((s) => s.id !== d.id);
    state.ui.strengthDraft = null;
    location.hash = '#exercise';
    save(() => deleteStrength(state.fb, state.user.uid, d.id));
  },
  sync: () => runSync(),
  'ai-test': async () => {
    state.ui.aiTest = { busy: true };
    render();
    let lines;
    try {
      lines = await diagnoseGemini(state.data.keys.geminiApiKey);
    } catch (e) {
      lines = [`테스트 실패: ${e.message}`];
    }
    state.ui.aiTest = { busy: false, lines };
    render();
  },
  logout: () => state.fb.au.signOut(state.fb.auth),
};

// 다시 그리지 않고 입력 중 상태만 갱신 (포커스 유지)
const inputs = {
  'strength-date': (el) => { state.ui.strengthDraft.date = el.value; },
  'strength-note': (el) => { state.ui.strengthDraft.note = el.value; },
  'strength-ex': (el) => {
    const ex = state.ui.strengthDraft.exercises[Number(el.dataset.i)];
    const field = el.dataset.field;
    ex[field] = field === 'name' ? el.value : el.value === '' ? null : Number(el.value);
  },
};

function submitStrength() {
  const d = state.ui.strengthDraft;
  const num = (v, int) => {
    if (v == null || !Number.isFinite(v) || v <= 0) return null;
    return int ? Math.round(v) : Math.round(v * 2) / 2;
  };
  const exercises = d.exercises
    .map((e) => ({ name: e.name.trim(), weightKg: num(e.weightKg, false), sets: num(e.sets, true), reps: num(e.reps, true) }))
    .filter((e) => e.name);
  if (!exercises.length) { window.alert('운동 이름을 하나 이상 적어 주세요.'); return; }
  if (!d.date || d.date > state.data.today) { window.alert('날짜를 확인해 주세요.'); return; }

  // 같은 날 가민 헬스 활동이 있으면 연결 (운동 탭에서 한 줄로 표시)
  const act = state.data.activities.find((a) => a.date === d.date && a.sport === 'strength');
  const entry = { date: d.date, exercises, note: d.note.trim(), activityId: act?.id ?? null };
  const isNew = !d.id;
  const id = d.id ?? newStrengthId(state.fb, state.user.uid);

  state.data.strength = sortStrength([...state.data.strength.filter((s) => s.id !== id), { id, ...entry }]);
  state.ui.strengthDraft = null;
  location.hash = '#exercise';
  save(() => saveStrength(state.fb, state.user.uid, id, entry, isNew));
}

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
  key: (el) => {
    const value = el.value.trim();
    if (!value) return;
    const field = el.dataset.field;
    state.data.keys[field] = value;
    save(() => saveKeys(state.fb, state.user.uid, { [field]: value }));
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

view.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) inputs[el.dataset.input]?.(el);
});

view.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);

  if (e.target.dataset.submit === 'strength-save') {
    submitStrength();
    return;
  }

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
  if (document.visibilityState === 'visible' && state.user && !state.sync.busy) refresh();
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
