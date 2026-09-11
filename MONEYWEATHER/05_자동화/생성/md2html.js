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

// ---------------------------------------------------------------- 마커 블록

/**
 * [마커] ... [/마커] 사이를 읽어온다.
 *
 * 닫는 마커를 못 찾으면 조용히 넘어가지 않고 멈춘다.
 *
 * 실제로 「[/문답]---」처럼 닫는 마커에 다른 글자가 붙은 적이 있다.
 * 파서가 그 줄을 닫는 마커로 못 알아봐서 그 뒤 본문 전체가 FAQ 안으로 빨려 들어갔고,
 * 발행본에 [체크] [안내] [FOOTER] 같은 마커 글자가 그대로 실려 나갔다.
 * 소제목도 <h2>가 아니라 글자 「## 」로 나갔다.
 *
 * 조용히 잘못되는 것이 제일 위험하다. 그래서 멈춘다.
 */
function readBlock(lines, i, name) {
  const closing = new RegExp('^\\[\\/' + name + '\\]\\s*$');
  const looksClosing = new RegExp('^\\[\\/' + name + '\\]');
  const buf = [];
  while (i < lines.length && !closing.test(lines[i])) {
    if (looksClosing.test(lines[i])) {
      console.error(`\n[오류] [/${name}] 뒤에 다른 글자가 붙어 있습니다.`);
      console.error(`       ${i + 1}번째 줄: ${lines[i]}`);
      console.error('       닫는 마커는 그 줄에 혼자 있어야 합니다.');
      process.exit(1);
    }
    buf.push(lines[i++]);
  }
  if (i >= lines.length) {
    console.error(`\n[오류] [${name}] 를 열고 [/${name}] 로 닫지 않았습니다.`);
    process.exit(1);
  }
  return [buf, i + 1];
}

// ---------------------------------------------------------------- 변환

