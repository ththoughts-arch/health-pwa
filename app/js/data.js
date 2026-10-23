// Firestore 읽기·쓰기 (구조: docs/data-model.md)
import { addDays } from './score.js';
import { localToday } from './format.js';

export async function loadAll(fb, uid) {
  const { doc, getDoc, collection, query, where, orderBy, getDocs } = fb.fs;
  const user = doc(fb.db, 'users', uid);
  const today = localToday();
  const since = (name, days) => getDocs(query(
    collection(user, name), where('date', '>=', addDays(today, -days + 1)), orderBy('date'),
  ));

  const [profile, days, activities, checkins, supplements] = await Promise.all([
    getDoc(user),
    since('days', 31),
    since('activities', 14),
    since('checkins', 28),
    getDocs(collection(user, 'supplements')),
  ]);

  const byDate = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  return {
    today,
    settings: profile.data()?.settings ?? {},
    days: byDate(days),
    activities: activities.docs.map((d) => ({ id: d.id, ...d.data() })),
    checkins: byDate(checkins),
    supplements: supplements.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.active !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };
}

function checkinRef(fb, uid, date) {
  return fb.fs.doc(fb.db, 'users', uid, 'checkins', date);
}

// 병합 저장 → 다른 항목을 덮어쓰지 않음
export async function saveBodyBattery(fb, uid, date, value) {
  const { setDoc, serverTimestamp, deleteField } = fb.fs;
  const patch = value == null
    ? { bodyBattery: deleteField(), bodyBatteryAt: deleteField() }
    : { bodyBattery: value, bodyBatteryAt: serverTimestamp() };
  await setDoc(checkinRef(fb, uid, date), { date, ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveSupplement(fb, uid, date, id, { taken, count }) {
  const { setDoc, serverTimestamp } = fb.fs;
  const entry = taken ? { taken, count, at: serverTimestamp() } : { taken, count };
  await setDoc(checkinRef(fb, uid, date),
    { date, supplements: { [id]: entry }, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveSettings(fb, uid, patch) {
  const { doc, setDoc } = fb.fs;
  await setDoc(doc(fb.db, 'users', uid), { settings: patch }, { merge: true });
}
