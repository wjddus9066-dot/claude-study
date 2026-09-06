#!/usr/bin/env node
/**
 * md2html.js — 초안 마크다운을 발행용 HTML로 변환 (moneyweather)
 *
 * 두 가지를 만든다.
 *   1) 읽기용 완성 페이지  — 브라우저에서 바로 보이는 단독 HTML
 *   2) Tistory 붙여넣기용 조각 — <body> 안쪽만 담은 HTML
 *
 * 의존성 없음. Node 18+.
 *
 * 사용법
 *   node md2html.js <draft.md 경로> [출력폴더]
 *
 * 예
 *   node 05_자동화/생성/md2html.js \
 *     03_콘텐츠/초안/2026-09-05_기준금리3.00_대출금리_반영시점/draft.md
 *
 * 처리 규칙
 *   - 상단 메타 블록(> 상태: ... 로 시작하는 인용문)은 발행본에서 제외한다
 *   - HTML 주석은 제거한다 (내부 메모)
 *   - 이미지 경로는 --img 로 지정한 접두어를 붙인다
 *   - 표, 인용문, 체크리스트, 코드블록, 굵게, 링크를 지원한다
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- 인라인

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}

// ---------------------------------------------------------------- 변환

function convert(md) {
  // HTML 주석 제거 (내부 메모)
  md = md.replace(/<!--[\s\S]*?-->/g, '');

  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  let metaSkipped = false;

  const flushTable = () => {
    const rows = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
    if (rows.length < 2) return;

    const cells = (r) =>
      r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    const headEmpty = head.every((h) => h === '');

    out.push('<div class="table-wrap"><table>');
    if (!headEmpty) {
      out.push('<thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead>');
    }
    out.push('<tbody>');
    for (const r of body) {
      out.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
    }
    out.push('</tbody></table></div>');
  };

  const flushQuote = () => {
    const buf = [];
    while (i < lines.length && /^\s*>/.test(lines[i])) {
      buf.push(lines[i].replace(/^\s*>\s?/, ''));
      i++;
    }
    const paras = buf
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    out.push('<blockquote>');
    paras.forEach((p) => out.push(`<p>${inline(p.replace(/\n/g, ' '))}</p>`));
    out.push('</blockquote>');
  };

  const flushList = () => {
    const items = [];
    let checklist = false;
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      let t = lines[i].replace(/^\s*[-*]\s+/, '');
      if (/^\[[ xX]\]\s*/.test(t)) {
        checklist = true;
        t = t.replace(/^\[[ xX]\]\s*/, '');
      }
      items.push(t);
      i++;
    }
    out.push(`<ul${checklist ? ' class="checklist"' : ''}>`);
    items.forEach((t) => out.push(`<li>${inline(t)}</li>`));
    out.push('</ul>');
  };

  const flushOl = () => {
    // 원문의 시작 번호를 유지한다.
    // 목록 중간에 주석 문단이 끼어 목록이 끊겨도 번호가 1로 리셋되지 않도록 한다.
    const start = Number((lines[i].match(/^\s*(\d+)\./) || [, 1])[1]);
    const items = [];
    while (i < lines.length && (/^\s*\d+\.\s+/.test(lines[i]) || /^\s{3,}\S/.test(lines[i]))) {
      if (/^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
      else if (items.length) items[items.length - 1] += '\n' + lines[i].trim();
      i++;
    }
    out.push(start === 1 ? '<ol>' : `<ol start="${start}">`);
    items.forEach((t) =>
      out.push(`<li>${t.split('\n').map(inline).join('<br>')}</li>`)
    );
    out.push('</ol>');
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    // 상단 메타 블록 1회 제거
    if (!metaSkipped && /^>\s*상태:/.test(line)) {
      while (i < lines.length && /^\s*>/.test(lines[i])) i++;
      metaSkipped = true;
      continue;
    }

    if (/^```/.test(line)) {
      i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^\s*\|/.test(line)) { flushTable(); continue; }
    if (/^\s*>/.test(line)) { flushQuote(); continue; }
    if (/^\s*[-*]\s+/.test(line)) { flushList(); continue; }
    if (/^\s*\d+\.\s+/.test(line)) { flushOl(); continue; }

    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lv = h[1].length;
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }

    // 문단 (연속 줄 묶기)
    const buf = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*[|>#-]/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    if (buf.length) out.push(`<p>${buf.map((b) => inline(b.trim())).join(' ')}</p>`);
  }

  return out.join('\n');
}

// ---------------------------------------------------------------- 템플릿

function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root{
    --ink:#1d2b3a; --muted:#5d7185; --line:#dde5ed; --bg:#fbfcfd;
    --accent:#2c5f8f; --mark:#e0a52c; --markbg:#fff7e6; --panel:#fff;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--ink);
    font-family:'Malgun Gothic','맑은 고딕',-apple-system,'Segoe UI',sans-serif;
    line-height:1.75; font-size:17px;
  }
  .wrap{max-width:760px; margin:0 auto; padding:56px 20px 96px}
  h1{font-size:2.05rem; line-height:1.32; letter-spacing:-1px; margin:0 0 28px}
  h2{font-size:1.5rem; letter-spacing:-.5px; margin:56px 0 18px; padding-top:20px; border-top:2px solid var(--line)}
  h3{font-size:1.18rem; margin:34px 0 12px; color:var(--accent)}
  h4{font-size:1.02rem; margin:24px 0 10px}
  p{margin:0 0 18px}
  strong{font-weight:700}
  a{color:var(--accent)}
  hr{border:0; border-top:1px solid var(--line); margin:40px 0}
  blockquote{
    margin:26px 0; padding:20px 24px;
    background:var(--markbg); border-left:5px solid var(--mark); border-radius:0 8px 8px 0;
  }
  blockquote p{margin:0 0 12px} blockquote p:last-child{margin:0}
  .table-wrap{overflow-x:auto; margin:24px 0}
  table{border-collapse:collapse; width:100%; font-size:.95rem; background:var(--panel)}
  th,td{border:1px solid var(--line); padding:11px 13px; text-align:left; vertical-align:top}
  th{background:#f1f5f9; font-weight:700; white-space:nowrap}
  pre{
    background:#f4f6f8; border:1px solid var(--line); border-radius:8px;
    padding:16px 18px; overflow-x:auto; margin:24px 0;
  }
  /* ①②③ 같은 기호가 깨지지 않도록 한글 폰트를 폴백에 둔다 */
  code{font-family:Consolas,'D2Coding','Malgun Gothic','맑은 고딕',monospace; font-size:.9rem}
  pre code{line-height:1.65}
  p code,li code,td code{background:#eef2f6; padding:2px 6px; border-radius:4px}
  ul,ol{margin:0 0 20px; padding-left:24px}
  li{margin-bottom:8px}
  ul.checklist{list-style:none; padding-left:4px}
  ul.checklist li{padding-left:28px; position:relative}
  ul.checklist li::before{
    content:''; position:absolute; left:0; top:.42em;
    width:15px; height:15px; border:2px solid var(--accent); border-radius:4px;
  }
  figure{margin:32px 0}
  figure img{width:100%; height:auto; border:1px solid var(--line); border-radius:10px; display:block}
  figcaption{margin-top:10px; font-size:.86rem; color:var(--muted); text-align:center}
  .meta{color:var(--muted); font-size:.9rem; margin:-16px 0 34px}
  @media (max-width:640px){ body{font-size:16px} .wrap{padding:36px 16px 72px} h1{font-size:1.62rem} }
</style>
</head>
<body>
<article class="wrap">
${bodyHtml}
</article>
</body>
</html>
`;
}

// ---------------------------------------------------------------- main

const [src, outDir] = process.argv.slice(2);
if (!src) {
  console.error('사용법: node md2html.js <draft.md 경로> [출력폴더]');
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error('파일을 찾을 수 없습니다: ' + src);
  process.exit(1);
}

const md = fs.readFileSync(src, 'utf8');
const title = (md.match(/^#\s+(.+)$/m) || [, '제목 없음'])[1].trim();
let body = convert(md);

/**
 * 이미지 삽입
 *
 * 같은 폴더의 images.json 이 있으면 그 지시대로 <figure>를 끼워 넣는다.
 * 형식: [{ "after": "본문에 등장하는 고유 문자열", "src": "...", "alt": "...", "caption": "..." }]
 * "after"가 비어 있으면 글 맨 앞(대표 이미지)에 넣는다.
 */
const imgSpec = path.join(path.dirname(src), 'images.json');
if (fs.existsSync(imgSpec)) {
  const specs = JSON.parse(fs.readFileSync(imgSpec, 'utf8'));
  let placed = 0;
  for (const s of specs) {
    const fig =
      `<figure><img src="${s.src}" alt="${esc(s.alt || '')}" loading="lazy">` +
      (s.caption ? `<figcaption>${inline(s.caption)}</figcaption>` : '') +
      '</figure>';

    if (!s.after) {
      body = fig + '\n' + body;
      placed++;
      continue;
    }
    const idx = body.indexOf(s.after);
    if (idx === -1) {
      console.warn(`  [건너뜀] 삽입 위치를 찾지 못했습니다: "${s.after.slice(0, 40)}..."`);
      continue;
    }
    const at = idx + s.after.length;
    body = body.slice(0, at) + '\n' + fig + body.slice(at);
    placed++;
  }
  console.log(`이미지 ${placed}/${specs.length}개 삽입`);
}

const dir = outDir || path.dirname(src);
fs.mkdirSync(dir, { recursive: true });

const full = path.join(dir, 'article.html');
const frag = path.join(dir, 'article-tistory.html');

fs.writeFileSync(full, page(title, body), 'utf8');
fs.writeFileSync(
  frag,
  '<!-- Tistory HTML 모드에 이 내용을 붙여넣으세요. 이미지는 에디터에서 별도 업로드합니다. -->\n' +
    body +
    '\n',
  'utf8'
);

console.log('제목: ' + title);
console.log('생성: ' + full);
console.log('생성: ' + frag);
