// 티스토리 로그인 세션 저장 (최초 1회, 세션 만료 시 재실행)
// 사용: node scripts/tistory-login.mjs
//
// 브라우저가 뜨면 직접 로그인하세요. 아이디/비밀번호를 코드에 넣지 않으므로
// 캡차·기기인증에 막히지 않고, 자격증명이 파일에 남지도 않습니다.
import { chromium } from 'playwright';
import readline from 'node:readline/promises';
import fs from 'node:fs/promises';

const AUTH_PATH = '.auth/tistory.json';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto('https://www.tistory.com/auth/login', { waitUntil: 'domcontentloaded' });

console.log(`
┌────────────────────────────────────────────────────────┐
│  브라우저에서 티스토리(카카오) 로그인을 완료하세요.    │
│  로그인이 끝나 관리 화면이 보이면 이 창으로 돌아와서   │
│  Enter 를 누르세요.                                    │
└────────────────────────────────────────────────────────┘
`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('로그인을 마쳤으면 Enter: ');
rl.close();

// 실제로 로그인됐는지 검증 — 관리 페이지가 로그인 화면으로 튕기면 실패
await page.goto('https://www.tistory.com/manage', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const url = page.url();

if (url.includes('/auth/login') || url.includes('accounts.kakao.com')) {
  console.error(`\n✗ 로그인이 확인되지 않았습니다 (현재 위치: ${url})`);
  console.error('  다시 실행해서 로그인을 끝까지 완료해 주세요.');
  await browser.close();
  process.exit(1);
}

await fs.mkdir('.auth', { recursive: true });
await context.storageState({ path: AUTH_PATH });

// 저장된 세션에서 블로그 주소 추출 시도 (여러 블로그면 첫 번째)
const blogs = await page
  .locator('a[href*=".tistory.com"]')
  .evaluateAll((els) =>
    [...new Set(els.map((e) => e.href.match(/https?:\/\/([\w-]+)\.tistory\.com/)?.[1]).filter(Boolean))]
  )
  .catch(() => []);

await browser.close();

console.log(`\n✓ 세션 저장 완료 → ${AUTH_PATH}`);
if (blogs.length) {
  console.log(`  감지된 블로그: ${blogs.join(', ')}`);
  console.log(`  .env 에 다음을 넣으세요:  TISTORY_BLOG=${blogs[0]}`);
}
console.log('  이 파일은 로그인 자격증명과 같습니다. 절대 공유·커밋하지 마세요.');
