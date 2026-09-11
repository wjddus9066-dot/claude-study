# 블로그 자동화 환경

자료수집 → 글 작성 → 이미지 생성 → 티스토리 임시저장까지의 파이프라인입니다.

## 빠른 시작

```bash
cp .env.example .env          # 키·블로그 주소 채우기
node scripts/tistory-login.mjs   # 최초 1회 로그인 (세션 저장)
```

## 파이프라인

```
RSS/URL ──▶ research.py ──▶ data/출처/*.md (출처·저자·발행일 포함)
                              │
                              ▼
                         글 작성 (마크다운)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     thumbnail.mjs → out/*.png      tistory-draft.mjs → 티스토리 임시저장
```

## 운영 블로그

| 주제 | 대상 | 수집 명령 |
|---|---|---|
| **재테크** — 투자·절세·부동산 | 2-30대 | `uv run scripts/research.py --blog 재테크` |
| **테크** — 폰·노트북·PC·태블릿 | 기기 리뷰 | `uv run scripts/research.py --blog 테크` |
| **패션** — 패션·트렌드 | 트렌드 | `uv run scripts/research.py --blog 패션` |

주제별 피드와 기본 키워드는 [config/feeds.json](config/feeds.json)에 있습니다. `--list`로 확인하세요.

## 스크립트

| 명령 | 하는 일 |
|---|---|
| `uv run scripts/research.py --blog <주제> --limit 20` | 주제별 피드 전체에서 수집 + 출처 검증 |
| `uv run scripts/research.py --blog 재테크 --keyword 청약` | 키워드로 좁혀 수집 |
| `uv run scripts/research.py --list` | 등록된 주제·피드 목록 |
| `uv run scripts/research.py <URL> <URL>` | 특정 기사 직접 수집 |
| `uv run scripts/market.py --days 30` | 지수·환율·코인 시세 요약 (재테크) |
| `uv run scripts/trends.py 아이폰 갤럭시 --rising` | 키워드 트렌드 + 급상승 연관어 (글감 발굴) |
| `uv run scripts/collect.py <URL>` | 간단한 메타데이터만 엑셀로 |
| `node scripts/collect.mjs <URL>` | 동적 사이트 본문 → 마크다운 |
| `node scripts/thumbnail.mjs "제목" "부제" out/t.png` | 1200×630 썸네일 |
| `node scripts/tistory-draft.mjs <글.md>` | 티스토리 임시저장 |

### 글감 발굴 (`trends.py`)

`--rising`이 붙으면 급상승 연관 검색어가 나옵니다. 실제로 이런 것들이 잡힙니다.

```
[전세]   전세 대출 DSR, 전세 보증금 반환 보증, 전세 퇴거 자금 대출
[연말정산] 연말정산 의료비 공제, 연말정산 교육비 공제, 연말정산 일정
[노트북]  노트북 발열, 노트북 발열 줄이기, 노트북 화면 안 꺼지게
```

동음이의어가 섞이니 확인이 필요합니다 (예: "갤럭시" → LA 갤럭시 축구팀).

### 시장 데이터 (`market.py`)

코스피·코스닥·S&P500·나스닥·원달러·비트코인의 현재가와 기간 등락률을 뽑습니다.
`--ticker 005930`으로 개별 종목을 추가할 수 있습니다.

### 자료조사 (`research.py`)

블로그 인용에 필요한 항목을 함께 남기고, 빠진 항목은 `확인필요`로 표시합니다.

```bash
uv run scripts/research.py --rss https://www.yna.co.kr/rss/economy.xml --keyword 금리 --limit 20
```

결과물:
- `data/출처/*.md` — 프론트매터에 `source_url · publisher · author · published · accessed · verification`
- `data/출처목록.xlsx` — 누적 출처 표 (URL 기준 중복 제거)

### 티스토리 발행 (`tistory-draft.mjs`)

