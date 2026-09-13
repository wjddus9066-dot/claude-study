// 마크다운 → 티스토리 임시저장 (반자동 발행)
//
// 사용:
//   node scripts/tistory-draft.mjs data/글.md              # 임시저장까지
//   node scripts/tistory-draft.mjs data/글.md --dry-run    # 브라우저 없이 HTML만 확인
//   node scripts/tistory-draft.mjs data/글.md --inspect    # 에디터 구조 진단 덤프
//   node scripts/tistory-draft.mjs data/글.md --headless   # 창 숨기고 실행
//
// 발행 버튼은 누르지 않습니다. 임시저장까지만 하고, 확인 후 직접 발행하세요.
import { chromium } from 'playwright';
import { marked } from 'marked';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from './lib/frontmatter.mjs';

// Node 24 내장 .env 로더 (추가 의존성 불필요)
try {
  process.loadEnvFile('.env');
} catch {
  /* .env 없어도 dry-run 은 동작 */
}

const AUTH_PATH = '.auth/tistory.json';
const args = process.argv.slice(2);
const mdPath = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const inspect = args.includes('--inspect');
const headless = args.includes('--headless');

if (!mdPath) {
  console.error('사용법: node scripts/tistory-draft.mjs <마크다운파일> [--dry-run|--inspect|--headless]');
  process.exit(1);
}

// ── 1. 마크다운 읽고 HTML로 변환 ────────────────────────────────
const raw = await fs.readFile(mdPath, 'utf8');
const { meta, body } = parseFrontmatter(raw);

const title = meta.title || body.match(/^#\s+(.+)$/m)?.[1] || path.basename(mdPath, '.md');
const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [];
// 프론트매터에 title이 있으면 본문 첫 H1은 중복이라 제거
const contentMd = meta.title ? body.replace(/^#\s+.+$/m, '') : body;
const html = marked.parse(contentMd, { gfm: true, breaks: false });

console.log(`제목: ${title}`);
console.log(`태그: ${tags.length ? tags.join(', ') : '(없음)'}`);
console.log(`본문: ${html.length.toLocaleString()}자 (HTML)`);

if (dryRun) {
  await fs.mkdir('out', { recursive: true });
  const preview = `out/${path.basename(mdPath, '.md')}.preview.html`;
  const style =
    "body{max-width:740px;margin:40px auto;padding:0 20px;font-family:Pretendard,'Malgun Gothic',sans-serif;line-height:1.75}" +
    'img{max-width:100%}pre{background:#f4f4f5;padding:16px;border-radius:8px;overflow-x:auto}' +
    'code{background:#f4f4f5;padding:2px 5px;border-radius:4px}' +
    'blockquote{border-left:4px solid #ddd;margin:0;padding-left:16px;color:#555}' +
    'table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px 12px}';
  await fs.writeFile(
    preview,
    `<!doctype html><meta charset="utf-8"><title>${title}</title><style>${style}</style><h1>${title}</h1>${html}`
  );
  console.log(`\n[dry-run] 브라우저 없이 종료. 미리보기 → ${preview}`);
  process.exit(0);
}

// ── 2. 세션 확인 ────────────────────────────────────────────────
try {
  await fs.access(AUTH_PATH);
} catch {
  console.error(`\n✗ 로그인 세션이 없습니다 (${AUTH_PATH})`);
  console.error('  먼저 실행하세요:  node scripts/tistory-login.mjs');
  process.exit(1);
}

const blog = process.env.TISTORY_BLOG;
if (!blog) {
  console.error('\n✗ .env 에 TISTORY_BLOG 가 없습니다. 예:  TISTORY_BLOG=myblog');
  process.exit(1);
}

// ── 3. 에디터 열기 ──────────────────────────────────────────────
const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  storageState: AUTH_PATH,
  viewport: { width: 1440, height: 950 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();

async function fail(msg) {
  console.error(`\n✗ ${msg}`);
  try {
    await fs.mkdir('out', { recursive: true });
    await page.screenshot({ path: 'out/tistory-error.png', fullPage: true });
    console.error('  현재 화면 → out/tistory-error.png');
    console.error('  --inspect 로 다시 실행하면 구조를 덤프합니다.');
  } catch {}
  await browser.close();
  process.exit(1);
}

// "작성 중인 글이 있습니다" 같은 네이티브 확인창 → 취소(새 글로 시작)
page.on('dialog', (d) => {
  console.log(`  [알림창] ${d.message().slice(0, 60)} → 취소`);
  d.dismiss().catch(() => {});
});

const editorUrl = `https://${blog}.tistory.com/manage/newpost/?type=post`;
console.log(`\n에디터 접속: ${editorUrl}`);
await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3500);

if (page.url().includes('/auth/login') || page.url().includes('accounts.kakao.com')) {
  await fail('세션이 만료됐습니다. node scripts/tistory-login.mjs 를 다시 실행하세요.');
}

// ── 4. 진단 모드 ────────────────────────────────────────────────
if (inspect) {
  const dump = await page.evaluate(() => {
    const pick = (el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: (el.className || '').toString().slice(0, 80) || null,
      placeholder: el.getAttribute('placeholder') || null,
      text: (el.innerText || '').trim().slice(0, 40) || null,
    });
    return {
      url: location.href,
      inputs: [...document.querySelectorAll('input,textarea')].map(pick),
      editable: [...document.querySelectorAll('[contenteditable="true"]')].map(pick),
      iframes: [...document.querySelectorAll('iframe')].map((f) => ({ id: f.id, src: (f.src || '').slice(0, 80) })),
      buttons: [...document.querySelectorAll('button,a[role="button"]')].map(pick).filter((b) => b.text),
    };
  });
  await fs.mkdir('out', { recursive: true });
  await fs.writeFile('out/tistory-inspect.json', JSON.stringify(dump, null, 2));
  await page.screenshot({ path: 'out/tistory-inspect.png', fullPage: true });
  console.log('\n진단 덤프 → out/tistory-inspect.json, out/tistory-inspect.png');
  console.log('이 두 파일을 보여주시면 선택자를 정확히 맞춰드리겠습니다.');
  await browser.close();
  process.exit(0);
}

// ── 5. 후보 선택자를 순서대로 시도하는 헬퍼 ─────────────────────
async function firstVisible(candidates, label) {
  for (const sel of candidates) {
    const loc = typeof sel === 'string' ? page.locator(sel).first() : sel();
    try {
      if (await loc.isVisible({ timeout: 1200 })) {
        console.log(`  ✓ ${label}: ${typeof sel === 'string' ? sel : '(role 기반)'}`);
        return loc;
      }
    } catch {
      /* 다음 후보로 */
    }
  }
  return null;
}

// 팝업 레이어(이어쓰기 등) 닫기
for (const t of ['취소', '새로 작성', '아니오']) {
  const btn = page.getByRole('button', { name: t }).first();
  if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
    await btn.click().catch(() => {});
    console.log(`  [레이어] "${t}" 클릭`);
    await page.waitForTimeout(800);
    break;
  }
}

