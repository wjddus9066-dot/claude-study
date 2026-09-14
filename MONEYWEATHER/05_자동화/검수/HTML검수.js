/**
 * HTML검수.js — 손으로 쓴 발행용 HTML 검수 (draft.md 파이프라인을 타지 않는 글용)
 *
 *   node 05_자동화/검수/HTML검수.js <HTML 경로>
 *
 * 검수.js 가 draft.md 를 보는 것과 같은 항목을 HTML 에서 본다.
 *   금지 표현(글쓰기톤 §5.1) · 팔레트 밖 색 · 그림 파일/alt · 본문에 없는데 그림에만 있는 숫자
 *   고정 뼈대([안내] 세 줄, 「결론:」 소제목) · 태그 짝
 * 그림 폴더는 04_이미지/<글폴더 이름> 으로 찾는다 (md2html.js 와 같은 규칙).
 */
const fs = require('fs'), path = require('path');
const F = process.argv[2];
if (!F) { console.error('사용법: node 05_자동화/검수/HTML검수.js <손으로 쓴 HTML 경로>'); process.exit(2); }
const DIR = path.dirname(F);
const IMG = path.join('04_이미지', path.basename(DIR));
let raw = fs.readFileSync(F, 'utf8');
const RED = [], YEL = [];

// 발행본에 안 나가는 주석 제외
const body = raw.replace(/<!--[\s\S]*?-->/g, '');
const text = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
const prose = text.replace(/[\s]+/g, ' ');

// 1. 금지 표현 (글쓰기톤 §5.1 목록을 그대로 읽는다)
const tone = fs.readFileSync('00_브랜드/글쓰기톤.md', 'utf8');
const banned = tone.split('### 5.1')[1].split('```')[1].split('\n')
  .map(s => s.trim()).filter(s => s && s !== 'text');
banned.forEach(p => { if (prose.includes(p)) RED.push(`금지 표현: "${p}"`); });
const cnt = (re) => (prose.match(re) || []).length;
if (cnt(/결론부터 말하면/g) >= 2) RED.push('「결론부터 말하면」 2번 이상');
if (cnt(/쉽게 말(하면|해)/g) >= 4) YEL.push('「쉽게 말하면」 ' + cnt(/쉽게 말(하면|해)/g) + '번');

// 2. 팔레트 밖 색
const pal = new Set(Object.values(require(path.resolve('05_자동화/팔레트.js')).C).map(v => v.toUpperCase()));
[...new Set(body.match(/#[0-9A-Fa-f]{6}/g) || [])]
  .filter(c => !pal.has(c.toUpperCase()))
  .forEach(c => RED.push('팔레트에 없는 색: ' + c));

// 3. 그림 파일 존재 · alt · 캡션
const imgs = [...raw.matchAll(/<img src="([^"]+)" alt="([^"]*)"/g)];
imgs.forEach(([, src, alt]) => {
  const p = path.join(DIR, src);
  if (!fs.existsSync(p)) RED.push('그림 파일 없음: ' + src);
  if (alt.trim().length < 15) RED.push('alt 가 너무 짧음: ' + src);
});
const files = fs.readdirSync(IMG).filter(f => f.endsWith('.png'));
files.forEach(f => { if (!raw.includes(f)) YEL.push('글에 안 쓰인 그림: ' + f); });

// 4. 본문↔그림 숫자 (md2html 정합성 검사와 같은 취지)
const visible = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
const nums = (s) => new Set((s.match(/[0-9][0-9,.]*\s*(?:조원|억원|만원|%|년|개|세)/g) || [])
  .map(x => x.replace(/\s+/g, '')));
const inBody = nums(prose);
fs.readdirSync(path.join(IMG, '_소스')).filter(f => f.endsWith('.html')).forEach(f => {
  if (f.startsWith('01_')) return;                       // 썸네일은 §41.2 별도 기준
  const t = visible(fs.readFileSync(path.join(IMG, '_소스', f), 'utf8'));
  const only = [...nums(t)].filter(n => !inBody.has(n));
  if (only.length) YEL.push(`그림에만 있는 숫자 — ${f}: ${only.join(', ')}`);
});

// 5. 고정 뼈대 · 구조
if (!/💡 참고해주세요/.test(prose)) RED.push('[안내] 「💡 참고해주세요」 없음');
if (!/권유/.test(prose)) RED.push('[안내] 권유 아님 문구 없음');
if (!/자료 출처/.test(prose)) RED.push('[안내] 자료 출처 없음');
if (!/결론:/.test(prose)) RED.push('마무리 「결론:」 소제목 없음');
const tags = ['div', 'p', 'figure', 'aside', 'table'];
tags.forEach(tg => {
  const o = (body.match(new RegExp(`<${tg}[ >]`, 'g')) || []).length;
  const c = (body.match(new RegExp(`</${tg}>`, 'g')) || []).length;
  if (o !== c) RED.push(`태그 짝 안 맞음: <${tg}> ${o}개 / </${tg}> ${c}개`);
});
const h2 = [...body.matchAll(/<h2[^>]*>\s*([^<]+)/g)].map(m => m[1].trim());

console.log('검수:', path.basename(F));
console.log('─'.repeat(58));
console.log(`글자 수(태그 제외): ${prose.replace(/\s/g, '').length}자 · 그림 ${imgs.length}장 · 소제목 ${h2.length}개`);
console.log('소제목:', h2.map(s => s.split('.')[0]).join(' '));
console.log('─'.repeat(58));
if (!RED.length && !YEL.length) console.log('  기계로 볼 수 있는 항목은 모두 통과했습니다.');
RED.forEach(m => console.log('[RED]   ' + m));
YEL.forEach(m => console.log('[YELLOW] ' + m));
console.log('─'.repeat(58));
console.log(`판정: ${RED.length ? 'RED' : YEL.length ? 'YELLOW' : 'GREEN'}   (RED ${RED.length} / YELLOW ${YEL.length})`);
process.exit(RED.length ? 1 : 0);