티스토리 Open API는 [2024년 2월 종료](https://notice.tistory.com/2664)되어 브라우저 자동화로만 가능합니다.
**임시저장까지만** 하고 발행 버튼은 누르지 않습니다 — 내용을 눈으로 확인하고 직접 발행하세요.

```bash
node scripts/tistory-draft.mjs data/글.md --dry-run    # 브라우저 없이 HTML 확인
node scripts/tistory-draft.mjs data/글.md              # 임시저장
node scripts/tistory-draft.mjs data/글.md --inspect    # 선택자가 안 맞을 때 진단 덤프
```

글 형식 (`data/샘플-글.md` 참고):

```markdown
---
title: 글 제목
tags: 태그1, 태그2
---

## 본문 시작
```

**세션 만료 시** `node scripts/tistory-login.mjs` 재실행.
**에디터 DOM이 바뀌어 실패하면** `--inspect` 결과를 보고 선택자를 고치면 됩니다.

## 입력 채널

### 설치 완료 (키 불필요)

| 채널 | 도구 | 상태 |
|---|---|---|
| 기사 본문 + 출처 메타데이터 | trafilatura, htmldate | 검증 완료 |
| RSS/Atom 피드 | feedparser, rss-parser | 검증 완료 |
| 정적 HTML | BeautifulSoup, cheerio | 검증 완료 |
| 동적 사이트 | Playwright + Chromium | 검증 완료 |
| 본문 추출(Node) | @mozilla/readability + jsdom | 검증 완료 |
| 지수·환율·주식 시세 | **FinanceDataReader** | 실측 검증 (코스피·삼성전자·원달러 전부) |
| 구글 트렌드 | pytrends | 실측 검증 (관심도 + 급상승 연관어) |
| 해외 시세 | yfinance | 실측 검증 |
| 국내 종목 시세 | pykrx | **부분** — 종목 조회는 되나 지수·티커목록이 KRX 사이트 변경으로 깨짐. **FinanceDataReader를 쓰세요** |

### 키 발급 필요 (전부 무료)

| 채널 | 발급처 | 용도 | 블로그 |
|---|---|---|---|
| 네이버 검색 API | developers.naver.com | 뉴스/블로그 키워드 검색, 일 25,000건 | 공통 |
| 한국은행 ECOS | ecos.bok.or.kr/api | 기준금리·환율·물가 | 재테크 |
| DART | opendart.fss.or.kr | 공시·재무제표 (`opendartreader`) | 재테크 |
| 공공데이터포털 | data.go.kr | **국토부 아파트 실거래가** (`PublicDataReader`) | 재테크 |
| FRED | fred.stlouisfed.org/docs/api | 해외 거시지표 | 재테크 |
| YouTube Data API | console.cloud.google.com | 리뷰 영상 검색·조회수 | 테크·패션 |
| Reddit | reddit.com/prefs/apps | 커뮤니티 반응 (`praw`) | 테크·패션 |

### 피드 실측 결과

살아있는 피드만 [config/feeds.json](config/feeds.json)에 등록했습니다.

**재테크** — 연합뉴스 경제(120건) · 머니투데이(100) · 뉴시스 경제(100) · 매경 부동산(50) · 경향 경제(50) · 한겨레 경제(30) · SBS 경제(29) · 한국경제(50, 레이트리밋)

**테크** — 9to5Mac(100) · Android Authority(80) · ZDNet 코리아(30) · 전자신문(26) · Engadget(20) · Ars Technica(20) · GSMArena(20) · The Verge(10)

**패션** — Vogue(28) · Hypebeast KR(20) · Hypebeast(20) · Dazed(15) · Highsnobiety(12)

**제외한 곳** — 매경 경제·한경(403 레이트리밋, 재시도로 대응), 이데일리(연결 실패), 조선비즈(피드 비어있음), 디지털데일리·베타뉴스·테크레시피·Notebookcheck(해당 경로에 피드 없음)

> 국내 언론사는 레이트리밋이 잦습니다. `research.py`가 브라우저 UA + 백오프 재시도(최대 3회)와
> 요청 간 지연을 넣어 대응하지만, 한 번에 너무 많이 받지는 마세요.

## 이미지 생성

- **썸네일·인포그래픽** — `thumbnail.mjs`가 HTML을 Playwright로 캡처. 무료·무제한·오프라인
- **AI 일러스트** — `@google/genai` / `openai` SDK (키 필요)
- 한글 폰트 Pretendard가 `assets/fonts/`에 있습니다

로컬 Stable Diffusion은 이 PC GPU(MX450, VRAM 2GB)로는 구동 불가라 제외했습니다.

## 주의

- **`.auth/`는 절대 커밋하지 마세요.** 로그인 세션이라 계정 탈취와 같습니다 (`.gitignore`에 등록됨)
- `pandas`는 생태계 호환을 위해 2.x로 고정했습니다 (`pandas<3`)
- 대량 자동 발행은 스팸으로 간주될 수 있습니다. 임시저장 후 사람이 확인하는 현재 방식을 권합니다

## 폴더

- `scripts/` — 실행 스크립트
- `assets/fonts/` — 썸네일용 한글 폰트
- `data/` — 수집 결과·원고 (git 제외)
- `out/` — 생성 이미지·미리보기 (git 제외)
- `.auth/` — 로그인 세션 (git 제외)
