#!/usr/bin/env node
/**
 * ecos.js — 한국은행 ECOS 오픈API 조회 도구 (moneyweather)
 *
 * 목적
 *   금리·물가처럼 블로그 본문에 쓰는 핵심 수치를 한국은행 원자료에서 직접 가져온다.
 *   보도자료 PDF를 사람이 열어 대조하던 작업을 대체한다. (CLAUDE.md §2, §28, §32.1)
 *
 * 의존성 없음. Node 18+ 내장 fetch 사용.
 *
 * API 키
 *   1) 환경변수 ECOS_API_KEY
 *   2) 05_자동화/.env 파일의  ECOS_API_KEY=발급받은키
 *   3) --key=발급받은키
 *   .env는 .gitignore에 등록되어 있다. 키를 소스에 적지 말 것.
 *
 * 사용법
 *   node ecos.js snapshot [YYYYMM]            금리 핵심지표 한 번에 (numbers.md 형식)
 *   node ecos.js tables [검색어]              통계표 목록 검색
 *   node ecos.js items <표코드> [검색어]       통계항목 목록 (코드 확인용)
 *   node ecos.js series <표코드> <주기> <시작> <끝> [항목1] [항목2] [항목3]
 *   node ecos.js key100                       100대 통계지표
 *
 *   주기: A(년) S(반기) Q(분기) M(월) D(일)
 *   시작/끝 형식: 월=YYYYMM, 분기=YYYYQn, 년=YYYY, 일=YYYYMMDD
 *
 * 예
 *   node ecos.js snapshot                     최근 발표분 기준
 *   node ecos.js snapshot 202607              특정 월 기준
 *   node ecos.js tables 가중평균금리
 *   node ecos.js items 121Y006 주택담보
 *   node ecos.js series 121Y006 M 202605 202607 BECBLA0302
 *
 * 주의
 *   tables 결과 중 실제 조회 가능한 것은 SRCH_YN=Y 인 leaf 표뿐이다.
 *   상위 분류코드(예: 0000000053)로 items를 호출하면 INFO-200이 난다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://ecos.bok.or.kr/api';
const MAX = 1000; // 1회 조회 상한

// ---------------------------------------------------------------- 키 로딩

function loadKey(argv) {
  const fromArg = argv.find((a) => a.startsWith('--key='));
  if (fromArg) return fromArg.slice('--key='.length).trim();

  if (process.env.ECOS_API_KEY) return process.env.ECOS_API_KEY.trim();

  // 05_자동화/.env  (이 파일 기준 상위 디렉터리)
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*ECOS_API_KEY\s*=/.test(l));
    if (line) return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }

  fail(
    'ECOS API 키를 찾지 못했습니다.\n\n' +
      '  다음 중 하나로 설정하세요.\n' +
      `  1) 파일 생성:  ${envPath}\n` +
      '     내용:       ECOS_API_KEY=발급받은키\n' +
      '  2) 환경변수:   export ECOS_API_KEY=발급받은키\n' +
      '  3) 인자:       node ecos.js ... --key=발급받은키\n\n' +
      '  .env는 .gitignore에 등록되어 있어 커밋되지 않습니다.'
  );
}

function fail(msg) {
  console.error('\n[오류] ' + msg + '\n');
  process.exit(1);
}

// ---------------------------------------------------------------- 호출

async function call(service, key, parts) {
  const url = [BASE, service, key, 'json', 'kr', ...parts].join('/');
  const res = await fetch(url, { headers: { 'User-Agent': 'moneyweather/1.0' } });

  if (!res.ok) fail(`HTTP ${res.status} — ${url.replace(key, '***')}`);

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail('응답이 JSON이 아닙니다. 앞부분:\n' + text.slice(0, 400));
  }

  // ECOS 오류 응답: { RESULT: { CODE, MESSAGE } }
  if (json.RESULT) {
    fail(`ECOS ${json.RESULT.CODE}: ${json.RESULT.MESSAGE}`);
  }

  const body = json[service];
  if (!body) fail('예상과 다른 응답 구조:\n' + JSON.stringify(json).slice(0, 400));

  return { total: Number(body.list_total_count || 0), rows: body.row || [] };
}

// ---------------------------------------------------------------- 출력

function table(rows, cols) {
  if (!rows.length) return console.log('(결과 없음)');
  const head = cols.map((c) => c.label);
  const data = rows.map((r) => cols.map((c) => String(c.get(r) ?? '')));
  const w = head.map((h, i) =>
    Math.max(width(h), ...data.map((d) => width(d[i])))
  );
  const line = (cells) =>
    cells.map((c, i) => c + ' '.repeat(Math.max(0, w[i] - width(c)))).join('  ');

  console.log(line(head));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  data.forEach((d) => console.log(line(d)));
}

// 한글은 폭 2로 계산해야 열이 맞는다
function width(s) {
  let n = 0;
  for (const ch of String(s)) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return n;
}

function filterRows(rows, term, fields) {
  if (!term) return rows;
  const t = term.toLowerCase();
  return rows.filter((r) => fields.some((f) => String(r[f] ?? '').toLowerCase().includes(t)));
}

// ---------------------------------------------------------------- 명령

async function cmdTables(key, term) {
  const { rows } = await call('StatisticTableList', key, ['1', String(MAX)]);
  const hit = filterRows(rows, term, ['STAT_NAME', 'STAT_CODE']);
  console.log(`\n통계표 ${hit.length}건${term ? ` (검색어: ${term})` : ''}\n`);
  table(hit, [
    { label: '표코드', get: (r) => r.STAT_CODE },
    { label: '주기', get: (r) => r.CYCLE },
    { label: '통계표명', get: (r) => r.STAT_NAME },
  ]);
  console.log('\n다음 단계:  node ecos.js items <표코드>\n');
}

async function cmdItems(key, code, term) {
  if (!code) fail('통계표 코드를 지정하세요.  예: node ecos.js items 121Y002');
  const { rows } = await call('StatisticItemList', key, ['1', String(MAX), code]);
  const hit = filterRows(rows, term, ['ITEM_NAME', 'ITEM_CODE']);
  console.log(`\n[${code}] 통계항목 ${hit.length}건${term ? ` (검색어: ${term})` : ''}\n`);
  table(hit, [
    { label: '항목코드', get: (r) => r.ITEM_CODE },
    { label: '항목명', get: (r) => r.ITEM_NAME },
    { label: '주기', get: (r) => r.CYCLE },
    { label: '수록시작', get: (r) => r.START_TIME },
    { label: '수록종료', get: (r) => r.END_TIME },
    { label: '단위', get: (r) => r.UNIT_NAME },
  ]);
  console.log('\n다음 단계:  node ecos.js series <표코드> <주기> <시작> <끝> <항목코드>\n');
}

async function cmdSeries(key, args) {
  const [code, cycle, start, end, ...items] = args;
  if (!code || !cycle || !start || !end) {
    fail('사용법: node ecos.js series <표코드> <주기> <시작> <끝> [항목코드...]');
  }
  const parts = ['1', String(MAX), code, cycle, start, end, ...items];
  const { total, rows } = await call('StatisticSearch', key, parts);

  console.log(`\n[${code}] ${cycle} ${start}~${end} — ${rows.length}건 (전체 ${total})\n`);
  table(rows, [
    { label: '시점', get: (r) => r.TIME },
    { label: '값', get: (r) => r.DATA_VALUE },
    { label: '단위', get: (r) => r.UNIT_NAME },
    { label: '항목', get: (r) => [r.ITEM_NAME1, r.ITEM_NAME2, r.ITEM_NAME3].filter(Boolean).join(' / ') },
  ]);

  console.log(
    '\n출처 표기용:  한국은행 경제통계시스템(ECOS), 통계표 ' +
      code +
      ', 조회일 ' +
      new Date().toISOString().slice(0, 10) +
      '\n'
  );
}

/**
 * snapshot — 블로그에서 반복 사용하는 금리 지표를 한 번에 조회한다.
 *
 * 아래 코드는 추측이 아니라 ECOS API로 직접 확인한 값이다 (2026-09-06 확인).
 * 코드가 바뀌면 `tables` / `items` 로 다시 확인할 것. (CLAUDE.md §2)
 */
