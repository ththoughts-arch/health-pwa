// 러닝 상세 분석용 계산 (AI 아님): intervals.icu 스트림·랩 → km 스플릿, 심박 드리프트, 디커플링
const r0 = (x) => (x == null ? null : Math.round(x));
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const MAX_SPLITS = 60;
const MAX_LAPS = 30;

// streams: [{ type: 'time' | 'distance' | 'heartrate' | 'cadence' | 'altitude', data: number[] }]
export function summarizeStreams(streams) {
  if (!Array.isArray(streams)) return null;
  const get = (t) => streams.find((s) => s.type === t)?.data ?? null;
  const time = get('time');
  const dist = get('distance');
  if (!time || !dist || time.length < 10 || time.length !== dist.length) return null;
  const hr = get('heartrate');
  const cad = get('cadence');
  const alt = get('altitude');

  // 구간 [a, b] 요약
  const seg = (a, b) => {
    const avg = (arr) => {
      if (!arr) return null;
      let s = 0;
      let n = 0;
      for (let i = a; i <= b; i++) if (arr[i] > 0) { s += arr[i]; n++; }
      return n ? s / n : null;
    };
    let gain = 0;
    if (alt) for (let i = a + 1; i <= b; i++) { const d = alt[i] - alt[i - 1]; if (d > 0) gain += d; }
    return { secs: time[b] - time[a], meters: dist[b] - dist[a], hr: avg(hr), cad: avg(cad), gain };
  };
  const pace = (s) => (s.meters > 0 ? Math.round((s.secs / s.meters) * 1000) : null);

  const splits = [];
  let start = 0;
  let nextKm = 1000;
  const last = dist.length - 1;
  for (let i = 1; i <= last && splits.length < MAX_SPLITS; i++) {
    if (dist[i] >= nextKm) {
      const s = seg(start, i);
      splits.push({ km: splits.length + 1, paceSecPerKm: pace(s), avgHr: r0(s.hr), cadence: r0(s.cad), elevGainM: r0(s.gain) });
      start = i;
      nextKm += 1000;
    }
  }
  const tail = dist[last] - dist[start];
  if (tail >= 200 && splits.length < MAX_SPLITS) {
    const s = seg(start, last);
    splits.push({ km: r1(dist[last] / 1000), partialM: r0(tail), paceSecPerKm: pace(s), avgHr: r0(s.hr), cadence: r0(s.cad), elevGainM: r0(s.gain) });
  }

  // 전반·후반 (시간 기준 절반): 같은 심박에서 속도가 떨어지면 디커플링 +
  let mid = 0;
  while (mid < last && time[mid] < time[last] / 2) mid++;
  const h1 = seg(0, mid);
  const h2 = seg(mid, last);
  const ef = (s) => (s.hr && s.secs > 0 ? s.meters / s.secs / s.hr : null);
  const ef1 = ef(h1);
  const ef2 = ef(h2);

  return {
    splits,
    firstHalf: { paceSecPerKm: pace(h1), avgHr: r0(h1.hr) },
    secondHalf: { paceSecPerKm: pace(h2), avgHr: r0(h2.hr) },
    decouplingPct: ef1 && ef2 ? r1(((ef1 - ef2) / ef1) * 100) : null,
    hrDriftBpm: h1.hr && h2.hr ? r0(h2.hr - h1.hr) : null,
  };
}

// intervals.icu icu_intervals → 랩 요약
export function summarizeLaps(intervals) {
  if (!Array.isArray(intervals)) return [];
  return intervals.slice(0, MAX_LAPS).map((l) => ({
    type: l.type ?? null,
    label: l.label ?? null,
    distanceM: r0(l.distance),
    movingSecs: r0(l.moving_time ?? l.elapsed_time),
    paceSecPerKm: l.average_speed > 0 ? Math.round(1000 / l.average_speed) : null,
    avgHr: r0(l.average_heartrate),
    maxHr: r0(l.max_heartrate),
    cadence: r0(l.average_cadence),
    elevGainM: r0(l.total_elevation_gain),
    zone: l.zone ?? null,
  }));
}

// 초/km → '5:32'
export function paceText(secPerKm) {
  if (!secPerKm) return '—';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
