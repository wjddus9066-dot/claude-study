/**
 * 팔레트.js — 오늘의 재테크온도의 색 (moneyweather)
 *
 * 이 프로젝트에서 색이 정의된 곳은 여기 하나다.
 *
 *   팔레트.js
 *       ├─ 생성/md2html.js      → 글 (article.html / article-tistory.html)
 *       └─ 생성/이미지렌더.js    → 그림 (04_이미지/**.png)
 *
 * 로고 이미지의 픽셀을 직접 세어 뽑은 색이다. 설명은 00_브랜드/색상.md
 *
 * 색을 바꾸려면 여기만 고치고 두 명령을 다시 돌리면 된다.
 *   node 05_자동화/생성/이미지렌더.js
 *   node 05_자동화/생성/md2html.js <draft.md>
 */

'use strict';

const C = {
  ivory: '#FEF8F3',   // 페이지 바탕 — 로고 배경색
  cream: '#FAF2E8',   // 박스 바탕
  creamD: '#F6EDE2',  // 표 머리줄, 코드 블록
  line: '#EADFD2',    // 경계선
  lineD: '#D9CBBB',   // 차트 축선처럼 조금 더 진한 선
  grid: '#EFE4D7',    // 차트 격자선 — 있는 듯 없는 듯해야 한다
  navy: '#1A3360',    // 본문 글자 — 로고 글자색
  navyD: '#0C2657',   // 가장 강한 강조 — 로고 외곽선
  muted: '#5E6E8F',   // 출처·꼬리말 (대비 4.86, 본문 글씨의 최소선)
  mutedL: '#8494B0',  // 캡션처럼 큰 글씨에만 (본문에 쓰지 않는다)
  faint: '#A6B2C9',   // 화살표 같은 장식
  pink: '#F492A6',    // 장식 전용 — 글자색으로 쓰지 않는다 (대비 2.10)
  pinkBg: '#FCE9ED',
  rose: '#B94A65',    // 링크, 강조 글자 (대비 4.71)
  roseD: '#C0546E',   // 소제목 (큰 글씨 전용, 대비 4.21)
  gold: '#F7CE5A',    // 장식 전용 — 글자색으로 쓰지 않는다 (대비 1.43)
  goldBg: '#FDF6E6',
};

const FONT = "'Malgun Gothic','맑은 고딕',-apple-system,'Segoe UI',sans-serif";
const MONO = "Consolas,'D2Coding','Malgun Gothic','맑은 고딕',monospace";

/**
 * 이미지 HTML에 주입할 CSS 변수 블록.
 *
 * 이미지 소스는 색을 직접 적지 않고 var(--navy) 처럼 쓴다.
 * 그래야 팔레트를 바꿨을 때 그림도 같이 바뀐다.
 */
function cssVars() {
  const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  const vars = Object.entries(C).map(([k, v]) => `    --${kebab(k)}:${v};`);
  return `:root{\n${vars.join('\n')}\n    --font:${FONT};\n  }`;
}

module.exports = { C, FONT, MONO, cssVars };
