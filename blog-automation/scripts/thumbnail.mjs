// HTML 템플릿 → PNG 썸네일 렌더링 (Playwright + Sharp)
// 사용: node scripts/thumbnail.mjs "제목" "부제목" out/thumb.png
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const [title = '블로그 자동화', subtitle = '자료수집부터 이미지생성까지', outPath = 'out/thumb.png'] =
  process.argv.slice(2);

const fontBase64 = await fs.readFile('assets/fonts/PretendardVariable.woff2', 'base64');

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Pretendard;src:url(data:font/woff2;base64,${fontBase64}) format('woff2-variations');font-weight:100 900}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;
  padding:80px;font-family:Pretendard,'Malgun Gothic',sans-serif;
  background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 55%,#7c3aed 100%);color:#fff}
.bar{width:72px;height:8px;border-radius:4px;background:#a78bfa;margin-bottom:36px}
h1{font-size:76px;font-weight:800;line-height:1.2;letter-spacing:-.03em}
p{margin-top:28px;font-size:32px;font-weight:500;color:#ddd6fe;letter-spacing:-.01em}
</style><div class="bar"></div><h1>${title}</h1><p>${subtitle}</p>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
const raw = await page.screenshot();
await browser.close();

await fs.mkdir(path.dirname(outPath), { recursive: true });
await sharp(raw).resize(1200, 630).png({ quality: 90, compressionLevel: 9 }).toFile(outPath);
console.log(`썸네일 생성 완료 → ${outPath}`);
