// Node 스크립트용 (probe-intervals.mjs, sync.mjs)
import { intervalsClient as client } from '../../app/js/intervals.js';

// GitHub Secrets 환경변수로 클라이언트 생성
export function intervalsClient(env = process.env) {
  const { INTERVALS_API_KEY: apiKey, INTERVALS_ATHLETE_ID: athleteId } = env;
  if (!apiKey || !athleteId) {
    throw new Error('INTERVALS_API_KEY / INTERVALS_ATHLETE_ID 가 설정되지 않았습니다 (GitHub Secrets 확인).');
  }
  return client({ apiKey, athleteId });
}

// 한국 시간 기준 오늘 'YYYY-MM-DD'
export function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