const SNAPSHOT = [
  { label: '한국은행 기준금리', stat: '722Y001', item: '0101000', unit: '연%' },
  { label: '예금은행 대출평균', stat: '121Y006', item: 'BECBLA01', unit: '연%' },
  { label: '가계대출금리', stat: '121Y006', item: 'BECBLA03', unit: '연%' },
  { label: '주택담보대출금리', stat: '121Y006', item: 'BECBLA0302', unit: '연%' },
  { label: '  └ 고정형 주담대', stat: '121Y006', item: 'BECBLA030201', unit: '연%' },
  { label: '  └ 변동형 주담대', stat: '121Y006', item: 'BECBLA030202', unit: '연%' },
  { label: '일반신용대출', stat: '121Y006', item: 'BECBLA03051', unit: '연%' },
  { label: '전세자금대출', stat: '121Y006', item: 'BECBLA03041', unit: '연%' },
  { label: '저축성수신금리', stat: '121Y002', item: 'BEABAA2', unit: '연%' },
  { label: '주담대 고정금리 비중', stat: '121Y010', item: 'LN10000', unit: '%' },
  { label: '주담대 변동금리 비중', stat: '121Y010', item: 'LN20000', unit: '%' },
  { label: '가계 고정금리 비중', stat: '121Y010', item: 'LH10000', unit: '%' },
];

