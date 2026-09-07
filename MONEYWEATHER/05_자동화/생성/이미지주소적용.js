#!/usr/bin/env node
/* ============================================================
 *
 *   이 파일에는 아무것도 붙여넣지 않습니다.
 *
 *   티스토리에서 복사한 [##_Image|...] 는
 *   아래 명령의 따옴표 안에 넣습니다.
 *
 *     node 05_자동화/생성/이미지주소적용.js "글폴더" --붙여넣기 '여기'
 *                                                            ~~~~
 *   어느 폴더인지 모르겠으면 --붙여넣기 없이 한 번 돌리세요.
 *   올릴 순서와 넣을 명령을 그대로 찍어줍니다.
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
 * 쓰는 순서
 *   1. 아래 명령을 주소 없이 돌려서 올릴 순서를 확인한다
 *   2. 티스토리 글쓰기에서 그 순서대로 이미지를 올린다
 *   3. HTML 모드로 바꿔서 [##_Image|...] 부분을 통째로 복사한다
 *   4. 이 명령을 돌린다
 *   5. 나온 article-tistory-발행.html 을 통째로 붙여넣는다
 *
 * 사용법
 *   node 05_자동화/생성/이미지주소적용.js <초안폴더>
 *   node 05_자동화/생성/이미지주소적용.js <초안폴더> --붙여넣기 '복사한내용'
 *
 *   복사한 내용은 작은따옴표로 감싼다. 안에 큰따옴표가 들어 있기 때문이다.
 *   매크로 대신 https:// 주소를 나열해도 받지만, 만료 때문에 권하지 않는다.
 *
 * 확인
 *   개수가 맞지 않으면 멈춘다. 순서가 어긋난 채로 발행되는 것보다 낫다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
if (!argv.length) {
  console.error('사용법: node 이미지주소적용.js <초안폴더> --붙여넣기 \'복사한내용\'');
  process.exit(1);
}

const dir = argv[0];
if (!fs.existsSync(dir)) {
  console.error('폴더를 찾을 수 없습니다: ' + dir);
  process.exit(1);
}

// 붙여넣은 것에서 이미지를 뽑는다 — 티스토리 매크로가 우선이다
const rest = argv.slice(1).filter((a) => a !== '--붙여넣기').join(' ');
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

// 아무것도 안 넘기면 「무엇을 어떤 순서로 올려야 하는지」를 알려준다
if (!items.length) {
  console.log(`이미지 ${needReplace.length}장을 이 순서로 티스토리에 올리세요.\n`);
  needReplace.forEach((s, i) => console.log(`  ${i + 1}. ${path.resolve(dir, s)}`));
  console.log('');
  console.log('올린 뒤 HTML 모드로 바꿔서 [##_Image|...] 를 통째로 복사하세요.');
  console.log('');
  console.log('  ┌─ 복사한 건 JS 파일이 아니라 여기에 넣습니다 ──────────');
  console.log('  │');
  console.log(`  │   node 05_자동화/생성/이미지주소적용.js "${dir}" --붙여넣기 '★'`);
  console.log('  │');
  console.log('  │   ★ 자리에 복사한 내용을 붙여넣습니다');
  console.log('  │');
  console.log("  └─ 작은따옴표 ' ' 로 감쌉니다. 큰따옴표는 안 됩니다 ─────");
  process.exit(0);
}

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
