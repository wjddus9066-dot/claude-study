#!/usr/bin/env node
/* ============================================================
 *
 *   이 파일에는 아무것도 붙여넣지 않습니다.
 *   티스토리에서 복사한 것은 글폴더 안의 붙여넣기.txt 에 붙여넣습니다.
 *
 * ============================================================ */
/**
 * HTML이미지주소적용.js — 손으로 쓴 발행용 HTML의 <img> 를 티스토리 이미지 매크로로 바꾼다
 *
 * 왜 따로 있나
 *   이미지주소적용.js 는 draft.md → article-tistory.html 파이프라인을 탄 글만 다룬다.
 *   원고 없이 HTML 로 바로 쓴 글(초보자용 판 같은)은 그 대상이 아니다.
 *
 * 순서가 아니라 파일명으로 맞춘다
 *   티스토리 매크로 안에는 {"filename":"03_펀드구조.png"} 가 들어 있다.
 *   그래서 올린 순서가 조금 틀려도 제자리를 찾아간다. 순서가 어긋난 채 발행되는 사고를 막는다.
 *
 * 쓰는 순서 — 같은 명령을 두 번 돌린다
 *   1. node 05_자동화/생성/HTML이미지주소적용.js <HTML 경로>
 *        → 올릴 순서를 알려주고 글폴더에 붙여넣기.txt 를 만든다
 *   2. 티스토리 글쓰기에서 그 순서대로 그림을 올린다
 *   3. HTML 모드로 바꿔 [##_Image|...] 부분을 통째로 복사한다
 *   4. 붙여넣기.txt 를 열어 붙여넣고 저장한다
 *   5. 같은 명령을 한 번 더 → <이름>-발행.html 이 나온다
 *
 * 확인
 *   그림 개수와 매크로 개수가 다르거나, 파일명이 안 맞으면 멈춘다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const F = process.argv[2];
if (!F || !fs.existsSync(F)) {
  console.error('사용법: node 05_자동화/생성/HTML이미지주소적용.js <HTML 경로>');
  process.exit(2);
}
const DIR = path.dirname(F);
const PASTE = path.join(DIR, '붙여넣기.txt');
const OUT = F.replace(/\.html$/, '-발행.html');

const html = fs.readFileSync(F, 'utf8');
// 발행본에 안 나가는 주석은 빼고 센다
const body = html.replace(/<!--[\s\S]*?-->/g, '');
const imgs = [...body.matchAll(/<img\s[^>]*src="([^"]+)"[^>]*>/g)]
  .map((m) => ({ tag: m[0], src: m[1], name: path.basename(m[1]) }));

if (!imgs.length) { console.error('이 HTML 에는 <img> 가 없습니다: ' + F); process.exit(1); }

const paste = fs.existsSync(PASTE)
  ? fs.readFileSync(PASTE, 'utf8').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
  : '';
const macros = [...paste.matchAll(/\[##_Image\|[\s\S]*?_##\]/g)].map((m) => m[0]);

// 1회차 — 붙여넣기.txt 를 만들고 올릴 순서를 알려준다
if (!macros.length) {
  if (!fs.existsSync(PASTE)) {
    fs.writeFileSync(PASTE,
      '# 티스토리 HTML 모드에서 복사한 이미지 매크로를 여기에 붙여넣습니다.\n' +
      "# '#' 으로 시작하는 줄은 무시합니다.\n");
  }
  console.log('티스토리에 이 순서로 그림을 올리세요 (' + imgs.length + '장)\n');
  imgs.forEach((im, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + im.name));
  console.log('\n올린 뒤 HTML 모드에서 [##_Image|...] 를 통째로 복사해');
  console.log('  ' + PASTE);
  console.log('에 붙여넣고 저장한 다음, 같은 명령을 한 번 더 돌리세요.');
  process.exit(0);
}

// 2회차 — 파일명으로 맞춰 갈아끼운다
const byName = new Map();
for (const mac of macros) {
  const m = mac.match(/"filename":"([^"]+)"/);
  if (!m) { console.error('매크로에 filename 이 없습니다. 티스토리에서 복사한 게 맞나요?'); process.exit(1); }
  byName.set(m[1], mac);
}
if (byName.size !== imgs.length) {
  console.error(`개수가 다릅니다 — 글의 그림 ${imgs.length}장 / 붙여넣은 매크로 ${byName.size}개`);
  process.exit(1);
}
const missing = imgs.filter((im) => !byName.has(im.name));
if (missing.length) {
  console.error('매크로에서 못 찾은 그림: ' + missing.map((m) => m.name).join(', '));
  console.error('티스토리에 올린 파일명이 글의 파일명과 같은지 보세요.');
  process.exit(1);
}

let out = html;
for (const im of imgs) out = out.replace(im.tag, byName.get(im.name));

const left = out.replace(/<!--[\s\S]*?-->/g, '').match(/<img\s/g);
if (left) { console.error('아직 남은 <img> 가 있습니다: ' + left.length + '개'); process.exit(1); }

fs.writeFileSync(OUT, out);
console.log('갈아끼웠습니다 (' + imgs.length + '장)\n');
imgs.forEach((im) => console.log('  ' + im.name + '  ←  티스토리 매크로'));
console.log('\n생성: ' + OUT);
console.log('이 파일을 티스토리 HTML 모드에 통째로 붙여넣으세요.');
