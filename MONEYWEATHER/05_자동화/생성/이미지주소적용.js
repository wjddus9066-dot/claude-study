#!/usr/bin/env node
/* ============================================================
 *
 *   이 파일(이미지주소적용.js)에는 아무것도 붙여넣지 않습니다.
 *
 *   티스토리에서 복사한 것은 글폴더 안에 생기는
 *   붙여넣기.txt 라는 **다른 파일**에 붙여넣습니다.
 *
 *     node 05_자동화/생성/이미지주소적용.js "글폴더"
 *          → 붙여넣기.txt 를 만들어 줍니다
 *
 *     붙여넣기.txt 를 열어서 붙여넣고 저장
 *
 *     node 05_자동화/생성/이미지주소적용.js "글폴더"
 *          → 같은 명령을 한 번 더. 이번엔 파일을 읽습니다
 *
 * ============================================================ */
/**
 * 이미지주소적용.js — 티스토리에 올린 이미지를 발행용 HTML에 넣는다 (moneyweather)
 *
 * 왜 필요한가
 *   article-tistory.html 의 이미지 경로는 내 컴퓨터 안의 경로다.
 *   티스토리에는 그런 파일이 없으니 그대로 붙여넣으면 이미지가 안 나온다.
 *
 * 티스토리 HTML 모드에서 복사하면 이런 게 나온다 (이게 정상이다)
 *   [##_Image|kage@.../img.png?credential=...&expires=...|CDM|1.3|{...}_##]
 *
 *   이 매크로를 그대로 쓴다. blog.kakaocdn.net 주소로 풀어서 쓰지 않는다.
 *   그 주소에는 expires 가 붙어 있어서 몇 주 뒤 이미지가 전부 깨진다.
 *   매크로는 티스토리가 보여줄 때마다 주소를 새로 발급한다.
 *
 * 쓰는 순서 — 같은 명령을 두 번 돌린다
 *   1. 명령을 한 번 돌린다 → 올릴 순서를 알려주고 붙여넣기.txt 를 만든다
 *   2. 티스토리 글쓰기에서 그 순서대로 이미지를 올린다
 *   3. HTML 모드로 바꿔서 [##_Image|...] 부분을 통째로 복사한다
 *   4. 붙여넣기.txt 를 열어 붙여넣고 저장한다
 *   5. 같은 명령을 한 번 더 돌린다
 *   6. 나온 article-tistory-발행.html 을 통째로 붙여넣는다
 *
 * 왜 파일로 받나
 *   매크로는 여러 줄이고 안에 큰따옴표와 중괄호가 들어 있다.
 *   터미널에 따옴표로 감싸서 넣으면 셸이 먹어버리거나 줄이 잘린다.
 *   메모장에 붙여넣듯 파일에 넣는 쪽이 실수가 없다.
 *
 * 사용법
 *   node 05_자동화/생성/이미지주소적용.js <초안폴더>
 *
 *   (예전 방식도 계속 됩니다)
 *   node 05_자동화/생성/이미지주소적용.js <초안폴더> --붙여넣기 '복사한내용'
 *
 * 확인
 *   개수가 맞지 않으면 멈춘다. 순서가 어긋난 채로 발행되는 것보다 낫다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 글폴더 후보를 찾아 화면에 뿌린다.
 *
 * 폴더 이름을 잘못 넣었을 때 「없습니다」로 끝내지 않기 위한 것이다.
 * 실제로 문서의 <글폴더> 표기를 그대로 따라 하다 엉뚱한 폴더를 만든 일이 있었다.
 */
function 글폴더목록() {
  const base = path.join('03_콘텐츠', '초안');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(base, d.name, 'draft.md')))
    .map((d) => path.join(base, d.name).split(path.sep).join('/'));
}

function 길안내(머리말) {
  console.error(머리말 + '\n');
  const list = 글폴더목록();
  if (!list.length) {
    console.error('03_콘텐츠/초안/ 아래에 글폴더가 없습니다.');
    return;
  }
  console.error('아래 중 하나를 그대로 복사해서 쓰세요. 꺾쇠(< >)는 빼고 넣습니다.\n');
  list.forEach((d) => console.error(`  node 05_자동화/생성/이미지주소적용.js "${d}"`));
}

