#!/usr/bin/env node
/**
 * 미리보기.js — skin.html 을 티스토리에 올리기 전에 브라우저에서 확인한다.
 *
 * 티스토리 치환자를 가짜 내용으로 바꿔서 세 화면을 만든다.
 *   홈 / 목록 / 글
 *
 * 사용법
 *   node MAINSKIN/미리보기.js            HTML만 만든다
 *   node MAINSKIN/미리보기.js --png      크롬으로 PNG까지 찍는다
 *
 * 결과물은 MAINSKIN/_미리보기/ 에 들어간다. 티스토리에 올리는 파일이 아니다.
 *
 * 댓글·분류·메뉴는 티스토리가 자기 마크업으로 뿌린다.
 * 여기서도 그 마크업을 그대로 흉내내서 style.css 가 맞게 먹는지 확인한다.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const OUT = path.join(DIR, '_미리보기');
const fileURL = (p) => 'file:///' + encodeURI(p.split(path.sep).join('/'));

// ---------------------------------------------------------------- 가짜 내용

const TITLE = '오늘의 재테크온도';

const POSTS = [
  ['투자', 'ISA, 다들 좋다는데 그래서 나한테 뭐가 좋은 걸까?',
   'ISA는 이자·배당에 붙는 15.4% 세금을 200만원까지 0원으로 만들어주는 계좌입니다. 다만 모든 사람에게 같은 크기로 좋은 것은 아닙니다.',
   '2026. 9. 7.', 'thumb-invest.png'],
  ['오늘의 머니온도', '기준금리 내렸다는데, 내 대출금리도 바로 내려갈까?',
   '기준금리가 움직여도 내 대출금리가 같은 날 바뀌지는 않습니다. 사이에 무엇이 끼어 있는지 순서대로 보면 이해가 됩니다.',
   '2026. 9. 5.', 'thumb-weather.png'],
  ['세금', '공시가격이 올랐는데 내 세금도 같이 오를까?',
   '공시가격은 세금을 계산하는 출발점입니다. 다만 공시가격이 오른 만큼 세금이 오르지는 않습니다.',
   '2026. 9. 2.', 'thumb-tax.png'],
  ['부동산', '청약에서 무주택으로 인정되는 집은 따로 있을까?',
   '집이 있어도 무주택으로 보는 경우가 있습니다. 면적과 가격, 지역에 따라 갈립니다.',
   '2026. 8. 28.', 'thumb-estate.png'],
  ['재테크 기초', '예금 금리 4%와 3.5%, 1년에 얼마나 차이 날까?',
   '1,000만원을 기준으로 단순 계산해보면 생각보다 작습니다. 그런데 금액이 커지면 이야기가 달라집니다.',
   '2026. 8. 24.', 'thumb-basic.png'],
];

const CATS = ['재테크 기초', '투자', '세금', '부동산', '오늘의 머니온도'];

const ARTICLE_BODY = `
<p>기준금리가 내렸다는 뉴스를 보면 이런 생각이 듭니다. <strong>그럼 내 대출 이자도 줄어드나?</strong></p>
<p>결론부터 보면 줄어들 수 있습니다. 다만 바로는 아닙니다.</p>
<h2>기준금리와 내 대출금리 사이에는 한 단계가 더 있다</h2>
<p>한국은행이 정하는 기준금리는 은행끼리 돈을 주고받을 때 쓰는 금리에 가깝습니다.
내 대출금리는 여기에 은행의 조달비용과 가산금리가 붙어서 정해집니다.</p>
<blockquote>기준금리가 0.25%포인트 내렸다고 해서 내 대출금리가 그날 0.25%포인트 내려가지는 않습니다.</blockquote>
<h3>숫자로 보면</h3>
<table>
  <thead><tr><th>구분</th><th>변동 전</th><th>변동 후</th><th>차이</th></tr></thead>
  <tbody>
    <tr><td>기준금리</td><td>3.25%</td><td>3.00%</td><td>−0.25%p</td></tr>
    <tr><td>대출금리(예시)</td><td>4.60%</td><td>4.45%</td><td>−0.15%p</td></tr>
    <tr><td>연 이자 (3억원)</td><td>1,380만원</td><td>1,335만원</td><td>−45만원</td></tr>
  </tbody>
</table>
<p>표의 대출금리는 <a href="#">예시 계산</a>입니다. 실제로는 대출 종류와 갱신 주기에 따라 달라집니다.</p>
<h2>그래서 직장인에게는?</h2>
<p>변동금리 대출을 쓰고 있다면 다음 금리 갱신일이 언제인지부터 확인하면 됩니다.
그 날짜가 지나야 내려간 금리가 반영됩니다.</p>
`;

/* 티스토리 [##_category_list_##] 가 뿌리는 모양 (중첩 ul) */
const CATEGORY_LIST = '<ul>' + CATS.map((c) =>
  '<li><a href="#">' + c + ' <span class="c_cnt">(3)</span></a></li>').join('') + '</ul>';

