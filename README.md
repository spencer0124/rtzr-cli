# rtzr-cli

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?style=for-the-badge&logo=pnpm&logoColor=white)
[![npm](https://img.shields.io/npm/v/%40spencer0124%2Frtzr-cli?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/@spencer0124/rtzr-cli)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-live-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)

> Whisper처럼 쓰는 [RTZR (Return Zero)](https://developers.rtzr.ai/) STT — CLI 하나, 원격 MCP 서버 하나,
> 같은 엔진. 화자분리·키워드부스팅·ITN처럼 오픈소스 Whisper엔 없는 기능을 익숙한 인터페이스로 씁니다.
> 리턴제로의 공식 도구가 아닌, RTZR STT API를 활용한 비공식 CLI/라이브러리/MCP 서버입니다.

```bash
npx @spencer0124/rtzr-cli audio.mp3 --diarize
```

터미널에서 직접 쓰고 싶으면 [CLI](#cli), Claude Code 같은 MCP 클라이언트에 붙이고 싶으면
[MCP 서버](#mcp-서버)로 바로 가세요. 둘 다 환경 중립 라이브러리 `@spencer0124/rtzr-core` 하나를 공유합니다 —
인증→업로드→폴링→포맷 로직이 어디에도 중복 구현되지 않습니다.

```
                ┌──────────────────────────────────────┐
                │   @spencer0124/rtzr-core (환경 중립)   │
                │   auth · submit · poll · format · zod  │
                └──────────────────┬─────────────────────┘
              ┌─────────────────────┴─────────────────────┐
              ▼                                             ▼
        rtzr CLI (npm/npx)                     원격 MCP (Cloudflare Workers)
        로컬 파일 + 로컬 키                      URL/base64 입력 + BYO-key 헤더
```

---

## CLI

### 설치 / 인증

```bash
npm install -g @spencer0124/rtzr-cli   # 또는 npx로 설치 없이 실행
rtzr configure                          # RTZR_CLIENT_ID / RTZR_CLIENT_SECRET을 대화형으로 입력, 로컬에 저장
```

환경변수 `RTZR_CLIENT_ID` / `RTZR_CLIENT_SECRET`이 있으면 로컬 설정보다 우선 사용됩니다. 키는 절대
커밋되지 않고, 저장 위치는 사용자 홈의 설정 폴더입니다(`env-paths` 사용, OS별 표준 경로).

### 사용법

```bash
rtzr audio.mp3 --diarize                          # 화자분리 포함 txt 출력
rtzr audio.mp3 -f srt --diarize --speakers 2       # 화자 2명 지정, SRT 출력
rtzr *.wav -f all -o out                           # 여러 파일, 모든 포맷(txt/srt/vtt/json)
rtzr audio.mp3 --keywords 리턴제로 스티티            # 키워드 부스팅
rtzr audio.mp3 --json                              # 원본 API 응답 JSON을 stdout으로
```

| 플래그 | 설명 | 기본값 |
|---|---|---|
| `-f, --output-format <fmt>` | `txt\|srt\|vtt\|json\|all` | `txt` |
| `-o, --output-dir <dir>` | 출력 디렉터리 | `.` |
| `-l, --language <lang>` | `ko\|ja\|en\|detect\|multi` | `ko` |
| `--model <name>` | `sommers\|whisper` | `sommers` |
| `--diarize` | 화자분리(`use_diarization`) 활성화 | off |
| `--speakers <n>` | 예상 화자 수, `0`=자동(`spk_count`) | — |
| `--keywords <kw...>` | 키워드 부스팅(가중치 문법 없음) | — |
| `--itn` / `--no-itn` | 역정규화(ITN) | on |
| `--profanity-filter` | 비속어 필터 | off |
| `--disfluency-filter` / `--no-disfluency-filter` | 간투어 필터 | on |
| `--word-timestamps` | 단어별 타임스탬프 포함 | off |
| `--domain <GENERAL\|CALL>` | 도메인 | — |
| `--json` | 파일 출력 대신 원본 응답 JSON을 stdout에 출력 | off |

`rtzr configure`로 언제든 키를 다시 저장할 수 있습니다.

### Whisper에서 넘어오기

Whisper 사용감을 그대로 흉내 내되, 플래그를 기계적으로 복사하지 않고 RTZR API의 실제 동작에 맞춰
재해석했습니다. 각 판단의 이유까지 적어둡니다.

```bash
# Whisper
whisper audio.mp3 --model medium --language Korean --output_format srt --output_dir out

# rtzr (같은 손맛)
npx @spencer0124/rtzr-cli audio.mp3 --language ko --output_format srt --output_dir out --diarize
```

| Whisper | rtzr | 왜 이렇게 매핑했는가 |
|---|---|---|
| `audio.mp3`(위치 인자) | `audio.mp3` | 동일. 다중 파일/글롭 지원 |
| `--output_format {txt,vtt,srt,tsv,json}` | `-f txt\|srt\|vtt\|json\|all` | `tsv`는 RTZR 응답 구조와 안 맞아 생략 |
| `--output_dir` / `-o` | 동일 | 기본값 `.` |
| `--language` | `-l ko\|ja\|en\|detect\|multi` | ISO 코드로 매핑 |
| `--model tiny/base/small/medium/large` | `--model sommers\|whisper` | **개념 재해석** — 로컬 모델 "크기"라는 축이 RTZR엔 없음. 대신 한국어 특화(`sommers`) vs 다국어(`whisper`)라는 축으로 재정의 |
| `--task transcribe/translate` | `transcribe`만 지원 | RTZR은 번역을 별도 파이프라인으로 처리해 근본적으로 다름 — 억지로 맞추지 않고 명시적으로 뺌 |
| `--word_timestamps` | `--word-timestamps` | 동일 개념(`use_word_timestamp`) |
| (없음) | `--diarize`, `--speakers <n>` | **RTZR 고유** — Whisper엔 없는 화자분리(`use_diarization`, `spk_count`; `0`=자동) |
| (없음) | `--keywords <kw...>` | **RTZR 고유** — 키워드 부스팅. 가중치 문법 없음, `sommers`는 한글 발음 표기 필수, 단어당 20자 이하·최대 500개 |
| (없음) | `--itn/--no-itn`, `--profanity-filter`, `--disfluency-filter` | **RTZR 고유** 후처리 옵션 |

### 차별점: 화자분리 (before/after)

같은 오디오(항공기 기내방송)를 `--diarize` 없이/있이 각각 돌린 실제 출력입니다.

**`rtzr audio.mp3`** (기본 txt, 화자분리 없음 — Whisper와 동일한 경험):
```text
손님 여러분, 저희 이스타 항공과 함께 편안한 시간 보내셨습니까?
이 비행기는 잠시 후에 제주 국제공항에 도착하겠습니다.
```

**`rtzr audio.mp3 --diarize -f srt`** (Whisper엔 없는 화자분리 + 타임코드):
```srt
1
00:00:00,954 --> 00:00:05,524
[Speaker 0] 손님 여러분, 저희 이스타 항공과 함께 편안한 시간 보내셨습니까?

2
00:00:06,234 --> 00:00:10,234
[Speaker 1] 이 비행기는 잠시 후에 제주 국제공항에 도착하겠습니다.
```

> 이 예시는 `--speakers`를 지정하지 않아(자동 감지) 실제로는 화자 수가 다소 과하게 잡혔습니다 — 이건
> 버그가 아니라 자동 감지의 한계이며, 화자 수를 미리 안다면 `--speakers 2`처럼 명시하는 게 더 정확합니다.
> "완벽한 결과"만 보여주기보다 실제 동작을 그대로 남겨둡니다.

---

## MCP 서버

Claude Code 등 MCP 클라이언트에서 바로 붙일 수 있는 **원격 MCP 서버**가 Cloudflare Workers에 배포돼
있습니다. `@spencer0124/rtzr-core`를 그대로 재사용하는 stateless 서버로, tool 하나(`transcribe`)를
노출합니다.

```bash
claude mcp add --transport http rtzr https://rtzr.seungyongcho.com/mcp \
  --header "X-RTZR-CLIENT-ID: ..." --header "X-RTZR-CLIENT-SECRET: ..."
```

**키 없이도 바로 써볼 수 있습니다.** 헤더를 생략하면 데모용 공유 키로 폴백합니다(다른 사람과 RTZR 쿼터를
같이 씁니다) — 진지하게 쓰려면 BYO-key 헤더로 자기 키를 넣으세요. 서버는 어느 쪽 키든 저장하지 않고
해당 요청 처리에만 메모리에서 씁니다.

### `transcribe` tool

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `input` | string (필수) | — | http(s) URL 또는 base64 인코딩된 오디오. 엣지 런타임엔 파일시스템이 없어 로컬 경로 불가 |
| `filename` | string | 자동 유추 | 코덱 판별용 파일명 힌트. URL은 경로/Content-Type에서 자동 추정, base64 입력은 명시 권장 |
| `model` | `sommers` \| `whisper` | `sommers` | `whisper`는 `language`도 함께 지정해야 함 |
| `language` | `ko` \| `ja` \| `en` \| `detect` \| `multi` | `ko` | |
| `diarize` | boolean | `false` | 화자분리 |
| `speakers` | number | `0`(자동) | 예상 화자 수 |
| `keywords` | string[] | — | 키워드 부스팅(단어당 20자 이하, 최대 500개) |
| `format` | `txt` \| `srt` \| `vtt` \| `json` | `txt` | 출력 포맷 |

**설계**: `McpAgent`/Durable Object 없이 `createMcpHandler`(stateless) — `transcribe` 호출 하나가 그대로
완결되는 작업이라 요청 간 세션 상태를 유지할 이유가 없습니다. 실제 Workers 런타임에 배포해보며 잡은 버그
(`fetch` 바인딩 문제)까지 포함해 자세한 설계 배경은 [`packages/mcp-worker/README.md`](packages/mcp-worker/README.md)에 있습니다.

---

## 개발

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @spencer0124/rtzr-core test:coverage   # core 커버리지 리포트
```

`packages/core`는 TDD로 백필된 58개 유닛테스트(커버리지 98%+)로 인증/업로드/폴링/포맷/스키마 검증을
전부 fetch mock으로 검증합니다. `packages/mcp-worker`도 같은 패턴(주입 가능한 `fetchImpl`)으로 검증되고,
Worker 배선 자체는 `wrangler dev` + 실제 tool 호출로 별도 확인합니다.

## 구조

- `packages/core` — `@spencer0124/rtzr-core`: 환경 중립 라이브러리(인증·업로드·폴링·포맷터).
- `packages/cli` — `@spencer0124/rtzr-cli`: `rtzr` CLI 겸 라이브러리(commander 기반, Whisper 호환 플래그).
- `packages/mcp-worker` — `@spencer0124/rtzr-mcp`: 원격 MCP 서버(Cloudflare Workers, stateless, BYO-key).
  npm 미배포(private) — `wrangler deploy`로 배포.

---

- **GitHub**: [spencer0124/rtzr-cli](https://github.com/spencer0124/rtzr-cli)
- **npm**: [@spencer0124/rtzr-cli](https://www.npmjs.com/package/@spencer0124/rtzr-cli) ·
  [@spencer0124/rtzr-core](https://www.npmjs.com/package/@spencer0124/rtzr-core)
- **원격 MCP**: https://rtzr.seungyongcho.com/mcp