const argv = process.argv.slice(2);
if (!argv.length) {
  길안내('어느 글인지 알려주세요.');
  process.exit(1);
}

// 문서의 자리표시자를 그대로 붙여넣은 경우를 먼저 잡는다
const dir = argv[0].replace(/^["']|["']$/g, '');
if (/^<.*>$/.test(dir) || dir === '글폴더' || dir === '초안폴더') {
  길안내(`"${dir}" 는 자리표시자입니다. 실제 폴더 경로를 넣어야 합니다.`);
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  길안내('폴더를 찾을 수 없습니다: ' + dir);
  process.exit(1);
}
if (!fs.existsSync(path.join(dir, 'draft.md'))) {
  길안내(`"${dir}" 안에 draft.md 가 없습니다. 글폴더가 아닌 것 같습니다.`);
  process.exit(1);
}

// 붙여넣은 것을 어디서 읽을지 정한다.
//
//   1) 명령에 --붙여넣기 로 넘겼으면 그걸 쓴다 (예전 방식)
//   2) 아니면 글폴더의 붙여넣기.txt 를 읽는다 (기본)
//
// 파일 쪽을 기본으로 둔 이유는, 매크로가 여러 줄에 큰따옴표까지 들어 있어서
// 터미널 인자로 넘기다 잘리는 일이 실제로 있었기 때문이다.
const PASTE_FILE = '붙여넣기.txt';
const pastePath = path.join(dir, PASTE_FILE);

const fromArgv = argv.slice(1).filter((a) => a !== '--붙여넣기').join(' ');
let rest = fromArgv;
let 읽은곳 = '명령에 넘긴 내용';

if (!rest && fs.existsSync(pastePath)) {
  // 안내문(# 로 시작하는 줄)은 빼고 읽는다
  rest = fs.readFileSync(pastePath, 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
  읽은곳 = PASTE_FILE;
}

const macros = [...rest.matchAll(/\[##_Image\|[\s\S]*?_##\]/g)].map((m) => m[0]);
const urls = [...rest.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]);
const items = macros.length ? macros : urls;

// 원본 HTML의 이미지 순서를 읽는다
const srcHtml = path.join(dir, 'article-tistory.html');
if (!fs.existsSync(srcHtml)) {
  console.error('article-tistory.html 이 없습니다. 먼저 md2html.js 를 돌려주세요.');
  process.exit(1);
}
let html = fs.readFileSync(srcHtml, 'utf8');

const local = [...html.matchAll(/<img\s+src="([^"]+)"/g)].map((m) => m[1]);
const needReplace = local.filter((s) => !/^https?:/i.test(s));

if (!needReplace.length) {
  console.log('바꿀 이미지가 없습니다. 이미 모두 티스토리 이미지입니다.');
  process.exit(0);
}

// 아직 붙여넣은 게 없으면, 올릴 순서를 알려주고 붙여넣을 파일을 만들어 준다.
if (!items.length) {
  const 안내 = [
    '# ┌──────────────────────────────────────────────────────────┐',
    '# │  티스토리에서 복사한 것을 이 아래에 붙여넣고 저장하세요.  │',
    '# └──────────────────────────────────────────────────────────┘',
    '#',
    '#  1. 티스토리 글쓰기에 그림을 순서대로 올립니다',
    '#  2. 오른쪽 위에서 [기본모드] → [HTML] 로 바꿉니다',
    '#  3. [##_Image|...] 로 시작하는 부분을 통째로 드래그해서 복사합니다',
    '#     (골라낼 필요 없습니다. 그림 있는 데를 통째로)',
    '#  4. 이 줄들 아래에 붙여넣고 저장(Ctrl+S)합니다',
    '#  5. 터미널에서 아까 그 명령을 한 번 더 돌립니다',
    '#',
    `#     node 05_자동화/생성/이미지주소적용.js "${dir}"`,
    '#',
    '#  # 으로 시작하는 줄은 무시되니 지우지 않아도 됩니다.',
    '',
    '',
  ].join('\n');

  const 이미있음 = fs.existsSync(pastePath);
  if (!이미있음) fs.writeFileSync(pastePath, 안내, 'utf8');

  console.log(`이미지 ${needReplace.length}장을 이 순서로 티스토리에 올리세요.\n`);
  needReplace.forEach((s, i) => console.log(`  ${i + 1}. ${path.resolve(dir, s)}`));

  console.log('');
  console.log('  ┌─ 복사한 건 JS 파일이 아니라 이 파일에 붙여넣습니다 ──────');
  console.log('  │');
  console.log(`  │   ${path.resolve(pastePath)}`);
  console.log('  │');
  console.log(이미있음
    ? '  │   (파일은 이미 있습니다. 열어서 붙여넣고 저장하세요)'
    : '  │   (방금 만들었습니다. 열어보면 하는 방법이 적혀 있습니다)');
  console.log('  │');
  console.log('  └──────────────────────────────────────────────────────────');
  console.log('');
  console.log('붙여넣고 저장한 뒤, 같은 명령을 한 번 더 돌리면 됩니다.');
  console.log(`  node 05_자동화/생성/이미지주소적용.js "${dir}"`);
  process.exit(0);
}

console.log(`${읽은곳} 에서 이미지 ${items.length}개를 찾았습니다.\n`);

if (items.length !== needReplace.length) {
  console.error(`개수가 맞지 않습니다. 글에 이미지 ${needReplace.length}장인데 넘어온 건 ${items.length}개입니다.`);
  console.error('\n글의 이미지 순서:');
  needReplace.forEach((s, i) => console.error(`  ${i + 1}. ${path.basename(s)}`));
  console.error('\n순서가 어긋난 채로 발행되지 않도록 여기서 멈춥니다.');
  process.exit(1);
}

if (!macros.length) {
  console.log('[주의] 매크로가 아니라 주소를 받았습니다.');
  console.log('       티스토리 이미지 주소에는 만료 시각이 붙어 있어 나중에 깨질 수 있습니다.');
  console.log('       HTML 모드의 [##_Image|...] 를 그대로 복사해 넘기는 쪽이 안전합니다.\n');
}

// 갈아끼운다.
// 매크로는 그 자체가 이미지 블록이라 <figure> 를 통째로 바꾼다.
// 캡션은 살려야 하므로 <figcaption> 은 style 을 그대로 둔 채 <p> 로 바꾼다.
// (색을 새로 적지 않는다 — 팔레트에서 나온 style 을 그대로 물려받는다)
let n = 0;
html = html.replace(
  /<figure\b[^>]*>[\s\S]*?<\/figure>|<img\s+src="[^"]*"[^>]*>/g,
  (block) => {
    const src = (block.match(/<img\s+src="([^"]+)"/) || [])[1];
    if (!src || /^https?:/i.test(src)) return block;

    if (!macros.length) return block.replace(src, items[n++]);

    let out = items[n++];
    if (block.startsWith('<figure')) {
      const cap = block.match(/<figcaption\b([^>]*)>([\s\S]*?)<\/figcaption>/);
      if (cap) out += `\n<p${cap[1]}>${cap[2]}</p>`;
    }
    return out;
  }
);

const out = path.join(dir, 'article-tistory-발행.html');
fs.writeFileSync(out, html, 'utf8');

console.log(`이미지 ${n}장을 넣었습니다.\n`);
needReplace.forEach((s, i) => {
  const tag = macros.length ? (items[i].match(/"filename":"([^"]+)"/) || [, '매크로'])[1] : items[i];
  console.log(`  ${i + 1}. ${path.basename(s)}`);
  console.log(`     → ${tag}`);
});
console.log(`\n생성: ${out}`);
console.log('이 파일을 통째로 복사해서 티스토리 HTML 모드에 붙여넣으세요.');