function convert(md) {
  // HTML 주석 제거 (내부 메모)
  md = md.replace(/<!--[\s\S]*?-->/g, '');

  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  let metaSkipped = false;
  let footerOpen = false;

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

    // [안내] ... [/안내] — 글 맨 앞의 작은 안내 박스
    // 본문보다 눈에 띄면 안 된다. 독자가 주의사항부터 읽게 만들지 않기 위한 것.
    if (/^\[안내\]\s*$/.test(line)) {
      let buf;
      [buf, i] = readBlock(lines, i + 1, '안내');
      out.push('<aside class="pre-note">');
      buf
        .join('\n')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p) => out.push(`<p>${inline(p.replace(/\n/g, ' '))}</p>`));
      out.push('</aside>');
      continue;
    }

    // [정답] ... [/정답] — 제목의 질문에 대한 한 문장 답
    //
    // 글 맨 앞에 둔다. 사람은 스크롤하기 전에 답을 얻고,
    // AI는 이 문단만 잘라가도 말이 되는 답을 얻는다. (AEO)
    // 그래서 이 박스 안에서는 "위에서 말했듯이" 같은 앞뒤 의존 표현을 쓰지 않는다.
    if (/^\[정답\]\s*$/.test(line)) {
      let buf;
      [buf, i] = readBlock(lines, i + 1, '정답');
      out.push('<aside class="answer-box">');
      buf.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
         .forEach((p) => {
           // 「- 」로 시작하는 덩어리는 목록으로 낸다.
           // 이유가 둘 이상일 때 「첫째·둘째」로 갈라놔야 AI가 골라 인용하기 좋다. (AEO)
           if (/^-\s+/.test(p)) {
             out.push('<ul class="answer-list">');
             p.split('\n').forEach((li) => {
               const t = li.replace(/^\s*-\s+/, '').trim();
               if (t) out.push(`<li>${inline(t)}</li>`);
             });
             out.push('</ul>');
             return;
           }
           out.push(`<p>${inline(p.replace(/\n/g, ' '))}</p>`);
         });
      out.push('</aside>');
      continue;
    }

    // [체크] ... [/체크] — 독자가 오늘 직접 할 수 있는 것
    //
    // 읽고 끝나는 글과 확인하게 만드는 글의 차이다.
    // 한 줄에 하나씩, 순서대로 따라 할 수 있게 쓴다.
    if (/^\[체크\]\s*$/.test(line)) {
      let 체크buf;
      [체크buf, i] = readBlock(lines, i + 1, '체크');
      const items = 체크buf
        .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
        .filter(Boolean);
      // 여는 줄과 닫는 줄을 한 태그씩 따로 둔다.
      // 인라인 스타일러가 줄 단위로 컨테이너를 세기 때문이다.
      out.push('<div class="do-box">');
      out.push('<ol>');
      items.forEach((t) => out.push(`<li>${inline(t)}</li>`));
      out.push('</ol>');
      out.push('</div>');
      continue;
    }

    // [문답] ... [/문답] — 자주 묻는 질문
    //
    // 「Q. 」로 시작하는 줄이 질문, 그다음 줄들이 답이다.
    // 질문 하나와 답 하나가 짝으로 떨어져 있어야 AI가 골라 인용할 수 있다. (AEO)
    if (/^\[문답\]\s*$/.test(line)) {
      let buf;
      [buf, i] = readBlock(lines, i + 1, '문답');
      out.push('<div class="qa-box">');
      buf.join('\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => {
        const [first, ...rest] = b.split('\n');
        const q = first.replace(/^Q\.\s*/, '').trim();
        out.push('<div class="qa">');
        out.push(`<p class="qa-q">${inline(q)}</p>`);
        rest.filter(Boolean).forEach((a) =>
          out.push(`<p class="qa-a">${inline(a.replace(/^A\.\s*/, '').trim())}</p>`));
        out.push('</div>');
      });
      out.push('</div>');
      continue;
    }

    // [FOOTER] — 이 줄 아래는 본문이 아니라 꼬리말이다.
    // 출처·주의사항처럼 독자가 굳이 읽지 않아도 되는 내용을 작게 처리한다.
    // 본문의 마지막 문장이 진짜 마지막 문장으로 남게 하기 위한 장치다.
    if (/^\[FOOTER\]\s*$/.test(line)) {
      out.push('<div class="article-footer">');
      footerOpen = true;
      i++;
      continue;
    }

    // 인라인 출처: 본문 중 수치·표 바로 아래에 붙이는 한 줄
    //   [출처] 한국은행 · 2026-08-27 적용
    const srcNote = line.match(/^\[출처\]\s*(.+)$/);
    if (srcNote) {
      out.push(`<p class="src-note">${inline(srcNote[1])}</p>`);
      i++;
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
      // h2는 자기 윗선을 갖고 있다. 바로 앞의 --- 까지 그리면 줄이 두 개로 겹친다.
      if (lv === 2 && out[out.length - 1] === '<hr>') out.pop();
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

  if (footerOpen) out.push('</div>');

  return out.join('\n');
}

// ---------------------------------------------------------------- 정합성 검사

/**
 * 본문과 이미지가 어긋나지 않는지 검사한다.
 *
 * 실제로 두 번 놓쳤던 실패 유형을 잡기 위한 것이다.
 *   1) 본문에서 금지 표현을 걷어냈는데 이미지 소스에는 그대로 남음
 *   2) 본문에서 뺀 숫자·주장이 이미지에만 살아남아 서로 다른 말을 함
 *
 * 금지 표현 목록은 00_브랜드/글쓰기톤.md §5.1의 코드블록에서 읽는다.
 * 목록을 고칠 때 이 파일을 건드릴 필요가 없도록 한 것이다.
 */

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

