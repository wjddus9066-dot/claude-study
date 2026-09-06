#!/usr/bin/env node
/**
 * 이미지주소적용.js — 티스토리에 올린 이미지 주소를 발행용 HTML에 넣는다 (moneyweather)
 *
 * 왜 필요한가
 *   article-tistory.html 의 이미지 경로는 내 컴퓨터 안의 경로다.
 *   티스토리에는 그런 파일이 없으니 그대로 붙여넣으면 이미지가 안 나온다.
 *   티스토리에 올린 뒤 받은 진짜 주소로 바꿔줘야 한다.
 *
 * 쓰는 순서
 *   1. 티스토리 글쓰기에서 이미지를 images.json 순서대로 올린다
 *   2. HTML 모드로 바꿔서 <img src="..."> 주소들을 복사한다
 *   3. 이 명령을 돌린다
 *   4. 나온 article-tistory-발행.html 을 통째로 붙여넣는다
 *
 * 사용법
 *   node 05_자동화/생성/이미지주소적용.js <초안폴더> <주소1> <주소2> ...
 *
 *   주소를 복사한 HTML 덩어리째 넘겨도 된다. src="..." 를 알아서 뽑는다.
 *   node 05_자동화/생성/이미지주소적용.js <초안폴더> --붙여넣기 '<figure>...</figure>'
 *
 * 확인
 *   개수가 맞지 않으면 멈춘다. 순서가 어긋난 채로 발행되는 것보다 낫다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
if (!argv.length) {
  console.error('사용법: node 이미지주소적용.js <초안폴더> <주소1> <주소2> ...');
  process.exit(1);
}

const dir = argv[0];
if (!fs.existsSync(dir)) {
  console.error('폴더를 찾을 수 없습니다: ' + dir);
  process.exit(1);
}

// 주소 모으기 — 그냥 나열해도 되고, HTML 덩어리를 넘겨도 된다
const rest = argv.slice(1).filter((a) => a !== '--붙여넣기').join(' ');
const urls = [...rest.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]);

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
  console.log('바꿀 이미지가 없습니다. 이미 모두 인터넷 주소입니다.');
  process.exit(0);
}

// 주소 없이 부르면 「무엇을 어떤 순서로 올려야 하는지」를 알려준다
if (!urls.length) {
  console.log(`이미지 ${needReplace.length}장을 이 순서로 티스토리에 올리세요.\n`);
  needReplace.forEach((s, i) => {
    console.log(`  ${i + 1}. ${path.resolve(dir, s)}`);
  });
  console.log('\n올린 뒤 HTML 모드에서 <img> 부분을 복사해서 이렇게 넘기세요.');
  console.log(`  node 05_자동화/생성/이미지주소적용.js "${dir}" --붙여넣기 '복사한내용'`);
  process.exit(0);
}

if (urls.length !== needReplace.length) {
  console.error(`개수가 맞지 않습니다. 글에 이미지 ${needReplace.length}장인데 주소는 ${urls.length}개입니다.`);
  console.error('\n글의 이미지 순서:');
  needReplace.forEach((s, i) => console.error(`  ${i + 1}. ${path.basename(s)}`));
  console.error('\n순서가 어긋난 채로 발행되지 않도록 여기서 멈춥니다.');
  process.exit(1);
}

// 순서대로 갈아끼운다
let n = 0;
html = html.replace(/<img\s+src="([^"]+)"/g, (m, s) =>
  /^https?:/i.test(s) ? m : m.replace(s, urls[n++])
);

const out = path.join(dir, 'article-tistory-발행.html');
fs.writeFileSync(out, html, 'utf8');

console.log(`이미지 ${n}장의 주소를 넣었습니다.\n`);
needReplace.forEach((s, i) => {
  console.log(`  ${i + 1}. ${path.basename(s)}`);
  console.log(`     → ${urls[i]}`);
});
console.log(`\n생성: ${out}`);
console.log('이 파일을 통째로 복사해서 티스토리 HTML 모드에 붙여넣으세요.');
