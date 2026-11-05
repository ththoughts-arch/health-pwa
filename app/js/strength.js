// 헬스 기록: 운동마다 세트별 무게·횟수 (setList). DOM을 쓰지 않아 테스트 가능
// exercise = { name, setList: [{ weightKg, reps, warmup }] }
// 옛 기록은 { name, weightKg, sets, reps } 형식 → setsOf()가 세트 목록으로 펼친다

const EMPTY_BAR_KG = 20;   // '빈바'

export const emptySet = () => ({ weightKg: null, reps: null, warmup: false });
export const emptyExercise = () => ({ name: '', setList: [emptySet()] });

export function setsOf(e) {
  if (Array.isArray(e.setList)) return e.setList;
  const n = Math.max(1, e.sets ?? 1);
  return Array.from({ length: n }, () => ({ weightKg: e.weightKg ?? null, reps: e.reps ?? null, warmup: false }));
}

// 운동 한 줄 요약. 본세트가 모두 같으면 '스쿼트 60kg 3×10', 다르면 '평벤치 프레스 최고 50kg · 3세트'
export function exerciseSummary(e) {
  const all = setsOf(e);
  const work = all.some((s) => !s.warmup) ? all.filter((s) => !s.warmup) : all;
  const same = work.every((s) => s.weightKg === work[0].weightKg && s.reps === work[0].reps);
  if (same) {
    const kg = work[0].weightKg ? ` ${work[0].weightKg}kg` : '';
    const sr = work[0].reps ? ` ${work.length}×${work[0].reps}` : ` ${work.length}세트`;
    return `${e.name}${kg}${sr}`;
  }
  const top = Math.max(...work.map((s) => s.weightKg ?? 0));
  return `${e.name}${top ? ` 최고 ${top}kg ·` : ''} ${work.length}세트`;
}

const WEIGHT = '(빈바|맨몸|\\d+(?:\\.\\d+)?)\\s*(?:kg|킬로)?';
const REPS = '(\\d+)\\s*(?:개|회|번|reps?)?';
// 무게와 횟수 사이에 구분자나 공백이 꼭 있어야 한다 ('50' 한 줄을 5kg 0회로 읽지 않게)
const SET_LINE = new RegExp(`^${WEIGHT}(?:\\s*[:：×xX*✕]\\s*|\\s+)${REPS}$`, 'i');
const SET_TOKEN = new RegExp(`^${WEIGHT}\\s*[×xX*✕:：]\\s*${REPS}$`, 'i');
const DATE_LINE = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?\s*(.*)$/;

function toSet(weight, reps) {
  const weightKg = weight === '빈바' ? EMPTY_BAR_KG : weight === '맨몸' ? null : Number(weight);
  return { weightKg, reps: Number(reps), warmup: false };
}

function parseSetList(text) {
  const tokens = text.split(/[,，/]/).map((t) => t.trim()).filter(Boolean);
  const sets = tokens.map((t) => t.match(SET_TOKEN));
  return sets.length && sets.every(Boolean) ? sets.map((m) => toSet(m[1], m[2])) : null;
}

// 붙여넣은 글 → 기록. 두 가지 형식을 섞어 쓸 수 있다
//   평벤치 프레스          - 평벤치 프레스: 20×10, 40×12, 50×8
//   빈바 : 10개
//   40kg : 12개
// 첫 줄이 '2026-11-05 상체 60분 (첫 세트는 워밍업)'이면 날짜·메모·운동 시간·워밍업까지 읽는다
export function parseStrengthText(text) {
  const out = { date: null, note: null, durationMin: null, exercises: [], unparsed: [] };
  let warmupFirst = false;
  let current = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-•·*]\s*/, '');
    if (!line) continue;

    const date = !out.date && !out.exercises.length && line.match(DATE_LINE);
    if (date) {
      out.date = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
      warmupFirst = /첫\s*세트.*워밍업/.test(date[4]);
      const rest = date[4].replace(/[(（].*?[)）]/g, '');
      const mins = rest.match(/(\d+)\s*분/);
      if (mins) out.durationMin = Number(mins[1]);
      out.note = rest.replace(/\d+\s*분/, '').trim() || null;
      continue;
    }

    const set = line.match(SET_LINE);
    if (set) {
      if (current) current.setList.push(toSet(set[1], set[2]));
      else out.unparsed.push(line);
      continue;
    }

    const colon = line.search(/[:：]/);
    const inline = colon > 0 ? parseSetList(line.slice(colon + 1)) : null;
    if (inline) {
      current = { name: line.slice(0, colon).trim(), setList: inline };
      out.exercises.push(current);
    } else if (/^\d/.test(line)) {
      out.unparsed.push(line);   // 숫자로 시작하는데 세트 형식이 아님 → 운동 이름으로 넣지 않는다
    } else {
      current = { name: line, setList: [] };
      out.exercises.push(current);
    }
  }

  out.exercises = out.exercises.filter((e) => {
    if (e.setList.length) return true;
    out.unparsed.push(e.name);   // 세트가 없는 이름 줄
    return false;
  });
  if (warmupFirst) for (const e of out.exercises) e.setList[0].warmup = true;
  return out;
}
