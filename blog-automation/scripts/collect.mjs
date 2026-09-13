// 웹페이지 본문 수집 → 마크다운 저장 (Playwright + Cheerio + Turndown)
// 사용: node scripts/collect.mjs https://example.com
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import fs from 'node:fs/promises';

const url = process.argv[2];
if (!url) { console.error('사용법: node scripts/collect.mjs <URL>'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
const html = await page.content();
await browser.close();

const $ = cheerio.load(html);
$('script, style, nav, footer, header, aside, iframe, noscript').remove();
const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
const desc = $('meta[property="og:description"]').attr('content')
  || $('meta[name="description"]').attr('content') || '';
const body = $('article').html() || $('main').html() || $('body').html();

const md = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(body || '');
const slug = (title || 'untitled').replace(/[\/:*?"<>|]/g, '').slice(0, 50).trim() || 'untitled';
const outPath = `data/${slug}.md`;

await fs.mkdir('data', { recursive: true });
await fs.writeFile(outPath, `# ${title}\n\n> ${desc}\n>\n> 출처: ${url}\n> 수집: ${new Date().toISOString()}\n\n---\n\n${md}\n`);
console.log(`수집 완료 → ${outPath} (${md.length.toLocaleString()}자)`);
