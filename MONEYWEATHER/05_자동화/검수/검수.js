#!/usr/bin/env node
/**
 * 검수.js — 발행 판정을 사람 대신 내려주는 스크립트
 *
 *   node 05_자동화/검수/검수.js <draft.md 경로>
 *
 * 왜 만들었나
 * ------------
 * ISA 글에서 1차 검수 때 스스로 GREEN 을 줬는데 2·3차에서 결함이 여덟 개 나왔다.
 * 되돌아보니 패턴이 하나였다.
 *
 *   md2html.js 가 기계로 검사한 것   → 전부 잡혔다
 *   사람이 산문으로 판단한 것        → 전부 거짓 통과했다
 *
 * factcheck.md 에 「표 배치: 3곳, 연달아 나오지 않음」이라고 적혀 있었는데
 * 그때 표는 네 개였고 두 개가 붙어 있었다.
 * 파일을 센 게 아니라 계획을 옮겨 적은 것이다.
 *
 * 그래서 판정을 사람 손에서 뺀다.
 * factcheck.md 의 「판정」 줄은 이 스크립트 출력으로만 채운다.
 * 돌리지 않았으면 판정은 없는 것으로 본다.
 *
 * 검사 아홉 가지는 전부 그때 실제로 터진 결함에 대응한다.
 * 일반적인 품질 검사가 아니다. 새 유형이 터지면 그때 추가한다. (CLAUDE.md §47)
 *
 * 이 스크립트가 못 하는 것
 * ------------------------
 *   · 초보자가 정말 이해하는지        — 내용을 아는 사람은 판정할 수 없다
 *   · 출처 원문이 정말 그 말을 하는지 — 잘못 읽으면 스크립트는 모른다
 *   · 화면에 제대로 나오는지          — 표 깨짐과 태그 노출은 렌더링해야 보였다
 *
 * GREEN 은 "이 셋만 남았다"는 뜻이지 "다 됐다"가 아니다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- 공통

/** CLAUDE.md 가 있는 곳을 프로젝트 뿌리로 본다. (md2html.js 와 같은 방식) */
function findProjectRoot(start) {
  let d = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, 'CLAUDE.md'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

/**
 * 금지 표현은 00_브랜드/글쓰기톤.md §5.1 에서 읽는다.
 * md2html.js 도 같은 곳을 읽는다. 목록이 두 벌 생기지 않게 하려는 것이다.
 */
function loadBannedPhrases(root) {
  const p = path.join(root, '00_브랜드', '글쓰기톤.md');
  if (!fs.existsSync(p)) return [];
  const sec = fs.readFileSync(p, 'utf8').split('### 5.1')[1];
  if (!sec) return [];
  const block = sec.match(/```text\n([\s\S]*?)```/);
  if (!block) return [];
  return block[1].split(/\s{2,}|\n/).map((s) => s.trim()).filter((s) => s.length > 2);
}

function loadTerms(root) {
  const p = path.join(root, '05_자동화', '검수', '금융용어.txt');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

/** 이미지 HTML 에서 눈에 보이는 글자만. 출처 표기줄은 뺀다 (출처는 어려워도 정확하게 쓴다) */
function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div class="src"[\s\S]*?<\/div>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** 「77만원」 「29만 7천원」 「2억원」 같은 금액 표기 */
function amounts(text) {
  const out = new Set();
  const re = /[0-9][0-9,]*\s*억\s*[0-9,]*\s*만?\s*원|[0-9][0-9,]*\s*만\s*(?:[0-9,]+\s*천\s*)?원|[0-9][0-9,]*\s*원/g;
  let m;
  while ((m = re.exec(text))) out.add(m[0].replace(/\s+/g, ' ').trim());
  return out;
}

// ---------------------------------------------------------------- 원고 쪼개기

function splitDraft(md) {
  // [안내] 는 2026-09-10 부터 본문 맨 뒤에 있다. 예전처럼 [/안내] 뒤를 본문으로 잡으면
  // 본문이 빈 줄 몇 개가 되어 금지 표현·용어 검사가 전부 헛돌았다. 그래서 박스만 도려낸다.
  const noComment = md.replace(/<!--[\s\S]*?-->/g, '');
  const noNote = noComment.replace(/\[안내\][\s\S]*?\[\/안내\]/, '');
  // 머리말(> 상태: …)은 본문이 아니다. 첫 구분선까지 뗀다.
  const noHead = noNote.replace(/^[\s\S]*?\n---[ \t]*\r?\n/, (m) => (/^> /m.test(m) ? '' : m));
  return { body: noHead.split('[FOOTER]')[0] };
}

function parts(body) {
  const codeBlocks = [...body.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const withoutCode = body.replace(/```[a-z]*\n[\s\S]*?```/g, '\n');
  const tableLines = withoutCode.split('\n').filter((l) => l.trim().startsWith('|'));
  const prose = withoutCode
    .split('\n')
    .filter((l) => !l.trim().startsWith('|') && !l.trim().startsWith('[출처]'))
    .join('\n');
  return { codeBlocks, tableLines, prose };
}

// ---------------------------------------------------------------- 검사

const RED = 'RED';
const YELLOW = 'YELLOW';
// 마무리 소제목. 2026-09-11 부터 「결론: 그래서 오늘 … 확인해야 할까?」 꼴이다.
// 주제에 맞게 앞말은 바뀔 수 있어서 꼴로 본다. 이전 글의 「그래서 오늘 뭘 보면 될까?」도 통과.
const 마무리 = /^## (?:결론: )?그래서 .*(?:확인|뭘 보면).*\?\s*$/;

// 횟수를 정해둔 말 (글쓰기톤 §5.2)
// 「결론부터 말하면」은 [정답] 첫 문장 한 번. 「쉽게 말하면」은 용어 번역 자리에서 쓰되 흩뿌리지 않는다.
const 횟수제한 = [
  { re: /결론부터 말하면/g, max: 1, level: RED },
  { re: /쉽게 말(?:하면|해)/g, max: 3, level: YELLOW },
];

function 검사(draftPath) {
  const root = findProjectRoot(path.dirname(draftPath));
  if (!root) throw new Error('CLAUDE.md 를 찾지 못했습니다. 프로젝트 안에서 실행하세요.');

  const raw = fs.readFileSync(draftPath, 'utf8');
  const { body } = splitDraft(raw);
  const { codeBlocks, tableLines, prose } = parts(body);
  const postName = path.basename(path.dirname(draftPath));
  const terms = loadTerms(root);

  const found = [];
  const add = (level, check, msg) => found.push({ level, check, msg });

  // ── 1. 금지 표현 (글쓰기톤 §5.1)
  for (const b of loadBannedPhrases(root)) {
    if (body.includes(b)) add(RED, '금지 표현', '본문에 "' + b + '"');
  }

  // ── 2. 고정 뼈대 (글쓰기톤 §9.5)
  if (!raw.includes('[안내]') || !raw.includes('[/안내]')) {
    add(RED, '고정 뼈대', '[안내] 박스가 없습니다');
  } else {
    const note = raw.split('[안내]')[1].split('[/안내]')[0];
    if (!/참고해주세요/.test(note)) {
      add(RED, '고정 뼈대', '[안내] 제목에 「참고해주세요」가 없습니다');
    }
    if (!/권유/.test(note)) add(RED, '고정 뼈대', '[안내] 에 「권유가 아님」 문구가 없습니다');
  }
  const heads = (body.match(/^## .*/gm) || []).map((h) => h.trim());
  const 마무리자리 = heads.findIndex((h) => 마무리.test(h));
  if (마무리자리 < 0) {
    add(RED, '고정 뼈대', '마무리 소제목(「결론: 그래서 오늘 … 확인해야 할까?」)이 없습니다');
  } else if (마무리자리 !== heads.length - 1) {
    add(RED, '고정 뼈대', '마무리 소제목 뒤에 다른 소제목이 있습니다: ' + heads[heads.length - 1]);
  }
  if (!raw.includes('[체크]')) add(YELLOW, '고정 뼈대', '[체크] 오늘 1분 체크가 없습니다');
  for (const { re, max, level } of 횟수제한) {
    const n = (body.match(re) || []).length;
    if (n > max) add(level, '횟수 제한', '「' + re.source + '」가 ' + n + '번 — ' + max + '번까지 씁니다 (글쓰기톤 §5.2)');
  }
  // 자료 출처를 [안내] 상자 안에 적었으면 [FOOTER] 는 없어도 된다 (2026-09-11)
  if (!raw.includes('[FOOTER]') && !/자료 출처/.test(raw.split('[안내]')[1] || '')) {
    add(RED, '고정 뼈대', '[FOOTER] 도, [안내] 안의 「자료 출처」도 없습니다');
  }

  // ── 3. 표 셀 안 HTML 태그
  //    <br> 을 넣었더니 화면에 글자 그대로 나왔다. 마크다운만 봐서는 안 보인다.
  for (const l of tableLines) {
    const m = l.match(/<[a-zA-Z/][^>]*>/);
    if (m) {
      add(RED, '표 셀 태그', m[0] + ' — md2html 이 이스케이프합니다: ' + l.trim().slice(0, 46));
    }
  }

  // ── 4. 용어 확인 누락
  //    ETF 가 일곱 번 나오는데 설명이 없었다. 눈으로 읽어서는 안 걸린다.
  //    뜻이 좋은지는 판정하지 않는다. 빠뜨리지 않았는지만 본다.
  const declared = (() => {
    const m = raw.match(/<!--\s*용어확인([\s\S]*?)-->/);
    if (!m) return null;
    return m[1].split('\n').map((s) => s.trim()).filter(Boolean)
      .map((s) => s.split(/[—\-–:]/)[0].trim());
  })();

  const used = terms.filter((t) =>
    new RegExp('(^|[^A-Za-z])' + t + '([^A-Za-z]|$)').test(prose)
  );

  if (declared === null) {
    add(YELLOW, '용어 확인',
      'draft.md 에 <!-- 용어확인 --> 블록이 없습니다. 본문에 나온 금융 용어 ' +
      used.length + '개: ' + used.join(', '));
  } else {
    const missing = used.filter((t) => !declared.includes(t));
    if (missing.length) {
      add(RED, '용어 확인', '본문에 나오는데 용어확인에 안 적힌 말: ' + missing.join(', '));
    }
  }

  // ── 5. 본문에 없는 용어가 그림에만 있음
  //    그림에는 「종합소득금액」이 있는데 본문 표에는 없었다.
  //    숫자가 아니라 조건이라 기존 숫자 검사에 안 걸렸다.
  const srcDir = path.join(root, '04_이미지', postName, '_소스');
  let imageTexts = [];
  if (fs.existsSync(srcDir)) {
    imageTexts = fs.readdirSync(srcDir)
      .filter((f) => f.endsWith('.html'))
      .map((f) => ({ f, text: visibleText(fs.readFileSync(path.join(srcDir, f), 'utf8')) }));
    for (const it of imageTexts) {
      const only = terms.filter((t) => it.text.includes(t) && !body.includes(t));
      if (only.length) {
        add(RED, '본문↔그림',
          it.f + ' 에만 있는 용어: ' + only.join(', ') + ' — 독자가 서로 다른 정보를 봅니다');
      }
    }
  } else {
    add(YELLOW, '본문↔그림', '04_이미지/' + postName + '/_소스 폴더가 없습니다');
  }

  // ── 6. 같은 금액이 표·계산·그림에 겹쳐 나옴
  //    77만원이 표 → 코드블록 → 그림으로 세 번 나왔다. 표를 지워야 했다.
  const inTables = amounts(tableLines.join('\n'));
  const inCode = amounts(codeBlocks.join('\n'));
  const inImages = amounts(imageTexts.map((x) => x.text).join('\n'));
  const triple = [...inTables].filter((a) => inCode.has(a) && inImages.has(a));
  const dup = [...inTables].filter((a) => inCode.has(a) && !inImages.has(a));
  if (triple.length) {
    add(YELLOW, '숫자 중복',
      '표·계산·그림에 모두 나오는 금액: ' + triple.join(', ') + ' — 하나는 빼는 게 좋습니다');
  }
  if (dup.length) add(YELLOW, '숫자 중복', '표와 계산에 겹치는 금액: ' + dup.join(', '));

  // ── 7. 마무리 섹션 (글쓰기톤 §9.5)
  //    숫자가 여덟 개 들어가 있었다. 앞에서 이미 다 한 이야기다.
  //    2026-09-11 부터 마무리는 「한두 문장 + [체크] 체크리스트」로 끝난다.
  //    그래서 체크리스트 안은 빼고, 그 밖의 글자만 본다.
  const 마무리줄 = heads.find((h) => 마무리.test(h));
  if (마무리줄) {
    const last = (body.split(마무리줄)[1] || '').replace(/\[체크\][\s\S]*?\[\/체크\]/g, '');
    const nums = last.match(/[0-9][0-9,]*/g) || [];
    if (nums.length > 2) {
      add(YELLOW, '마무리',
        '마지막 섹션에 숫자가 ' + nums.length + '개입니다 (' + nums.join(', ') +
        '). 확인할 것 하나만 남기세요');
    }
    if (/^\s*[-*]\s/m.test(last)) {
      add(YELLOW, '마무리', '체크리스트 밖에 요약 목록이 붙어 있습니다. 본문에서 이미 했습니다');
    }
  }

  // ── 8b. 숫자가 촘촘한 문단 (글쓰기톤 §2.5 — 30자당 1개를 넘지 않는다)
  //    「100만원 벌면 15만 4천원 빠지고 84만 6천원 들어옵니다」처럼
  //    독자가 빼면 나오는 값까지 다 적어놓은 문단을 잡는다.
  //    숫자 하나짜리 짧은 문장은 세지 않는다. 그건 숫자가 곧 내용이다.
  const proseParas = body
    .replace(/```[a-z]*\n[\s\S]*?```/g, '\n')
    .split('\n')
    .filter((l) => !l.trim().startsWith('|') && !l.trim().startsWith('[출처]') &&
                   !l.trim().startsWith('>') && !l.trim().startsWith('#'))
    .join('\n')
    .split(/\n\s*\n/)
    .map((s) => s.trim().replace(/\*\*/g, ''))
    .filter(Boolean);

  for (const p of proseParas) {
    const chars = p.replace(/\s/g, '').length;
    const nums = (p.match(/[0-9][0-9,.]*/g) || []).length;
    if (nums >= 4 && chars / nums < 20) {
      add(YELLOW, '숫자 밀도',
        '한 문단에 숫자가 ' + nums + '개입니다 (' + Math.round(chars / nums) +
        '자당 1개): ' + p.slice(0, 46));
    }
  }

  // ── 8. 표가 붙어 있음 (글쓰기톤 §2.5 — 표가 연달아 나오면 눈이 미끄러진다)
  const blocks = body.split(/\n\s*\n/);
  let prev = -9;
  blocks.forEach((b, i) => {
    if (!b.trim().startsWith('|')) return;
    if (i - prev <= 2) {
      add(YELLOW, '표 배치', '표 두 개 사이에 문단이 ' + (i - prev - 1) + '개뿐입니다');
    }
    prev = i;
  });

  // ── 9. numbers.md 단일 출처
  //    「원금 중도인출」을 출처 하나로 VERIFIED 찍었다.
  //    그 표에 한도 미복원이 없었을 뿐인데 확인된 것으로 처리했다.
  const numbersPath = path.join(path.dirname(draftPath), 'numbers.md');
  if (fs.existsSync(numbersPath)) {
    const nm = fs.readFileSync(numbersPath, 'utf8');
    for (const blk of nm.split(/\n## /).slice(1)) {
      const id = blk.split('\n')[0].trim();
      if (!/^NUM-/.test(id)) continue;
      const srcLine = (blk.match(/^-\s*출처:\s*(.+)$/m) || [])[1];
      if (!srcLine) {
        add(YELLOW, '출처 개수', id + ' 에 출처 줄이 없습니다');
        continue;
      }
      const n = srcLine.split('/').filter((s) => s.trim().length > 3).length;
      if (n < 2) {
        add(YELLOW, '출처 개수', id + ' 출처가 하나뿐입니다 — 다른 경로로 한 번 더 확인하세요');
      }
    }
  } else {
    add(YELLOW, '출처 개수', 'numbers.md 가 없습니다');
  }

  return found;
}

// ---------------------------------------------------------------- 실행

const target = process.argv[2];
if (!target) {
  console.error('사용법: node 05_자동화/검수/검수.js <draft.md 경로>');
  process.exit(2);
}
if (!fs.existsSync(target)) {
  console.error('파일이 없습니다: ' + target);
  process.exit(2);
}

const found = 검사(target);

/**
 * 판단이 필요한 YELLOW 는 draft.md 의 <!-- 검수확인 --> 블록에서 승인할 수 있다.
 *
 *   <!-- 검수확인
 *   숫자 중복 — 200/400만원은 한도 정의·계산 입력·결과 강조로 역할이 달라 그대로 둔다
 *   -->
 *
 * 승인해도 출력에서 사라지지 않는다. 「무엇을 왜 넘겼는지」가 원고와 검수 출력에
 * 나란히 남게 하려는 것이다. RED 는 승인할 수 없다.
 */
const acked = (() => {
  const m = fs.readFileSync(target, 'utf8').match(/<!--\s*검수확인([\s\S]*?)-->/);
  if (!m) return [];
  return m[1].split('\n').map((s) => s.trim()).filter(Boolean)
    .map((s) => ({ check: s.split(/[—–]/)[0].trim(), why: (s.split(/[—–]/)[1] || '').trim() }));
})();
const ackOf = (c) => acked.find((a) => a.check === c);

const reds = found.filter((f) => f.level === RED);
const yellows = found.filter((f) => f.level === YELLOW && !ackOf(f.check));
const waived = found.filter((f) => f.level === YELLOW && ackOf(f.check));

const byCheck = {};
for (const f of found.filter((x) => !(x.level === YELLOW && ackOf(x.check)))) {
  (byCheck[f.check] = byCheck[f.check] || []).push(f);
}

const line = '─'.repeat(58);
console.log('검수: ' + path.basename(path.dirname(target)));
console.log(line);

if (!Object.keys(byCheck).length) {
  console.log('  기계로 볼 수 있는 항목은 모두 통과했습니다.');
} else {
  for (const check of Object.keys(byCheck)) {
    const items = byCheck[check];
    console.log('\n[' + items[0].level + '] ' + check);
    items.forEach((i) => console.log('   · ' + i.msg));
  }
}

if (waived.length) {
  console.log('\n[승인됨] 사람이 보고 넘긴 항목입니다. 그대로 두기로 한 이유가 원고에 적혀 있습니다.');
  const seen = new Set();
  for (const w of waived) {
    if (seen.has(w.check)) continue;
    seen.add(w.check);
    console.log('   · ' + w.check + ' — ' + (ackOf(w.check).why || '(사유 없음)'));
  }
}

const verdict = reds.length ? RED : yellows.length ? YELLOW : 'GREEN';
console.log('\n' + line);
console.log('판정: ' + verdict + '   (RED ' + reds.length + ' / YELLOW ' + yellows.length + ')');

if (verdict === 'GREEN') {
  console.log('\n기계 검사는 끝났습니다. 아래 셋은 사람이 봐야 합니다.');
  console.log('  1. 렌더링된 화면 — 표 깨짐·태그 노출은 마크다운에서 안 보입니다');
  console.log('  2. 출처 원문이 정말 그 말을 하는지');
  console.log('  3. 그 분야를 모르는 사람이 읽고 이해하는지');
}

console.log('\n이 출력을 factcheck.md 의 「판정」 줄에 그대로 옮깁니다.');
process.exit(reds.length ? 1 : 0);