/* 티스토리 [##_blog_menu_##] 가 뿌리는 모양 */
const BLOG_MENU = '<ul><li class="current"><a href="#">홈</a></li>'
  + '<li><a href="#">태그</a></li><li><a href="#">방명록</a></li></ul>';

/* 티스토리 [##_comment_group_##] 가 뿌리는 모양 */
const COMMENT_GROUP = `
<h2>댓글 <span class="count">2</span></h2>
<div class="comment-list">
  <ul>
    <li>
      <div class="author-meta">
        <span class="avatar"></span>
        <span class="nickname">온도한스푼</span>
        <span class="date">2026. 9. 5. 14:20</span>
        <span class="control"><span class="link"><a href="#">수정</a></span></span>
      </div>
      <p>대출 갱신일 확인하는 방법도 같이 알려주시면 좋겠어요.</p>
      <a class="reply" href="#">답글</a>
      <ul>
        <li>
          <div class="author-meta"><span class="avatar"></span>
            <span class="nickname">글쓴이</span><span class="date">2026. 9. 5. 15:02</span></div>
          <p>은행 앱의 대출 상세에서 볼 수 있습니다. 다음 글에서 다뤄볼게요.</p>
        </li>
      </ul>
    </li>
    <li>
      <div class="author-meta"><span class="avatar"></span>
        <span class="nickname">지나가던독자</span><span class="date">2026. 9. 6. 09:11</span></div>
      <p>표가 있어서 한눈에 들어왔습니다.</p>
    </li>
  </ul>
</div>
<div class="comment-form">
  <div class="field">
    <input type="text" placeholder="이름"><input type="password" placeholder="비밀번호">
  </div>
  <textarea placeholder="댓글을 남겨보세요"></textarea>
  <div class="secret"><label>비밀댓글로 남기기</label></div>
  <div class="submit"><button type="button">댓글 남기기</button></div>
</div>`;

// ---------------------------------------------------------------- 치환

/** 그룹 치환자 <s_NAME> ... </s_NAME> 를 지우거나(drop), 안쪽만 남기거나(keep), 반복한다(repeat) */
function group(html, name, mode, repeat) {
  const re = new RegExp('<s_' + name + '>([\\s\\S]*?)</s_' + name + '>', 'g');
  return html.replace(re, (m, inner) => {
    if (mode === 'drop') return '';
    if (mode === 'repeat') return repeat(inner);
    return inner;
  });
}