function loadBannedPhrases(root) {
  if (!root) return [];
  const p = path.join(root, '00_브랜드', '글쓰기톤.md');
  if (!fs.existsSync(p)) return [];
  const md = fs.readFileSync(p, 'utf8');

  // §5.1 아래 첫 ```text 블록
  const sec = md.split('### 5.1')[1];
  if (!sec) return [];
  const block = sec.match(/```text\n([\s\S]*?)```/);
  if (!block) return [];

  return block[1]
    .split(/\s{2,}|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** 이미지 HTML에서 눈에 보이는 텍스트만 뽑는다. 출처 표기줄(.src)은 제외. */
function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div class="src"[\s\S]*?<\/div>/gi, '') // 출처는 정확해야 하므로 검사 제외
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** 의미 있는 숫자만: %, 만원, 억원 등이 붙은 것 */
function meaningfulNumbers(text) {
  const out = new Set();
  const re = /([0-9]+(?:\.[0-9]+)?)\s*(%포인트|%p|%|만원|억원|배)/g;
  let m;
  while ((m = re.exec(text))) out.add(m[1] + m[2]);
  return out;
}

function checkConsistency(srcPath, bodyMd, imageSpecs) {
  const root = findProjectRoot(path.dirname(srcPath));
  const banned = loadBannedPhrases(root);
  const problems = [];
  const notes = [];

  // 1) 본문 금지 표현
  for (const b of banned) {
    if (bodyMd.includes(b)) problems.push(`본문에 금지 표현: "${b}"`);
  }

  // 2) 이미지 소스 검사
  //    그림은 글과 같은 이름의 폴더에 들어 있다.
  //    03_콘텐츠/초안/2026-09-07_ISA_.../  ->  04_이미지/2026-09-07_ISA_.../_소스/
  const post = path.basename(path.dirname(srcPath));
  const srcDir = root ? path.join(root, '04_이미지', post, '_소스') : null;

  if (srcDir && fs.existsSync(srcDir)) {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.html'));

    const bodyNums = meaningfulNumbers(bodyMd);

    for (const f of files) {
      const text = visibleText(fs.readFileSync(path.join(srcDir, f), 'utf8'));

      for (const b of banned) {
        if (text.includes(b)) problems.push(`${f} 에 금지 표현: "${b}"`);
      }

      const orphans = [...meaningfulNumbers(text)].filter((n) => !bodyNums.has(n));
      if (orphans.length) {
        notes.push(`${f} — 본문에 없는 숫자: ${orphans.join(', ')}`);
      }
    }
    if (!files.length) notes.push(`04_이미지/${post}/_소스 가 비어 있습니다.`);
  } else if (root) {
    notes.push(`04_이미지/${post}/_소스 폴더가 없습니다. 그림 소스는 글과 같은 이름의 폴더에 둡니다.`);
  }

  // 3) 리포트
  if (problems.length) {
    console.log('\n[정합성 경고]');
    problems.forEach((p) => console.log('  X ' + p));
  }
  if (notes.length) {
    console.log('\n[확인 필요] 이미지에만 있는 숫자입니다. 본문과 다른 말을 하고 있지 않은지 보세요.');
    notes.forEach((n) => console.log('  · ' + n));
    console.log('  (그래프 축 눈금처럼 정상인 경우도 있습니다)');
  }
  if (!problems.length && !notes.length) {
    console.log('정합성 검사: 이상 없음');
  }
}

// ---------------------------------------------------------------- 브랜드 색

/**
 * 색은 05_자동화/팔레트.js 한 곳에만 있다. (설명: 00_브랜드/색상.md)
 * 글과 그림이 같은 파일을 본다. HTML 쪽에 색을 직접 적지 않는다.
 */
const { C, FONT, MONO } = require('../팔레트.js');

/**
 * 요소별 스타일 — 웹 <style>과 티스토리 인라인이 같은 정의를 쓴다.
 *
 * 두 곳에 따로 적으면 반드시 어긋난다. 그래서 한 벌만 둔다.
 * 키가 「컨테이너 태그」 형태면 그 안에 있을 때만 덧붙는다.
 */
const STYLE = {
  h1: `font-size:1.95rem; line-height:1.34; letter-spacing:-1px; font-weight:800; color:${C.navyD}; margin:0 0 28px;`,
  h2: `font-size:1.45rem; line-height:1.4; letter-spacing:-.5px; font-weight:800; color:${C.navyD}; margin:56px 0 18px; padding-top:20px; border-top:2px solid ${C.line};`,
  h3: `font-size:1.16rem; line-height:1.45; font-weight:700; color:${C.roseD}; margin:34px 0 12px;`,
  h4: `font-size:1.02rem; font-weight:700; color:${C.navy}; margin:24px 0 10px;`,
  p: `margin:0 0 18px;`,
  strong: `font-weight:700; color:${C.navyD};`,
  em: `font-style:normal; background:linear-gradient(transparent 62%, ${C.pinkBg} 62%);`,
  a: `color:${C.rose}; text-decoration:underline; text-underline-offset:2px;`,
  hr: `border:0; border-top:1px solid ${C.line}; margin:40px 0;`,

  blockquote: `margin:26px 0; padding:20px 24px; background:${C.goldBg}; border-left:5px solid ${C.gold}; border-radius:0 8px 8px 0;`,
  'blockquote p': `margin:0 0 12px;`,

  '.table-wrap': `overflow-x:auto; max-width:100%; margin:24px 0;`,
  table: `border-collapse:collapse; width:100%; max-width:100%; font-size:.95rem; background:${C.ivory};`,
  th: `border:1px solid ${C.line}; padding:11px 13px; text-align:left; vertical-align:top; background:${C.creamD}; font-weight:700; color:${C.navyD}; word-break:keep-all;`,
  td: `border:1px solid ${C.line}; padding:11px 13px; text-align:left; vertical-align:top;`,

  pre: `background:${C.creamD}; border:1px solid ${C.line}; border-radius:8px; padding:16px 18px; overflow-x:auto; max-width:100%; margin:24px 0; line-height:1.65; font-size:.86rem;`,
  code: `font-family:${MONO}; font-size:.9rem;`,

  ul: `margin:0 0 20px; padding-left:24px;`,
  ol: `margin:0 0 20px; padding-left:24px;`,
  li: `margin-bottom:8px;`,

  figure: `margin:32px 0; max-width:100%;`,
  'figure img': `width:100%; height:auto; border:1px solid ${C.line}; border-radius:10px; display:block;`,
  figcaption: `margin-top:10px; font-size:.86rem; color:${C.muted}; text-align:center;`,

  // 안내(면책)와 꼬리말에는 따로 스타일을 주지 않는다.
  // 어떻게 보일지는 글 쓰는 쪽에서 정한다. 여기서는 본문 그대로 흘려보낸다.

  // 한 문장 정답 — 글에서 가장 먼저 눈에 들어와야 하는 한 덩어리
  // 본문보다 크고 진하게. 스크롤하기 전에 답을 주는 자리다.
  '.answer-box': `background:${C.cream}; border-left:6px solid ${C.pink}; border-radius:0 10px 10px 0; padding:22px 26px; margin:28px 0 34px;`,
  '.answer-box p': `margin:0 0 10px; font-size:1.02rem; line-height:1.72; color:${C.navyD};`,
  '.answer-box p:last-child': `margin:0;`,
  '.answer-box ul': `margin:2px 0 12px; padding-left:22px;`,
  '.answer-box li': `margin-bottom:9px; font-size:1.02rem; line-height:1.72; color:${C.navyD};`,
  '.answer-box strong': `color:${C.navyD};`,

  // 오늘 할 것 — 읽고 끝나지 않게 만드는 상자
  '.do-box': `background:${C.cream}; border:1px solid ${C.line}; border-radius:10px; padding:22px 26px 22px 20px; margin:26px 0;`,
  '.do-box ol': `margin:0; padding-left:24px;`,
  '.do-box li': `margin-bottom:12px; line-height:1.66;`,
  '.do-box li:last-child': `margin-bottom:0;`,

  // 자주 묻는 질문 — 질문 하나와 답 하나가 눈으로도 짝지어 보이게
  '.qa-box': `margin:26px 0;`,
  '.qa': `border-top:1px solid ${C.line}; padding:18px 0 4px;`,
  '.qa-q': `margin:0 0 8px; font-weight:700; color:${C.navyD};`,
  '.qa-a': `margin:0 0 10px; color:${C.navy};`,

  // 인라인 출처 — 수치·표 바로 아래 붙는 한 줄
  '.src-note': `margin:-8px 0 22px; padding-left:12px; border-left:3px solid ${C.pink}; color:${C.muted}; font-size:.83rem; line-height:1.6;`,
  '.src-note a': `color:${C.muted};`,
  '.src-note strong': `color:${C.muted}; font-weight:700;`,
};

// 본문을 감싸는 바탕. 티스토리에서는 이게 없으면 스킨 배경이 그대로 비친다.
const SHELL = `color:${C.navy}; font-family:${FONT}; line-height:1.75; font-size:17px; letter-spacing:-.01em; max-width:100%; overflow-wrap:break-word; word-break:keep-all;`;

// ---------------------------------------------------------------- 인라인 스타일

const TAG_RE = /<(h[1-4]|p|a|strong|em|code|pre|ul|ol|li|table|th|td|figure|img|figcaption|blockquote|hr|aside|div)((?:\s[^>]*?)?)(\/?)>/g;

/** 같은 속성이 두 번 들어가지 않게 정리한다. 뒤에 온 값이 이긴다. */
function tidy(css) {
  const seen = new Map();
  for (const d of css.split(';')) {
    const at = d.indexOf(':');
    if (at < 0) continue;
    const prop = d.slice(0, at).trim();
    if (prop) seen.set(prop, d.slice(at + 1).trim());
  }
  return [...seen].map(([k, v]) => `${k}:${v}`).join('; ');
}

/**
 * 티스토리는 <style> 블록을 붙여넣을 수 없다. 그래서 태그마다 style=""을 직접 박는다.
 *
 * 우리가 만든 HTML만 처리하면 되므로 CSS 엔진이 필요하지 않다.
 * 블록 요소가 한 줄에 하나씩 나오는 구조라, 줄 단위로 컨테이너만 추적하면 충분하다.
 */
function inlineStyles(html) {
  const ctx = [];               // 현재 열려 있는 컨테이너
  const out = [];

  for (const raw of html.split('\n')) {
    // 이 줄에서 닫히는 컨테이너를 먼저 걷어낸다
    if (/^<\/(aside|div|blockquote)>/.test(raw)) ctx.pop();

    // 한 줄 안에서 끝나는 컨테이너 (figure, src-note)
    let lineCtx = null;
    if (/^<figure/.test(raw)) lineCtx = 'figure';
    else if (/class="src-note"/.test(raw)) lineCtx = '.src-note';

    const here = lineCtx || ctx[ctx.length - 1] || null;

    out.push(
      raw.replace(TAG_RE, (m, tag, attrs, selfClose) => {
        const cls = (attrs.match(/class="([^"]*)"/) || [, ''])[1];

        // class가 붙은 요소는 그 클래스의 디자인을 그대로 쓴다
        let css = '';
        for (const c of cls.split(/\s+/).filter(Boolean)) {
          if (STYLE['.' + c]) css += STYLE['.' + c];
        }
        if (!css) {
          if (STYLE[tag]) css += STYLE[tag];
          if (here && STYLE[`${here} ${tag}`]) css += STYLE[`${here} ${tag}`];
        }
        if (!css) return m;

        return `<${tag}${attrs} style="${tidy(css)}"${selfClose}>`;
      })
    );

    // 이 줄에서 열리는 컨테이너
    // table-wrap 은 여기 넣지 않는다. 안쪽 태그에 따로 물려줄 스타일이 없고,
    // 닫는 줄이 </tbody></table></div> 라서 위의 pop 과 짝이 맞지 않는다.
    const open = raw.match(/^<(?:aside|div) class="(pre-note|article-footer|answer-box|do-box|qa-box)"/);
    if (open) ctx.push('.' + open[1]);
    else if (/^<blockquote/.test(raw)) ctx.push('blockquote');
  }

  // 좌우 여백을 조금 준다. 없으면 글자가 배경 끝에 붙는다.
  return `<div style="${SHELL} padding:10px 18px;">\n${out.join('\n')}\n</div>`;
}

// ---------------------------------------------------------------- 템플릿

function page(title, bodyHtml) {
  // 인라인으로 못 넣는 것만 여기 남긴다 (가상요소, 미디어쿼리)
  const extraCss = `
  ul.checklist{list-style:none; padding-left:4px}
  ul.checklist li{padding-left:28px; position:relative}
  ul.checklist li::before{
    content:''; position:absolute; left:0; top:.42em;
    width:15px; height:15px; border:2px solid ${C.pink}; border-radius:4px;
  }
  .table-wrap + .src-note, figure + .src-note{margin-top:-12px}
  a:hover{color:${C.navyD}}
  @media (max-width:640px){
    body{font-size:16px}
    .wrap{padding:36px 16px 72px}
    h1{font-size:1.6rem}
    h2{font-size:1.28rem}
  }`;

  const rules = Object.entries(STYLE)
    .map(([sel, decl]) => `  ${sel}{${decl.replace(/\s+/g, ' ').trim()}}`)
    .join('\n');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0; ${SHELL}}
  .wrap{max-width:760px; margin:0 auto; padding:56px 20px 96px}
${rules}
${extraCss}
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
let specs = [];
if (fs.existsSync(imgSpec)) {
  specs = JSON.parse(fs.readFileSync(imgSpec, 'utf8'));
  let placed = 0;
  for (const s of specs) {
    const fig =
      `<figure><img src="${s.src}" alt="${esc(s.alt || '')}" loading="lazy">` +
      (s.caption ? `<figcaption>${inline(s.caption)}</figcaption>` : '') +
      '</figure>';

    // after 가 비어 있으면 대표 이미지다. 제목 바로 아래에 넣는다.
    // 글은 제목으로 시작하고, 그림은 그다음이다.
    if (!s.after) {
      const h1 = body.match(/^<h1>[\s\S]*?<\/h1>\n?/);
      body = h1 ? h1[0] + fig + '\n' + body.slice(h1[0].length) : fig + '\n' + body;
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

// ---------------------------------------------------------------- 깃허브 미리보기

/**
 * 미리보기.md — 깃허브에서 이미지까지 같이 보기 위한 파일
 *
 * 깃허브는 HTML을 화면으로 그려주지 않는다. article.html을 눌러도 코드만 보인다.
 * 마크다운은 그려주므로, 이미지를 끼워 넣은 마크다운을 따로 하나 만든다.
 *
 * draft.md에서 만들어내므로 원고와 어긋날 일이 없다.
 */
function previewMd(rawMd, specs) {
  let t = rawMd.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');

  // 내부용 메타 블록은 뺀다 (발행본에 안 들어가는 내용)
  t = t.replace(/^>\s*상태:[\s\S]*?(?=\n\s*\n)/m, '').replace(/^\n+/, '');

  // 본문 마커를 깃허브가 알아보는 형태로
  t = t.replace(/^\[안내\]\s*$/m, '> [!NOTE]');
  t = t.replace(/^\[FOOTER\]\s*$/m, '---');
  t = t.replace(/^\[출처\]\s*(.+)$/gm, '<sub>출처 · $1</sub>');

  // [!NOTE] 다음 문단들을 인용문으로 만든다
  const lines = t.split('\n');
  let inNote = false;
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].trim() === '> [!NOTE]') { inNote = true; continue; }
    if (!inNote) continue;
    if (/^\[\/안내\]/.test(lines[k])) { lines[k] = ''; inNote = false; continue; }
    if (lines[k].trim() === '') { lines[k] = '>'; continue; }
    lines[k] = '> ' + lines[k];
  }
  t = lines.join('\n').replace(/\n>\n(?=\n)/g, '\n');

  // 이미지 삽입 — 표 행처럼 마크다운과 모양이 다른 위치도 찾을 수 있게
  // 글자만 남겨서 비교한다
  const norm = (s) =>
    s.replace(/<[^>]+>/g, '').replace(/[\s*|#>`_~]/g, '');

  const out = t.split('\n');
  let placed = 0;
  for (const s of specs) {
    const pic = `\n![${(s.alt || '').replace(/[[\]]/g, '')}](${s.src})` +
                (s.caption ? `\n\n<sub>${s.caption}</sub>` : '') + '\n';
    // 대표 이미지는 제목(# ) 바로 아래로
    if (!s.after) {
      const h = out.findIndex((l) => /^#\s/.test(l));
      if (h === -1) out.unshift(pic);
      else out.splice(h + 1, 0, pic);
      placed++;
      continue;
    }

    const want = norm(s.after);
    // 앵커가 여러 줄이면 마지막 줄로 찾는다
    const tail = want.split('\n').filter(Boolean).pop() || want;
    const at = out.findIndex((l) => l.trim() && norm(l) && tail.endsWith(norm(l)) && norm(l).length > 5);
    if (at === -1) {
      console.warn(`  [미리보기] 삽입 위치를 찾지 못했습니다: "${(s.alt || s.src).slice(0, 30)}..."`);
      continue;
    }
    out.splice(at + 1, 0, pic);
    placed++;
  }
  console.log(`미리보기.md 이미지 ${placed}/${specs.length}개 삽입`);

  return '<!-- 이 파일은 md2html.js가 draft.md에서 자동으로 만듭니다. 직접 고치지 마세요. -->\n' +
         '<!-- 깃허브에서 이미지까지 같이 보기 위한 파일입니다. 발행본은 article-tistory.html 입니다. -->\n\n' +
         out.join('\n').replace(/\n{3,}/g, '\n\n');
}

const dir = outDir || path.dirname(src);
fs.mkdirSync(dir, { recursive: true });

const full = path.join(dir, 'article.html');
const frag = path.join(dir, 'article-tistory.html');
const prev = path.join(dir, '미리보기.md');

// 티스토리에 붙여넣는 본문에서는 맨 앞 <h1>을 뺀다.
//
// 제목은 티스토리 제목란에 직접 입력한다. 본문에 또 있으면 화면에 두 번 나온다.
// draft.md 의 「# 제목」은 파일 안에서 글을 알아보기 위한 것이고,
// article.html(내 컴퓨터에서 보는 미리보기)은 혼자 서는 페이지라 그대로 둔다.
//
// 그래서 발행본은 썸네일 이미지부터 시작한다.
const bodyForTistory = body.replace(/<h1>[\s\S]*?<\/h1>\s*/, '');

fs.writeFileSync(full, page(title, body), 'utf8');
fs.writeFileSync(
  frag,
  '<!-- Tistory HTML 모드에 이 내용을 붙여넣으세요. 이미지는 에디터에서 별도 업로드합니다. -->\n' +
    '<!-- 색은 태그마다 style="" 로 박혀 있습니다. 스킨 설정을 타지 않습니다. -->\n' +
    '<!-- 제목이 본문 맨 위에 들어 있습니다. 티스토리 제목란에도 같은 제목을 넣으세요. -->\n' +
    inlineStyles(bodyForTistory) +
    '\n',
  'utf8'
);

fs.writeFileSync(prev, previewMd(md, specs), 'utf8');

console.log('제목: ' + title);
console.log('생성: ' + full);
console.log('생성: ' + frag);
console.log('생성: ' + prev);

checkConsistency(src, md.split('\n').slice(6).join('\n').split('## [출처]')[0], []);
