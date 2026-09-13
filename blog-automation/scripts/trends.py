"""키워드 트렌드 비교 — 글감 발굴용 (구글 트렌드, 키 불필요).

사용:
  uv run scripts/trends.py 아이폰 갤럭시
  uv run scripts/trends.py 청약 전세 --timeframe "today 3-m"
  uv run scripts/trends.py 스니커즈 --geo KR --rising
"""

import argparse
import sys
import warnings
from datetime import datetime

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# pytrends가 내부에서 구식 pandas API를 써서 나는 경고 — 동작에는 영향 없음
warnings.filterwarnings("ignore", category=FutureWarning, module="pytrends")

import pandas as pd
from pytrends.request import TrendReq


def main() -> None:
    ap = argparse.ArgumentParser(description="구글 트렌드 키워드 비교")
    ap.add_argument("keywords", nargs="+", help="비교할 키워드 (최대 5개)")
    ap.add_argument("--timeframe", default="today 3-m", help='기간 (기본 "today 3-m", 예: "now 7-d")')
    ap.add_argument("--geo", default="KR", help="지역 코드 (기본 KR, 전세계는 빈 문자열)")
    ap.add_argument("--rising", action="store_true", help="급상승 연관 검색어도 조회")
    ap.add_argument("--out", default="data/트렌드.xlsx", help="저장 경로")
    args = ap.parse_args()

    kw = args.keywords[:5]  # 구글 트렌드 제한
    if len(args.keywords) > 5:
        print(f"키워드는 최대 5개입니다. 앞 5개만 사용: {', '.join(kw)}\n")

    pt = TrendReq(hl="ko-KR", tz=540)
    pt.build_payload(kw, timeframe=args.timeframe, geo=args.geo)

    df = pt.interest_over_time()
    if df.empty:
        print("데이터가 없습니다. 키워드나 기간을 바꿔보세요.")
        return
    if "isPartial" in df:
        df = df.drop(columns=["isPartial"])

    print(f"기간 {args.timeframe} / 지역 {args.geo or '전세계'}\n")
    print(f"  {'키워드':<14} {'평균':>7} {'최고':>7} {'최근':>7} {'추세':>8}")
    print("  " + "─" * 48)
    for k in kw:
        if k not in df:
            continue
        s = df[k]
        half = len(s) // 2
        trend = s.iloc[half:].mean() - s.iloc[:half].mean()
        arrow = "상승 ↑" if trend > 3 else "하락 ↓" if trend < -3 else "보합 -"
        print(f"  {k:<14} {s.mean():>7.1f} {s.max():>7.0f} {s.iloc[-1]:>7.0f} {arrow:>8}")

    with pd.ExcelWriter(args.out) as writer:
        df.to_excel(writer, sheet_name="관심도추이")

        if args.rising:
            print("\n급상승 연관 검색어 (글감 후보)")
            try:
                related = pt.related_queries()
                for k in kw:
                    rising = (related.get(k) or {}).get("rising")
                    if rising is None or rising.empty:
                        print(f"  [{k}] 없음")
                        continue
                    top = rising.head(8)
                    print(f"  [{k}] " + ", ".join(top["query"].tolist()))
                    top.to_excel(writer, sheet_name=f"연관_{k[:20]}", index=False)
            except Exception as exc:
                print(f"  연관 검색어 조회 실패 — {type(exc).__name__}: {str(exc)[:60]}")

    print(f"\n저장 → {args.out}  ({datetime.now():%Y-%m-%d %H:%M})")


if __name__ == "__main__":
    main()