function postCard(inner, p) {
  const [cat, title, sum, date, thumb] = p;
  return group(inner, 'article_rep_thumbnail', 'keep')
    .replace(/\[##_article_rep_link_##\]/g, '#')
    .replace(/\[##_article_rep_thumbnail_raw_url_##\]/g, fileURL(path.join(DIR, 'images', thumb)))
    .replace(/\/\/i1\.daumcdn\.net\/thumb\/[^?]+\?fname=/g, '')  // 미리보기에서는 다음 썸네일 서버를 안 쓴다
    .replace(/\[##_article_rep_category_##\]/g, cat)
    .replace(/\[##_article_rep_title_##\]/g, title)
    .replace(/\[##_article_rep_summary_##\]/g, sum)
    .replace(/\[##_article_rep_simple_date_##\]/g, date);
}

function build(bodyId, kind) {
  let h = fs.readFileSync(path.join(DIR, 'skin.html'), 'utf8');

  // 경로를 절대 경로로 (미리보기 폴더에서 열어도 그림이 보이게)
  h = h.replace(/\.\/style\.css/g, fileURL(path.join(DIR, 'style.css')));
  h = h.replace(/\.\/images\//g, fileURL(path.join(DIR, 'images')) + '/');

  h = group(h, 't3', 'keep');
  h = group(h, 'search', 'keep');

  // 화면마다 다른 블록
  if (kind === 'article') {
    h = group(h, 'index_article_rep', 'drop');
    h = group(h, 'list', 'drop');
    h = group(h, 'paging', 'drop');
    h = group(h, 'article_protected', 'drop');
    h = group(h, 'notice_rep', 'drop');
    h = group(h, 'page_rep', 'drop');
    h = group(h, 'tag', 'drop');
    h = group(h, 'guest', 'drop');
    h = group(h, 'tag_label', 'keep');
    h = group(h, 'article_related_rep', 'repeat', (inner) =>
      POSTS.slice(0, 4).map((p) => group(inner, 'article_related_rep_thumbnail', 'keep')
        .replace(/\[##_article_related_rep_link_##\]/g, '#')
        .replace(/\[##_article_related_rep_thumbnail_link_##\]/g, fileURL(path.join(DIR, 'images', p[4])))
        .replace(/\/\/i1\.daumcdn\.net\/thumb\/[^?]+\?fname=/g, '')
        .replace(/\[##_article_related_rep_title_##\]/g, p[1])).join('\n'));
    h = group(h, 'article_related', 'keep');
    h = group(h, 'rp', 'keep');
    h = group(h, 'permalink_article_rep', 'keep');
    h = group(h, 'article_rep', 'keep');
    h = h
      .replace(/\[##_article_rep_category_link_##\]/g, '#')
      .replace(/\[##_article_rep_category_##\]/g, '오늘의 머니온도')
      .replace(/\[##_article_rep_title_##\]/g, '기준금리 내렸다는데, 내 대출금리도 바로 내려갈까?')
      .replace(/\[##_article_rep_simple_date_##\]/g, '2026. 9. 5.')
      .replace(/\[##_article_rep_author_##\]/g, '온도한스푼')
      .replace(/\[##_s_ad_isolation_##\]/g, '')
      .replace(/\[##_article_rep_desc_##\]/g, ARTICLE_BODY)
      .replace(/\[##_tag_label_rep_##\]/g,
        '<a href="#">기준금리</a><a href="#">대출금리</a><a href="#">COFIX</a><a href="#">변동금리</a>')
      .replace(/\[##_comment_group_##\]/g, COMMENT_GROUP);
  } else {
    h = group(h, 'permalink_article_rep', 'drop');
    h = group(h, 'article_protected', 'drop');
    h = group(h, 'notice_rep', 'drop');
    h = group(h, 'page_rep', 'drop');
    h = group(h, 'tag', 'drop');
    h = group(h, 'guest', 'drop');
    h = group(h, 'list_empty', 'drop');
    h = group(h, 'index_article_rep', 'repeat', (inner) => POSTS.map((p) => postCard(inner, p)).join('\n'));
    h = group(h, 'article_rep', 'keep');
    h = (kind === 'home') ? group(h, 'list', 'drop') : group(h, 'list', 'keep');
    h = group(h, 'paging_rep', 'repeat', (inner) =>
      [1, 2, 3].map((n) => inner
        .replace(/\[##_paging_rep_link_##\]/g, 'href="#"' + (n === 1 ? ' class="now"' : ''))
        .replace(/\[##_paging_rep_link_num_##\]/g, String(n))).join('\n'));
    h = group(h, 'paging', 'keep');
  }

  // 사이드바 (홈에서는 CSS 가 감춘다. 마크업은 항상 들어간다)
  h = group(h, 'rct_notice_rep', 'repeat', (inner) =>
    ['블로그 운영 원칙과 출처 표기에 대하여'].map((t) => inner
      .replace(/\[##_notice_rep_link_##\]/g, '#')
      .replace(/\[##_notice_rep_title_##\]/g, t)).join('\n'));
  h = group(h, 'rct_notice', 'keep');
  const sidePost = (inner) => POSTS.slice(0, 4).map((p) => inner
    .replace(/\[##_rctps_rep_link_##\]/g, '#')
    .replace(/\[##_rctps_rep_title_##\]/g, p[1])
    .replace(/\[##_rctps_rep_simple_date_##\]/g, p[3])).join('\n');
  h = group(h, 'rctps_rep', 'repeat', sidePost);
  h = group(h, 'rctps_popular_rep', 'repeat', sidePost);
  h = group(h, 'rctrp_rep', 'repeat', (inner) =>
    ['대출 갱신일 확인하는 방법도 같이 알려주시면 좋겠어요.', '표가 있어서 한눈에 들어왔습니다.']
      .map((t) => inner.replace(/\[##_rctrp_rep_link_##\]/g, '#')
        .replace(/\[##_rctrp_rep_desc_##\]/g, t)).join('\n'));
  h = group(h, 'random_tags', 'repeat', (inner) =>
    ['ISA', '기준금리', '절세', '청약', 'COFIX', '연말정산'].map((t) => inner
      .replace(/\[##_tag_link_##\]/g, '#')
      .replace(/\[##_tag_name_##\]/g, t)).join(''));
  h = group(h, 'sidebar_element', 'keep');
  h = group(h, 'sidebar', 'keep');

  // 공통 치환자
  h = h
    .replace(/\[##_page_title_##\]/g, TITLE)
    .replace(/\[##_body_id_##\]/g, bodyId)
    .replace(/\[##_blog_link_##\]/g, '#')
    .replace(/\[##_title_##\]/g, TITLE)
    .replace(/\[##_desc_##\]/g, '어려운 경제 이야기를 쉽게 풀어주는 블로그')
    .replace(/\[##_rss_url_##\]/g, '#')
    .replace(/\[##_category_list_##\]/g, CATEGORY_LIST)
    .replace(/\[##_blog_menu_##\]/g, BLOG_MENU)
    .replace(/\[##_search_name_##\]/g, 'search')
    .replace(/\[##_search_text_##\]/g, '')
    .replace(/\[##_search_onclick_submit_##\]/g, '')
    .replace(/\[##_list_conform_##\]/g, '오늘의 머니온도')
    .replace(/\[##_list_count_##\]/g, String(POSTS.length))
    .replace(/\[##_prev_page_##\]/g, 'href="#"')
    .replace(/\[##_next_page_##\]/g, 'href="#"')
    .replace(/\[##_no_more_prev_##\]/g, '')
    .replace(/\[##_no_more_next_##\]/g, '')
    .replace(/\[##_revenue_list_upper_##\]/g, '')
    .replace(/\[##_revenue_list_lower_##\]/g, '');

  const left = h.match(/\[##_[a-z0-9_]+_##\]|<\/?s_[a-z0-9_]+>/gi);
  return { html: h, left: left ? [...new Set(left)] : [] };
}

// ---------------------------------------------------------------- 실행

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['홈', 'tt-body-index', 'home', 2000],
  ['목록', 'tt-body-category', 'list', 1900],
  ['글', 'tt-body-page', 'article', 2600],
];

const made = [];
let problems = 0;
for (const [label, bodyId, kind, h] of PAGES) {
  const { html, left } = build(bodyId, kind);
  const file = path.join(OUT, label + '.html');
  fs.writeFileSync(file, html);
  made.push([label, file, h]);
  if (left.length) problems++;
  console.log(label.padEnd(3) + ' → _미리보기/' + label + '.html'
    + (left.length ? '   ⚠ 남은 치환자: ' + left.join(' ') : '   치환 완료'));
}
if (problems) {
  console.log('\n남은 치환자는 미리보기 스크립트가 아직 모르는 것입니다.');
  console.log('skin.html 이 틀렸다는 뜻은 아닙니다. 이 스크립트에 처리를 추가하면 됩니다.');
}

if (!process.argv.includes('--png')) {
  console.log('\n브라우저로 열어보세요. PNG로 찍으려면 --png 를 붙이면 됩니다.');
  process.exit(0);
}

function findChrome() {
  const c = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('크롬을 찾지 못했습니다. CHROME 환경변수로 경로를 알려주세요.');
}

const chrome = findChrome();

function shot(png, url, w, h, scale) {
  execFileSync(chrome, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--force-device-scale-factor=' + scale, '--window-size=' + w + ',' + h,
    '--virtual-time-budget=25000', '--screenshot=' + png, url,
  ], { stdio: 'ignore' });
}

/**
 * 좁은 화면은 --window-size 로 못 만든다.
 * 크롬 헤드리스가 창을 최소 491px 정도로 잡아서, 배치는 491px 기준으로 해놓고
 * 캡처만 요청한 폭으로 잘라낸다. 그래서 오른쪽에 있는 것이 잘려나가고
 * "사라졌다"고 착각하게 된다. (2026-09-09 에 실제로 겪었다)
 *
 * 진짜 좁은 화면을 보려면 그 폭짜리 iframe 안에 넣어야 한다.
 */
function mobileFrame(file, w, h) {
  const frame = path.join(OUT, '_frame.html');
  fs.writeFileSync(frame,
    '<!doctype html><meta charset="utf-8">'
    + '<style>html,body{margin:0;background:#d8d8d8}'
    + 'iframe{display:block;width:' + w + 'px;height:' + h + 'px;border:0;background:#fff}</style>'
    + '<iframe src="' + fileURL(file) + '"></iframe>');
  return frame;
}

for (const [label, file, h] of made) {
  shot(path.join(OUT, label + '.png'), fileURL(file), 1400, h, 1.5);
  console.log(label.padEnd(3) + ' → _미리보기/' + label + '.png');

  const frame = mobileFrame(file, 390, Math.round(h * 1.5));
  shot(path.join(OUT, label + '_모바일.png'), fileURL(frame), 400, Math.round(h * 1.5) + 10, 1.5);
  console.log(label.padEnd(3) + ' → _미리보기/' + label + '_모바일.png  (390px 폭)');
}
try { fs.unlinkSync(path.join(OUT, '_frame.html')); } catch (e) { /* 남아도 상관없다 */ }
