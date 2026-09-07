#!/usr/bin/env node
/**
 * 이미지렌더.js — 04_이미지/<글폴더>/_소스/*.html 을 PNG로 찍어낸다 (moneyweather)
 *
 * 이미지 소스는 색을 직접 적지 않고 var(--navy) 처럼 쓴다.
 * 이 스크립트가 렌더링 직전에 05_자동화/팔레트.js 의 색을 주입한다.
 * 그래서 팔레트를 고치면 글과 그림이 함께 바뀐다.
 *
 * 사용법
 *   node 05_자동화/생성/이미지렌더.js            전부 다시 만든다
 *   node 05_자동화/생성/이미지렌더.js 2026-09-07  경로에 그 글자가 들어간 것만
 *
 * 그림은 글 단위 폴더에 모여 있다. 티스토리에 올릴 때 폴더 하나만 열면 된다.
 *   04_이미지/2026-09-07_ISA_직장인_실제혜택/01_썸네일.png
 *   04_이미지/2026-09-07_ISA_직장인_실제혜택/_소스/01_썸네일.html
 *
 * 번호는 글에 나오는 순서이자 티스토리에 올리는 순서다.
 *
 * 소스 파일 맨 위에 출력 위치를 적어둔다.
 *   <!-- @출력 04_이미지/2026-09-07_ISA_직장인_실제혜택/01_썸네일.png -->
 *   <!-- @크기 1600x900 -->            (없으면 1600x900)
 *
 * 알아둘 것
 *   Chrome은 한글이 섞인 경로로 --screenshot 을 쓰면 조용히 실패한다.
 *   (오류를 내지 않고 예전 파일을 그대로 둔다)
 *   그래서 임시폴더에 찍은 뒤 복사한다.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { cssVars } = require('../팔레트.js');

// ---------------------------------------------------------------- 준비

const ROOT = path.resolve(__dirname, '..', '..');
const IMG_DIR = path.join(ROOT, '04_이미지');

// 04_이미지/<글폴더>/_소스/*.html 을 전부 찾는다.
// ROOT 기준 상대경로로 돌려준다 — 화면에 찍을 때도, 걸러낼 때도 이게 편하다.
function findSources() {
  if (!fs.existsSync(IMG_DIR)) return [];
  const out = [];
  for (const post of fs.readdirSync(IMG_DIR, { withFileTypes: true })) {
    if (!post.isDirectory()) continue;
    const dir = path.join(IMG_DIR, post.name, '_소스');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.html')) out.push(path.relative(ROOT, path.join(dir, f)).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

function findChrome() {
  const cands = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const hit = cands.find((p) => fs.existsSync(p));
  if (!hit) {
    console.error('Chrome을 찾지 못했습니다. CHROME 환경변수로 경로를 지정해주세요.');
    process.exit(1);
  }
  return hit;
}

// ---------------------------------------------------------------- 렌더

function render(chrome, tmp, rel) {
  const srcPath = path.join(ROOT, rel);
  const name = rel;
  const raw = fs.readFileSync(srcPath, 'utf8');

  const out = (raw.match(/<!--\s*@출력\s+(.+?)\s*-->/) || [])[1];
  if (!out) {
    console.log(`  [건너뜀] ${name} — @출력 표시가 없습니다`);
    return null;
  }
  const size = (raw.match(/<!--\s*@크기\s+(\d+)x(\d+)\s*-->/) || [, 1600, 900]).slice(1);

  // 팔레트를 <style>로 주입한다. 소스에는 색이 없다.
  const html = raw.replace(/<meta charset="utf-8">/i, `<meta charset="utf-8">\n<style>${cssVars()}</style>`);
  if (html === raw) {
    console.log(`  [건너뜀] ${name} — <meta charset="utf-8"> 를 찾지 못해 색을 넣을 수 없습니다`);
    return null;
  }

  // 한글 경로를 피해 임시폴더에서 작업한다
  const stem = 'r' + Buffer.from(name).toString('hex').slice(0, 16);
  const workHtml = path.join(tmp, stem + '.html');
  const workPng = path.join(tmp, stem + '.png');
  fs.writeFileSync(workHtml, html, 'utf8');
  if (fs.existsSync(workPng)) fs.unlinkSync(workPng);

  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${size[0]},${size[1]}`,
    `--screenshot=${workPng}`,
    'file:///' + workHtml.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });

  if (!fs.existsSync(workPng)) {
    console.log(`  [실패] ${name} — Chrome이 이미지를 만들지 못했습니다`);
    return null;
  }

  const dest = path.join(ROOT, out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const before = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  fs.copyFileSync(workPng, dest);
  const after = fs.statSync(dest).size;

  console.log(`  ${out}  ${size[0]}x${size[1]}  ${(after / 1024).toFixed(0)}KB` +
              (before && before !== after ? '  (내용 바뀜)' : before ? '  (그대로)' : '  (새로 만듦)'));
  return dest;
}

// ---------------------------------------------------------------- main

const filter = process.argv[2] || '';
const chrome = findChrome();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-img-'));

const files = findSources().filter((f) => !filter || f.includes(filter));

if (!files.length) {
  console.log(filter ? `"${filter}" 에 해당하는 소스가 없습니다.` : '소스가 없습니다.');
  process.exit(0);
}

console.log(`이미지 ${files.length}개를 다시 만듭니다 (팔레트 주입)`);
let ok = 0;
for (const f of files) {
  if (render(chrome, tmp, f)) ok++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n완료: ${ok}/${files.length}`);
