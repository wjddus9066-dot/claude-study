"""출처 검증형 자료조사 — URL/RSS를 받아 본문 + 인용 메타데이터를 수집한다.

블로그에 인용할 때 필요한 것(제목·매체·저자·발행일·URL·수집시각)을 함께 남기고,
빠진 항목은 경고로 표시해 '검증 안 된 출처'를 걸러낼 수 있게 한다.

사용:
  uv run scripts/research.py https://example.com/article1 https://example.com/article2
  uv run scripts/research.py --rss https://www.yna.co.kr/rss/economy.xml --limit 10
  uv run scripts/research.py --rss <피드> --keyword 금리 --limit 20
"""

import argparse
import json
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import feedparser
import pandas as pd
import requests
import trafilatura
from trafilatura.settings import use_config

OUT_DIR = Path("data/출처")
INDEX_XLSX = Path("data/출처목록.xlsx")
FEEDS_PATH = Path("config/feeds.json")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# trafilatura 기본 타임아웃이 짧아 종종 실패한다
CFG = use_config()
CFG.set("DEFAULT", "DOWNLOAD_TIMEOUT", "20")
CFG.set("DEFAULT", "EXTRACTION_TIMEOUT", "0")


def slugify(text: str, limit: int = 60) -> str:
    text = re.sub(r'[\\/:*?"<>|\n\r\t]', "", text or "").strip()
    return (text[:limit] or "untitled").strip()


def download(url: str) -> str | None:
    """브라우저 UA로 내려받는다. trafilatura 기본 UA는 차단하는 사이트가 많다."""
    try:
        res = requests.get(url, headers={"User-Agent": UA}, timeout=20)
        if res.status_code == 200 and res.text:
            return res.text
        print(f"  [실패] HTTP {res.status_code} — {url}")
    except Exception as exc:
        print(f"  [실패] {type(exc).__name__} — {url}")
    # 마지막 수단으로 trafilatura 자체 다운로더
    return trafilatura.fetch_url(url, config=CFG)


def collect(url: str) -> dict | None:
    """한 건 수집. 실패하면 None."""
    downloaded = download(url)
    if not downloaded:
        return None

    def extract(**kw):
        return trafilatura.bare_extraction(
            downloaded,
            url=url,
            with_metadata=True,
            include_comments=False,
            include_tables=True,
            config=CFG,
            **kw,
        )

    # 정확도 우선으로 먼저 시도하고, 본문이 안 잡히면 재현율 우선으로 한 번 더
    doc = extract(favor_precision=True)
    if not doc or not (doc.get("text") if isinstance(doc, dict) else getattr(doc, "text", "")):
        doc = extract(favor_recall=True)
    if not doc:
        print(f"  [실패] 본문 추출 불가 — {url}")
        return None

    # trafilatura 버전에 따라 dict / Document 객체 둘 다 나온다
    get = doc.get if isinstance(doc, dict) else lambda k, d=None: getattr(doc, k, d)

    text = get("text") or ""
    rec = {
        "제목": get("title") or "",
        "매체": get("sitename") or urlparse(url).netloc,
        "저자": get("author") or "",
        "발행일": get("date") or "",
        "URL": url,
        "수집시각": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "본문길이": len(text),
        "_본문": text,
        "_설명": get("description") or "",
    }

    # 검증: 인용에 필요한 항목이 비었는지
    missing = [k for k in ("제목", "저자", "발행일") if not rec[k]]
    if rec["본문길이"] < 300:
        missing.append("본문(300자 미만)")
    rec["검증"] = "OK" if not missing else "확인필요: " + ", ".join(missing)

    return rec


