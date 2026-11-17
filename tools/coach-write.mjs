// 채팅 코칭 → Firestore 쓰기 도구 (2026-11-17). Claude가 프로젝트 채팅에서 분석할 때마다 실행한다.
// 환경 변수: FIREBASE_SERVICE_ACCOUNT (서비스 계정 JSON 전체), OWNER_UID (Firebase Auth UID)
// 구조: docs/coach-model.md
//
//   node coach-write.mjs put <docId> <file.json>       coach/<docId> 에 병합 저장 (day-…, sess-…, week-…, report-…)
//   node coach-write.mjs replace <docId> <file.json>   coach/<docId> 를 통째로 교체
//   node coach-write.mjs update <date> <file.json>     coach/day-<date>.updates 에 항목 하나 추가 ({time, kind, title, body})
//   node coach-write.mjs get <docId>                   문서 출력
//   node coach-write.mjs list <prefix>                 day / sess / week / report 문서 ID 목록
//   node coach-write.mjs supp <date> <id> [<id>…]      영양제 복용 체크 (checkins/<date>.supplements.<id>)
//   node coach-write.mjs supps                         영양제 목록 (id·이름·시간대)
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
const uid = process.env.OWNER_UID;
if (!sa || !uid) {
  console.error('FIREBASE_SERVICE_ACCOUNT 와 OWNER_UID 환경 변수가 필요해요.');
  process.exit(2);
}
initializeApp({ credential: cert(JSON.parse(sa)) });
const db = getFirestore();
const user = db.collection('users').doc(uid);
const coach = user.collection('coach');
const ID = /^(day|sess|week|report)-[A-Za-z0-9_.-]+$/;
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const checkId = (id) => { if (!ID.test(id)) throw new Error(`문서 ID 형식: day-YYYY-MM-DD / sess-… / week-YYYY-MM-DD / report-… (받은 값: ${id})`); };
const stamp = () => ({ updatedAt: FieldValue.serverTimestamp(), source: 'chat' });

const [cmd, a, b, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'put': checkId(a); await coach.doc(a).set({ ...readJson(b), ...stamp() }, { merge: true }); console.log('saved', a); break;
  case 'replace': checkId(a); await coach.doc(a).set({ ...readJson(b), ...stamp() }); console.log('replaced', a); break;
  case 'update': {
    const item = readJson(b);
    if (!item.time || !item.title) throw new Error('update 항목에는 time·title이 필요해요');
    await coach.doc(`day-${a}`).set({ date: a, updates: FieldValue.arrayUnion(item), ...stamp() }, { merge: true });
    console.log('appended update', a, item.time);
    break;
  }
  case 'get': { const s = await coach.doc(a).get(); console.log(JSON.stringify(s.exists ? s.data() : null, null, 2)); break; }
  case 'list': {
    const snap = await coach.where(FieldPath.documentId(), '>=', `${a}-`).where(FieldPath.documentId(), '<', `${a}.`).get();
    console.log(snap.docs.map((d) => d.id).join('\n'));
    break;
  }
  case 'supps': {
    const snap = await user.collection('supplements').get();
    for (const d of snap.docs) { const s = d.data(); if (s.active !== false) console.log(d.id, s.name, s.slot, s.countPerDose ?? 1); }
    break;
  }
  case 'supp': {
    const ids = [b, ...rest].filter(Boolean);
    const defs = Object.fromEntries((await user.collection('supplements').get()).docs.map((d) => [d.id, d.data()]));
    const patch = {};
    for (const id of ids) {
      if (!defs[id]) throw new Error(`영양제 ID 없음: ${id} (supps 로 확인)`);
      patch[id] = { taken: true, count: defs[id].countPerDose ?? 1, at: FieldValue.serverTimestamp() };
    }
    await user.collection('checkins').doc(a).set({ date: a, supplements: patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log('checked', a, ids.join(' '));
    break;
  }
  default:
    console.error('명령: put | replace | update | get | list | supp | supps');
    process.exit(2);
}
