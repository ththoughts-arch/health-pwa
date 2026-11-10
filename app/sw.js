// 앱 파일을 바꾸면 버전을 올린다 → 이전 캐시 삭제
const VERSION = 'v21';
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
  'js/strength.js',
  'js/screens/common.js',
  'js/intervals.js',
  'js/sync.js',
  'js/ai.js',
  'js/run.js',
  'js/screens/run.js',
  'js/screens/memo.js',
  'js/firebase.js',
  'js/firebase-config.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

// 버전이 붙은 외부 라이브러리·폰트 (내용이 바뀌지 않음) → 앱 버전과 무관하게 계속 보관
const VENDOR = 'health-vendor-1';
const isVendor = (url) =>
  (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
  || url.hostname === 'fonts.gstatic.com'
  || url.hostname === 'fonts.googleapis.com';

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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== VENDOR).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: cacheName === CACHE });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// 앱 파일: 기기에 저장된 것을 바로 쓴다(빠른 실행). 새 버전은 sw.js가 바뀌면 설치 때 새로 받고
// 앱이 한 번 새로고침해서 적용된다(app.js controllerchange). Firebase 데이터·API 요청은 건드리지 않는다.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      cacheFirst(CACHE, req).catch(() => caches.match('index.html'))
    );
  } else if (isVendor(url)) {
    event.respondWith(cacheFirst(VENDOR, req));
  }
});

// 9단계(웹 푸시)에서 push / notificationclick 핸들러 추가
