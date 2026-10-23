// intervals.icu API (Basic Auth: 사용자명 API_KEY, 비밀번호 = 개인 API 키)
const API = 'https://intervals.icu/api/v1';

export function intervalsClient(env = process.env) {
  const { INTERVALS_API_KEY: key, INTERVALS_ATHLETE_ID: athlete } = env;
  if (!key || !athlete) {
    throw new Error('INTERVALS_API_KEY / INTERVALS_ATHLETE_ID 가 설정되지 않았습니다 (GitHub Secrets 확인).');
  }
  const auth = 'Basic ' + Buffer.from(`API_KEY:${key}`).toString('base64');

  return async function get(path, params) {
    const url = `${API}/athlete/${athlete}/${path}?${new URLSearchParams(params)}`;
    const res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (!res.ok) {
      // 응답 본문에 개인 데이터가 섞일 수 있으니 상태 코드만 출력
      const hint = res.status === 401 || res.status === 403 ? ' — API 키 또는 Athlete ID 확인' : '';
      throw new Error(`${path}: HTTP ${res.status}${hint}`);
    }
    return res.json();
  };
}

// 한국 시간 기준 오늘 'YYYY-MM-DD'
export function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
