# 데이터 저장 구조 (Firestore)

3단계 설계. 필드 근거는 CLAUDE.md 4장 "intervals.icu 실제 응답".

## 원칙

- 모든 데이터는 `users/{uid}/` 아래. 개인용이지만 이 구조 그대로 다중 사용자 확장 가능.
- **쓰는 주체별로 문서를 나눈다.** GitHub Actions(자동 수집·점수·AI)가 쓰는 문서와 앱(사용자 입력)이 쓰는 문서를 섞지 않는다 → 서로 덮어쓰지 않고, 보안 규칙으로 앱이 점수를 고칠 수 없게 막을 수 있다.
- 날짜 문서 ID는 **한국 시간 기준 `YYYY-MM-DD`** (intervals.icu 웰니스 `id`와 같은 형식). 정렬·범위 조회가 문자열 비교로 된다.
- 시각은 Firestore `Timestamp`. 시:분 설정값은 `"HH:MM"` 문자열.
- 무료 한도(읽기 5만/일, 쓰기 2만/일, 1GB)에 비해 사용량이 아주 작다. 홈 화면 1회 ≈ 10회 읽기, 30일 그래프 ≈ 30회 읽기.

## 전체 구조

```
users/{uid}                         프로필·설정            앱 쓰기
  ├─ days/{YYYY-MM-DD}              웰니스·점수·AI 분석     Actions 쓰기 / 앱 읽기만
  ├─ activities/{intervalsId}       운동 기록(가민)         Actions 쓰기 / 앱 읽기만
  ├─ checkins/{YYYY-MM-DD}          바디 배터리·영양제 복용  앱 쓰기
  ├─ supplements/{supplementId}     영양제 목록             앱 쓰기
  ├─ strength/{autoId}              헬스 수동 기록           앱 쓰기
  └─ pushSubscriptions/{hash}       웹 푸시 구독 (9단계)     앱 쓰기
```

## users/{uid} — 프로필·설정

```js
{
  settings: {
    timezone: 'Asia/Seoul',
    bedtime: '23:30',          // 평소 취침 시각 (직접 입력). 저녁 푸시는 이 1시간 전
    zone2MaxHr: 140,           // 강도 분포 '쉬움' 상한
    feedbackMode: 'health',    // 운동 피드백 기본 탭: 'health' | 'coach'
  },
  createdAt: Timestamp,
}
```

## days/{date} — 하루 요약 (Actions가 매일 아침 기록)

```js
{
  date: '2026-10-24',

  // intervals.icu 웰니스 원본 중 쓰는 값만 (없으면 null)
  wellness: {
    sleepSecs: 25920, sleepScore: 81, sleepQuality: 2,
    hrv: 52, restingHR: 51,
    steps: 8123, atl: 42.1, ctl: 38.5, rampRate: 1.2,
    vo2max: null, weight: null,
  },

  // 점수 계산 시점의 내 기준값 (그날 점수를 나중에 다시 설명할 수 있게 함께 저장)
  baseline: {
    days: 23, ready: true,     // 기준값에 쓰인 날 수 (14 미만이면 수집 중)
    hrv30: 55.2, restingHR30: 49.8,
    sleepTargetSecs: 26400,    // 내 적정 수면 시간
    load7: 310, load28avg: 260,// 최근 7일 부하 / 지난 4주 주평균
    loadRatio: 1.19, consecutiveHigh: false,
  },

  status: 'ok',                // 'collecting' 기준값 수집 중 | 'missing' 오늘 데이터 없음 | 'ok'

  // 컨디션 점수 (app/js/score.js). status가 'ok'가 아니면 null
  score: {
    total: 72, sleep: 30, recovery: 27, load: 15,
    band: 'normal',            // 'good' | 'normal' | 'low' → 앱 테마
    weights: { sleep: 40, recovery: 40, load: 20 },  // 10단계 보정 후 바뀔 수 있음
    formulaVersion: 1,
    detail: { sleepDuration: 0.8, sleepQuality: 0.7, hrv: 0.6, restingHR: 0.75, load: 0.75 },  // 항목별 0~1
  },

  // 경고 (정해진 규칙으로 감지, 문장은 AI)
  warnings: [ { code: 'rhr_up_hrv_down', days: 3 } ],

  // Gemini 결과 (8단계)
  ai: {
    headline: '잠은 충분했지만 회복이 덜 됐어요…',
    sleep: { today: '…', pattern: '…', caution: '…' },
    exercise: { health: '…', coach: '…' },
    model: 'gemini-…', createdAt: Timestamp,
  },

  updatedAt: Timestamp,
}
```

