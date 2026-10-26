// 동기화 버튼: intervals.icu → 점수 계산 → Firestore (days·activities). ai 필드는 유지(merge)
import { DEFAULT_WEIGHTS } from './score.js';
import { fetchAndSummarize } from './intervals.js';

export async function syncNow(fb, uid, { keys, settings, today }) {
  const { doc, collection, writeBatch, serverTimestamp } = fb.fs;
  const { activities, days } = await fetchAndSummarize({
    apiKey: keys.intervalsApiKey,
    athleteId: keys.intervalsAthleteId,
    today,
    weights: settings.scoreWeights ?? DEFAULT_WEIGHTS,
  });

  const user = doc(fb.db, 'users', uid);
  const batch = writeBatch(fb.db);
  const now = serverTimestamp();
  for (const { id, ...a } of activities) {
    batch.set(doc(collection(user, 'activities'), id), { ...a, updatedAt: now }, { merge: true });
  }
  for (const day of days) {
    batch.set(doc(collection(user, 'days'), day.date), { ...day, updatedAt: now }, { merge: true });
  }
  batch.set(user, { lastSyncAt: now }, { merge: true });
  await batch.commit();
  return { activities: activities.length, days: days.length };
}