function addMonths(ym, n) {
  let y = Number(ym.slice(0, 4));
  let m = Number(ym.slice(4, 6)) + n;
  y += Math.floor((m - 1) / 12);
  m = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${y}${String(m).padStart(2, '0')}`;
}

async function cmdSnapshot(key, ym) {
  const now = new Date();
  const end = ym || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = addMonths(end, -3);

  console.log(`\n조회 구간: ${start} ~ ${end}  (조회일 ${now.toISOString().slice(0, 10)})\n`);

  const out = [];
  for (const s of SNAPSHOT) {
    let rows = [];
    try {
      const r = await call('StatisticSearch', key, [
        '1', '100', s.stat, 'M', start, end, s.item,
      ]);
      rows = r.rows;
    } catch {
      /* 해당 구간 데이터 없음 — 아래에서 '-' 처리 */
    }
    rows.sort((a, b) => a.TIME.localeCompare(b.TIME));
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    out.push({
      label: s.label,
      time: last ? last.TIME : '-',
      value: last ? last.DATA_VALUE : '-',
      unit: s.unit,
      diff:
        last && prev
          ? (Number(last.DATA_VALUE) - Number(prev.DATA_VALUE)).toFixed(2).replace(/^(?!-)/, '+')
          : '-',
      src: `${s.stat} / ${s.item}`,
    });
  }

  table(out, [
    { label: '지표', get: (r) => r.label },
    { label: '기준월', get: (r) => r.time },
    { label: '값', get: (r) => r.value },
    { label: '단위', get: (r) => r.unit },
    { label: '전월대비', get: (r) => r.diff },
    { label: '통계표/항목', get: (r) => r.src },
  ]);

  const latest = out.map((o) => o.time).filter((t) => t !== '-').sort().pop();
  console.log(
    '\n※ 지표마다 최신 발표월이 다를 수 있습니다. 위 "기준월"을 각각 확인하세요. (CLAUDE.md §32.1)\n' +
      `※ 가장 최근 데이터: ${latest}\n\n` +
      'numbers.md 출처 표기용:\n' +
      `  한국은행 경제통계시스템(ECOS), 통계표코드 위 표 참조, 조회일 ${now
        .toISOString()
        .slice(0, 10)}\n` +
      '  https://ecos.bok.or.kr\n'
  );
}

async function cmdKey100(key) {
  const { rows } = await call('KeyStatisticList', key, ['1', String(MAX)]);
  console.log(`\n100대 통계지표 ${rows.length}건\n`);
  table(rows, [
    { label: '분류', get: (r) => r.CLASS_NAME },
    { label: '지표명', get: (r) => r.KEYSTAT_NAME },
    { label: '값', get: (r) => r.DATA_VALUE },
    { label: '단위', get: (r) => r.UNIT_NAME },
    { label: '시점', get: (r) => r.CYCLE },
  ]);
  console.log();
}

// ---------------------------------------------------------------- main

(async function main() {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith('--key='));
  const key = loadKey(process.argv.slice(2));
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'snapshot':
      return cmdSnapshot(key, rest[0]);
    case 'tables':
      return cmdTables(key, rest[0]);
    case 'items':
      return cmdItems(key, rest[0], rest[1]);
    case 'series':
      return cmdSeries(key, rest);
    case 'key100':
      return cmdKey100(key);
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('/**')[1]);
      process.exit(cmd ? 1 : 0);
  }
})();