- 바디 배터리가 나중에 API로 들어오면 `wellness.bodyBattery`에 넣고 `checkins`의 수동 값보다 우선한다.

## activities/{intervalsId} — 운동 (Actions)

intervals.icu 활동 `id`를 문서 ID로 → 다시 수집해도 중복 없이 덮어씀.

```js
{
  date: '2026-10-23',          // start_date_local 의 날짜
  startLocal: '2026-10-23T07:10:00',
  sport: 'run',                // 'run' | 'trail' | 'swim' | 'strength' | 'other'
  rawType: 'Run',              // intervals.icu type 원본
  movingSecs: 2710, elapsedSecs: 2900, distanceM: 6020,
  trainingLoad: 48, trimp: 61,
  avgHr: 138, maxHr: 156,
  hrZones: [ ... ],            // icu_hr_zones (존 경계 bpm)
  hrZoneSecs: [ ... ],         // icu_hr_zone_times (존별 초)
  pace: 2.22,                  // m/s
  elevationGainM: 35,          // 러닝·트레일
  poolLengthM: 25, lengths: 40,// 수영
  feel: 2, rpe: 4,
  updatedAt: Timestamp,
}
```

- 활동 `name`·`description`은 저장하지 않는다(개인 메모가 들어갈 수 있고 분석에 필요 없음).
- 종목 매핑: `Run`→run, `TrailRun`→trail, `Swim`/`OpenWaterSwim`→swim, `WeightTraining`→strength. 트레일·헬스는 실제 기록이 생기면 type 이름 확인.

## checkins/{date} — 그날 직접 입력한 것 (앱)

하루에 문서 하나 → 홈 화면은 이 문서 1개만 읽으면 된다.

```js
{
  date: '2026-10-24',
  bodyBattery: 64,             // 기상 직후 값, 미입력이면 필드 없음
  bodyBatteryAt: Timestamp,
  supplements: {
    // supplementId → 복용 기록
    omega3:  { taken: true,  count: 1, at: Timestamp },
    magnesium: { taken: false, count: 0 },
  },
  updatedAt: Timestamp,
}
```

- 체크할 때마다 `supplements.{id}` 필드만 업데이트(merge) → 다른 항목을 덮어쓰지 않음.
- 기본 `count`는 영양제 목록의 `countPerDose`, 사용자가 조절 가능.

## supplements/{supplementId} — 영양제 목록 (앱)

```js
{
  name: '마그네슘',
  countPerDose: 1,             // 1회 알 수
  slot: 'bedtime',             // 'morning' | 'lunch' | 'evening' | 'bedtime'
  time: '23:00',               // 복용 알림 시각
  order: 6,
  active: true,                // 삭제 대신 false → 과거 기록 유지
  ingredients: null,           // 11단계 성분표 인식 결과
  createdAt: Timestamp,
}
```

- 이름을 바꿔도 과거 `checkins`는 ID로 연결되므로 그대로 유지된다.

## strength/{autoId} — 헬스 수동 기록 (앱)

```js
{
  date: '2026-10-24',
  activityId: null,            // 같은 날 가민 'strength' 활동이 있으면 연결
  exercises: [
    { name: '스쿼트', weightKg: 60, sets: 3, reps: 10 },
  ],
  note: '',
  createdAt: Timestamp,
}
```

## pushSubscriptions/{hash} — 웹 푸시 (9단계)

```js
{ endpoint: '…', keys: { p256dh: '…', auth: '…' }, userAgent: '…', createdAt: Timestamp }
```

문서 ID는 endpoint의 해시 → 같은 기기 재구독 시 중복 없음.

## 쓰는 주체와 권한

| 컬렉션 | 앱(로그인한 본인) | GitHub Actions |
|---|---|---|
| `users/{uid}` 문서 | 읽기·쓰기 | 읽기 |
| `days`, `activities` | **읽기만** | 쓰기 (Admin SDK) |
| `checkins`, `supplements`, `strength`, `pushSubscriptions` | 읽기·쓰기 | 읽기 |

Actions는 서비스 계정(Admin SDK)으로 접근하므로 보안 규칙을 거치지 않는다. 필요한 Secrets(4단계 이후 수집 스크립트에서 사용):
- `FIREBASE_SERVICE_ACCOUNT` — 서비스 계정 키 JSON 전체
- `OWNER_UID` — Firebase Authentication 사용자 UID

## Gemini로 보내는 데이터 (8단계 참고)

`days.wellness`·`score`·`baseline`, `activities`의 수치, 영양제는 **종류 이름과 복용 여부만**. 활동 이름·메모·이메일·UID 등은 보내지 않는다.