def save_markdown(rec: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{slugify(rec['제목'] or urlparse(rec['URL']).netloc)}.md"

    header = (
        "---\n"
        f"title: {rec['제목']}\n"
        f"source_url: {rec['URL']}\n"
        f"publisher: {rec['매체']}\n"
        f"author: {rec['저자']}\n"
        f"published: {rec['발행일']}\n"
        f"accessed: {rec['수집시각']}\n"
        f"verification: {rec['검증']}\n"
        "---\n\n"
    )
    citation = (
        f"> **출처** {rec['매체']}"
        + (f", {rec['저자']}" if rec["저자"] else "")
        + (f" ({rec['발행일']})" if rec["발행일"] else "")
        + f"\n> {rec['URL']}\n> 수집: {rec['수집시각']}\n\n---\n\n"
    )
    body = f"# {rec['제목']}\n\n" + (f"_{rec['_설명']}_\n\n" if rec["_설명"] else "") + rec["_본문"] + "\n"

    path.write_text(header + citation + body, encoding="utf-8")
    return path


def load_feeds() -> dict:
    if not FEEDS_PATH.exists():
        return {}
    data = json.loads(FEEDS_PATH.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def fetch_feed(url: str, retries: int = 3):
    """국내 언론사는 레이트리밋이 잦아 브라우저 UA + 백오프 재시도가 필요하다."""
    for attempt in range(1, retries + 1):
        try:
            res = requests.get(url, headers={"User-Agent": UA}, timeout=15)
            if res.status_code == 200:
                return feedparser.parse(res.content)
            if res.status_code in (403, 429) and attempt < retries:
                wait = attempt * 3 + random.uniform(0, 1.5)
                print(f"     {res.status_code} — {wait:.1f}초 후 재시도 ({attempt}/{retries})")
                time.sleep(wait)
                continue
            print(f"     실패 HTTP {res.status_code}")
            return None
        except Exception as exc:
            if attempt < retries:
                time.sleep(attempt * 2)
                continue
            print(f"     실패 {type(exc).__name__}: {str(exc)[:50]}")
            return None
    return None


def urls_from_rss(feed_url: str, limit: int, keywords: list[str] | None, quiet: bool = False) -> list[str]:
    feed = fetch_feed(feed_url)
    if not feed or not feed.entries:
        if not quiet:
            print(f"피드를 읽지 못했습니다: {feed_url}")
        return []

    entries = feed.entries
    if keywords:
        entries = [
            e
            for e in entries
            if any(k.lower() in (e.get("title", "") + " " + e.get("summary", "")).lower() for k in keywords)
        ]
        if not quiet:
            print(f"  피드 {len(feed.entries)}건 중 키워드 일치 {len(entries)}건")

    return [e.link for e in entries[:limit] if e.get("link")]


def urls_from_blog(blog: str, limit: int, keywords: list[str] | None) -> list[str]:
    """블로그 주제에 등록된 모든 피드를 돌며 URL을 모은다 (중복 제거)."""
    conf = load_feeds()
    if blog not in conf:
        print(f"'{blog}' 주제가 config/feeds.json 에 없습니다. 등록된 주제: {', '.join(conf) or '(없음)'}")
        return []

    entry = conf[blog]
    # 키워드를 안 주면 주제에 등록된 기본 키워드를 쓴다
    kw = keywords if keywords else entry.get("keywords")
    print(f"[{blog}] {entry.get('설명', '')} — 피드 {len(entry['feeds'])}개")
    if kw:
        print(f"  키워드: {', '.join(kw[:8])}{' …' if len(kw) > 8 else ''}")

    seen, urls = set(), []
    per_feed = max(1, limit // max(1, len(entry["feeds"])) + 1)
    for f in entry["feeds"]:
        print(f"  · {f['name']}")
        got = urls_from_rss(f["url"], per_feed, kw, quiet=True)
        new = [u for u in got if u not in seen]
        seen.update(new)
        urls.extend(new)
        print(f"    {len(new)}건 추가 (누적 {len(urls)})")
        time.sleep(random.uniform(0.6, 1.4))  # 예의상 지연
        if len(urls) >= limit:
            break

    return urls[:limit]


def main() -> None:
    ap = argparse.ArgumentParser(description="출처 검증형 자료조사")
    ap.add_argument("urls", nargs="*", help="수집할 기사 URL")
    ap.add_argument("--blog", help="config/feeds.json 의 주제 (재테크 / 테크 / 패션)")
    ap.add_argument("--rss", help="RSS 피드 주소를 직접 지정")
    ap.add_argument("--keyword", action="append", help="이 키워드가 든 것만 (여러 번 지정 가능)")
    ap.add_argument("--limit", type=int, default=10, help="가져올 최대 건수 (기본 10)")
    ap.add_argument("--list", action="store_true", help="등록된 주제와 피드를 보여준다")
    args = ap.parse_args()

    if args.list:
        conf = load_feeds()
        for name, entry in conf.items():
            print(f"\n[{name}] {entry.get('설명', '')}")
            for f in entry["feeds"]:
                mark = " (레이트리밋 주의)" if f.get("rate_limited") else ""
                print(f"  · {f['name']:<18} {f['url']}{mark}")
            print(f"  기본 키워드: {', '.join(entry.get('keywords', []))}")
        return

    urls = list(args.urls)
    if args.blog:
        urls += urls_from_blog(args.blog, args.limit, args.keyword)
    if args.rss:
        urls += urls_from_rss(args.rss, args.limit, args.keyword)

    if not urls:
        ap.print_help()
        raise SystemExit(1)

    print(f"\n{len(urls)}건 수집 시작\n")
    rows = []
    for i, url in enumerate(urls, 1):
        print(f"[{i}/{len(urls)}] {url}")
        rec = collect(url)
        if i < len(urls):
            time.sleep(random.uniform(0.5, 1.2))  # 예의상 지연
        if not rec:
            continue
        path = save_markdown(rec)
        flag = "OK  " if rec["검증"] == "OK" else "주의"
        print(f"  {flag} {rec['제목'][:45]} — {rec['본문길이']:,}자 → {path}")
        if rec["검증"] != "OK":
            print(f"       {rec['검증']}")
        rows.append({k: v for k, v in rec.items() if not k.startswith("_")})

    if not rows:
        print("\n수집된 항목이 없습니다.")
        return

    INDEX_XLSX.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    # 기존 목록이 있으면 이어붙이고 URL 기준 중복 제거
    if INDEX_XLSX.exists():
        try:
            df = pd.concat([pd.read_excel(INDEX_XLSX), df], ignore_index=True)
            df = df.drop_duplicates(subset=["URL"], keep="last")
        except Exception as exc:
            print(f"기존 목록을 읽지 못해 새로 씁니다 — {exc}")
    df.to_excel(INDEX_XLSX, index=False)

    ok = sum(1 for r in rows if r["검증"] == "OK")
    print(f"\n완료: {len(rows)}건 수집 (검증 OK {ok}건, 확인필요 {len(rows) - ok}건)")
    print(f"  본문  → {OUT_DIR}/")
    print(f"  목록  → {INDEX_XLSX}  (누적 {len(df)}건)")


if __name__ == "__main__":
    main()