// ── 6. 제목 ─────────────────────────────────────────────────────
const titleInput = await firstVisible(
  [
    '#post-title-inp',
    'textarea[placeholder*="제목"]',
    'input[placeholder*="제목"]',
    () => page.getByPlaceholder(/제목/).first(),
  ],
  '제목 입력란'
);
if (!titleInput) await fail('제목 입력란을 찾지 못했습니다.');
await titleInput.click();
await titleInput.fill(title);

// ── 7. 본문 (HTML 모드로 전환 후 붙여넣기) ──────────────────────
let htmlMode = false;
const modeBtn = await firstVisible(
  [
    '#editor-mode-layer-btn-open',
    'button:has-text("기본모드")',
    'button:has-text("마크다운")',
    'button:has-text("HTML")',
  ],
  '에디터 모드 버튼'
);
if (modeBtn) {
  await modeBtn.click();
  await page.waitForTimeout(600);
  const candidates = [
    page.getByRole('button', { name: /^HTML$/ }).first(),
    page.locator('#editor-mode-html, a:has-text("HTML"), li:has-text("HTML")').first(),
  ];
  for (const opt of candidates) {
    if (await opt.isVisible({ timeout: 1000 }).catch(() => false)) {
      await opt.click().catch(() => {});
      htmlMode = true;
      console.log('  ✓ HTML 모드로 전환');
      break;
    }
  }
  // 모드 변경 확인 레이어
  await page.waitForTimeout(800);
  const ok = page.getByRole('button', { name: /확인/ }).first();
  if (await ok.isVisible({ timeout: 800 }).catch(() => false)) await ok.click().catch(() => {});
  await page.waitForTimeout(1200);
}

const bodyArea = await firstVisible(
  [
    '.CodeMirror textarea',
    '.cm-content',
    '#editor-tistory [contenteditable="true"]',
    '[contenteditable="true"]',
    'textarea#editor-tistory',
  ],
  '본문 입력 영역'
);
if (!bodyArea) await fail('본문 입력 영역을 찾지 못했습니다.');

// HTML 모드면 태그째로, 아니면 태그를 벗겨서 넣는다
const payload = htmlMode ? html : html.replace(/<[^>]+>/g, '');
await bodyArea.click();
await page.keyboard.press('Control+A').catch(() => {});

// 본문이 길면 type()은 매우 느리므로 클립보드 경유 붙여넣기를 우선 시도
let pasted = false;
try {
  await page.evaluate((t) => navigator.clipboard.writeText(t), payload);
  await page.keyboard.press('Control+V');
  pasted = true;
} catch {
  /* 클립보드 접근 실패 시 아래 폴백 */
}
if (!pasted) {
  console.log('  ! 클립보드 실패 → 직접 입력으로 폴백 (느릴 수 있습니다)');
  await bodyArea.fill(payload).catch(async () => {
    await bodyArea.type(payload, { delay: 0 });
  });
}
await page.waitForTimeout(1500);

// ── 8. 태그 ─────────────────────────────────────────────────────
if (tags.length) {
  const tagInput = await firstVisible(
    ['#tagText', 'input[placeholder*="태그"]', () => page.getByPlaceholder(/태그/).first()],
    '태그 입력란'
  );
  if (tagInput) {
    for (const t of tags) {
      await tagInput.click();
      await tagInput.type(t, { delay: 40 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
    }
  } else {
    console.log('  ! 태그 입력란을 못 찾아 건너뜁니다.');
  }
}

// ── 9. 임시저장 (발행은 하지 않음) ──────────────────────────────
const saveBtn = await firstVisible(
  ['#save-btn', 'button:has-text("임시저장")', () => page.getByRole('button', { name: '임시저장' }).first()],
  '임시저장 버튼'
);
if (!saveBtn) await fail('임시저장 버튼을 찾지 못했습니다.');
await saveBtn.click();
await page.waitForTimeout(3000);

await fs.mkdir('out', { recursive: true });
await page.screenshot({ path: 'out/tistory-draft.png', fullPage: true });

console.log(`
✓ 임시저장 완료
  확인: https://${blog}.tistory.com/manage/posts/  (저장한 글 목록)
  화면: out/tistory-draft.png
  발행 버튼은 누르지 않았습니다. 내용 확인 후 직접 발행하세요.`);

if (!headless) {
  console.log('\n  브라우저를 10초 뒤 닫습니다. 지금 화면에서 직접 확인하셔도 됩니다.');
  await page.waitForTimeout(10000);
}
await browser.close();
