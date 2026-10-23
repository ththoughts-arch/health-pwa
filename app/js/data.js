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

  const [profile, days, activities, checkins, supplements, strength] = await Promise.all([
    getDoc(user),
    since('days', 31),
    since('activities', 14),
    since('checkins', 28),
    getDocs(collection(user, 'supplements')),
    since('strength', 28),
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
    strength: sortStrength(strength.docs.map((d) => ({ id: d.id, ...d.data() }))),
  };
}

// 헬스 기록: 최근 날짜 먼저
export function sortStrength(list) {
  return list.sort((a, b) => b.date.localeCompare(a.date));
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

// 영양제 목록 (supplements/{id}). 삭제 대신 active:false → 지난 복용 기록 유지
function supplementsCol(fb, uid) {
  return fb.fs.collection(fb.db, 'users', uid, 'supplements');
}

export function newSupplementId(fb, uid) {
  return fb.fs.doc(supplementsCol(fb, uid)).id;
}

export async function saveSupplementDef(fb, uid, id, fields, isNew = false) {
  const { doc, setDoc, serverTimestamp } = fb.fs;
  const data = isNew ? { ...fields, active: true, createdAt: serverTimestamp() } : fields;
  await setDoc(doc(supplementsCol(fb, uid), id), data, { merge: true });
}

export async function seedSupplements(fb, uid, list) {
  const { doc, writeBatch, serverTimestamp } = fb.fs;
  const batch = writeBatch(fb.db);
  for (const { id, ...s } of list) {
    batch.set(doc(supplementsCol(fb, uid), id), { ...s, active: true, createdAt: serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}

// 헬스 수동 기록 (strength/{id})
function strengthCol(fb, uid) {
  return fb.fs.collection(fb.db, 'users', uid, 'strength');
}

export function newStrengthId(fb, uid) {
  return fb.fs.doc(strengthCol(fb, uid)).id;
}

export async function saveStrength(fb, uid, id, entry, isNew) {
  const { doc, setDoc, serverTimestamp } = fb.fs;
  const data = isNew ? { ...entry, createdAt: serverTimestamp() } : { ...entry, updatedAt: serverTimestamp() };
  await setDoc(doc(strengthCol(fb, uid), id), data, { merge: true });
}

export async function deleteStrength(fb, uid, id) {
  const { doc, deleteDoc } = fb.fs;
  await deleteDoc(doc(strengthCol(fb, uid), id));
}

export async function saveSettings(fb, uid, patch) {
  const { doc, setDoc } = fb.fs;
  await setDoc(doc(fb.db, 'users', uid), { settings: patch }, { merge: true });
}
