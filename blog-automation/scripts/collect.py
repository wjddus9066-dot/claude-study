"""정적 페이지 다건 수집 → 엑셀 저장 (requests + BeautifulSoup + pandas)

사용: uv run scripts/collect.py https://example.com https://example.org
"""
import sys
from datetime import datetime

# Windows 콘솔에서 한글 출력이 깨지지 않도록
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import pandas as pd
import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36"}


def scrape(url: str) -> dict:
    res = requests.get(url, headers=HEADERS, timeout=15)
    res.raise_for_status()
    soup = BeautifulSoup(res.text, "lxml")

    def meta(prop: str, attr: str = "property") -> str:
        tag = soup.find("meta", attrs={attr: prop})
        return tag.get("content", "") if tag else ""

    for junk in soup(["script", "style", "nav", "footer", "header", "aside"]):
        junk.decompose()

    return {
        "url": url,
        "title": meta("og:title") or (soup.title.string.strip() if soup.title else ""),
        "description": meta("og:description") or meta("description", "name"),
        "image": meta("og:image"),
        "text": " ".join(soup.get_text(" ", strip=True).split())[:2000],
        "collected_at": datetime.now().isoformat(timespec="seconds"),
    }


def main() -> None:
    urls = sys.argv[1:]
    if not urls:
        print("사용법: uv run scripts/collect.py <URL> [URL ...]")
        raise SystemExit(1)

    rows = []
    for url in urls:
        try:
            rows.append(scrape(url))
            print(f"  OK  {url}")
        except Exception as exc:  # 한 건 실패가 전체를 막지 않도록
            print(f"  실패 {url} — {exc}")

    if not rows:
        print("수집된 항목이 없습니다.")
        return

    out = "data/수집결과.xlsx"
    pd.DataFrame(rows).to_excel(out, index=False)
    print(f"수집 완료 → {out} ({len(rows)}건)")


if __name__ == "__main__":
    main()
