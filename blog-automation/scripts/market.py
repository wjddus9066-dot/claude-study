"""재테크 블로그용 시장 요약 — 지수·환율·금리를 한 번에 뽑는다.

사용:
  uv run scripts/market.py              # 최근 30일
  uv run scripts/market.py --days 90
  uv run scripts/market.py --ticker 005930 --ticker 000660   # 종목 추가
"""

import argparse
import sys
from datetime import datetime, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import FinanceDataReader as fdr
import pandas as pd

# 이름: FinanceDataReader 심볼
DEFAULT = {
    "코스피": "KS11",
    "코스닥": "KQ11",
    "S&P500": "US500",
    "나스닥": "IXIC",
    "원달러": "USD/KRW",
    "비트코인": "BTC/KRW",
}


def series(symbol: str, start: str):
    try:
        df = fdr.DataReader(symbol, start)
        return df["Close"].dropna() if "Close" in df else None
    except Exception as exc:
        print(f"  ! {symbol} 조회 실패 — {type(exc).__name__}: {str(exc)[:50]}")
        return None


def main() -> None:
    ap = argparse.ArgumentParser(description="시장 요약")
    ap.add_argument("--days", type=int, default=30, help="조회 기간 (기본 30일)")
    ap.add_argument("--ticker", action="append", default=[], help="추가 종목코드 (여러 번 지정 가능)")
    ap.add_argument("--out", default="data/시장요약.xlsx", help="저장 경로")
    args = ap.parse_args()

    start = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
    targets = dict(DEFAULT)
    for t in args.ticker:
        targets[t] = t

    print(f"조회 기간: {start} ~ 오늘 ({args.days}일)\n")
    print(f"  {'항목':<10} {'현재':>13} {'기간등락':>10} {'최고':>13} {'최저':>13}")
    print("  " + "─" * 64)

    rows = []
    for name, sym in targets.items():
        s = series(sym, start)
        if s is None or s.empty:
            continue
        cur, first = s.iloc[-1], s.iloc[0]
        chg = (cur / first - 1) * 100
        label = name if name != sym else f"{fdr.DataReader(sym, start).columns.name or sym}"
        print(f"  {label:<10} {cur:>13,.2f} {chg:>9.2f}% {s.max():>13,.2f} {s.min():>13,.2f}")
        rows.append(
            {
                "항목": name,
                "심볼": sym,
                "현재": round(float(cur), 2),
                "기간등락률(%)": round(float(chg), 2),
                "최고": round(float(s.max()), 2),
                "최저": round(float(s.min()), 2),
                "조회일": datetime.now().strftime("%Y-%m-%d %H:%M"),
            }
        )

    if not rows:
        print("\n조회된 항목이 없습니다.")
        return

    pd.DataFrame(rows).to_excel(args.out, index=False)
    print(f"\n저장 → {args.out}")


if __name__ == "__main__":
    main()
