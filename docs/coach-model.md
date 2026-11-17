# 채팅 코칭 기록 (Firestore `users/{uid}/coach/`) — 2026-11-17

오늘·수면·운동·리포트 화면은 Claude 프로젝트 채팅의 코칭 내용을 그대로 보여 준다. 쓰는 쪽은 채팅의 Claude(`tools/coach-write.mjs`, Admin SDK), 앱은 읽기만 한다.
기존 `coach/{docId}` 규칙을 그대로 쓰려고 하위 컬렉션 대신 **문서 ID 접두어**로 나눈다 (규칙 재게시 불필요).

| 문서 ID | 내용 |
|---|---|
| `day-YYYY-MM-DD` | 하루: 판정·아침 브리핑·수면·하루 업데이트 |
| `sess-YYYY-MM-DD-<종목>[-n]` | 운동 세션 하나: 운동 전 가이드·기록·운동 후 분석 |
| `week-<월요일>` | 주간 계획 대비 실행·부위별 세트·종목 진전 |
| `report-weekly-<월요일>` / `report-monthly-YYYY-MM` | 주간·월간 리포트 요약 |

기존 `coach/exercise`, `coach/day`(Gemini)는 그대로 둔다. 영양제는 기존 `supplements`·`checkins` 사용.

## day-
```js
{ date,
  sleep: { durationMin, score, stages: { deep, light, rem, awake } /*분*/, rhr, hrv, hrvStatus, bodyBattery /*'+40 → 45'*/, readiness },
  verdict: { level: 'green'|'yellow'|'red', intensity, summary },
  brief: { time, sleep, life, workout, finish, caution },
  sleepAnalysis: { headline, last, trend, recovery, debt, pattern, exercise, bedtime /*'23:45'*/, tonight, alert /*반드시 개선이 필요할 때만*/ },
  updates: [ { time: 'HH:MM', kind: 'checkin'|'pre'|'post'|'guide'|'note', title, body } ] }
```
## sess-
```js
{ date, time, sortKey: 'YYYY-MM-DDTHH:MM', sport: 'run'|'trail'|'strength'|'swim', title, durationMin, distanceKm, distanceM,
  summary, metrics: { '거리': '7.61km', … }, splits: ['5:31', …], sets: [{ name, sets: '45×10, 45×10' }], pre, analysis, next }
```
## week-
```js
{ monday, focus, plan: [{ day: '월', plan, status: 'done'|'partial'|'missed'|'planned'|'rest', actual }],
  muscleSets: { 등: 9, … }, lifts: [{ name, best, e1rm, next }] }
```
## report-
```js
{ kind: 'weekly'|'monthly', period, title, summary, sections: [{ title, body }], focus: [] }
```
문자열은 줄바꿈(\n) 그대로 표시된다.
