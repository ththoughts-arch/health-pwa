// 앱 파일을 바꾸면 버전을 올린다 → 이전 캐시 삭제
const VERSION = 'v11';
const CACHE = `health-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/theme.js',
  'js/score.js',
  'js/format.js',
  'js/model.js',
  'js/data.js',
  'js/screens/login.js',
  'js/screens/today.js',
  'js/screens/sleep.js',
  'js/screens/exercise.js',
  'js/screens/supplements.js',
  'js/screens/settings.js',
  'js/screens/supplements-edit.js',
  'js/screens/strength.js',
  'js/screens/common.js',
  'js/intervals.js',
  'js/sync.js',
  'js/ai.js',
  'js/firebase.js',
  'js/firebase-config.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

// GitHub Pages는 max-age=600을 주므로, 브라우저 HTTP 캐시를 건너뛰고 서버에서 새로 받는다
// (안 그러면 배포 후 최대 10분간 옛 파일이 새 캐시에 들어간다)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 같은 출처 파일: 네트워크 우선(HTTP 캐시는 재검증), 실패하면 캐시(오프라인).
// Firebase·폰트 등 외부 요청은 건드리지 않는다.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(new Request(req.url, { cache: 'no-cache' }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});

// 9단계(웹 푸시)에서 push / notificationclick 핸들러 추가
