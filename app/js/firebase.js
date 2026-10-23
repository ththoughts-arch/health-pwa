import { firebaseConfig } from './firebase-config.js';

// 빌드 없이 쓰기 위해 gstatic CDN의 모듈 SDK를 쓴다.
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

let cached = null;

// 설정이 비어 있으면 null. fs/au는 SDK 모듈 (doc, getDocs, signInWithEmailAndPassword 등)
export async function initFirebase() {
  if (!firebaseConfig.apiKey) return null;
  if (cached) return cached;
  const [{ initializeApp }, au, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  cached = { app, auth: au.getAuth(app), db: fs.getFirestore(app), au, fs };
  return cached;
}
