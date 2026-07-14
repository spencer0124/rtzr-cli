# RTZR CLI & MCP

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?style=for-the-badge&logo=pnpm&logoColor=white)
[![npm](https://img.shields.io/npm/v/%40spencer0124%2Frtzr-cli?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/@spencer0124/rtzr-cli)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-live-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)

Whisper처럼 쓰는 [RTZR (Return Zero)](https://developers.rtzr.ai/) CLI & MCP

- 🎙️ **Whisper처럼 쓰는 CLI** — 익숙한 플래그, 파일·글롭 입력
- 🗣️ **화자분리 · 키워드 부스팅** — RTZR 고유 기능
- 🔌 **원격 MCP (BYO-key)** — Claude Code 등에 바로 연결, Cloudflare Workers 배포

패키지 구성:

- `rtzr-core` ([npm](https://www.npmjs.com/package/@spencer0124/rtzr-core)): rtzr API wrapper
- `rtzr-cli` ([Installation](#-installation)): rtzr-core 기반 CLI
- `rtzr-mcp` ([MCP Server](#-mcp-server-rtzr-mcp)): rtzr-core 기반 MCP 서버

```
                ┌────────────────────────────────────────┐
                │         @spencer0124/rtzr-core         │
                │   auth · submit · poll · format · zod  │
                └──────────────────┬─────────────────────┘
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
        rtzr CLI (npm/npx)                               MCP
        로컬 파일 + 로컬 키                      URL/base64 입력 + BYO-key 헤더
```

## 📦 Installation

### Run instantly with npx

```bash
# Using npx (no installation required)
npx @spencer0124/rtzr-cli
```

### Install globally with npm

```bash
npm install -g @spencer0124/rtzr-cli
```

## ⚙️ Configuration

```bash
# RTZR_CLIENT_ID / RTZR_CLIENT_SECRET을 대화형으로 입력, 로컬에 저장
rtzr configure
```

- 환경변수 `RTZR_CLIENT_ID` / `RTZR_CLIENT_SECRET`이 존재하면 로컬 설정보다 우선 사용됩니다.
- 키 저장위치는 사용자 홈 설정 폴더입니다(`env-paths`, OS별 표준 경로).
- `rtzr configure`로 언제든 키를 다시 저장할 수 있습니다.

## ▶️ Usage

```bash
rtzr audio.mp3 --diarize                          # 화자분리 포함 txt 출력
rtzr audio.mp3 -f srt --diarize --speakers 2       # 화자 2명 지정, SRT 출력
rtzr *.wav -f all -o out                           # 여러 파일, 모든 포맷(txt/srt/vtt/json)
rtzr audio.mp3 --keywords 리턴제로 스티티            # 키워드 부스팅
rtzr audio.mp3 --json                              # 원본 API 응답 JSON을 stdout으로
```

| 플래그                                           | 설명                                          | 기본값    |
| ------------------------------------------------ | --------------------------------------------- | --------- |
| `-f, --output-format <fmt>`                      | `txt\|srt\|vtt\|json\|all`                    | `txt`     |
| `-o, --output-dir <dir>`                         | 출력 디렉터리                                 | `.`       |
| `-l, --language <lang>`                          | `ko\|ja\|en\|detect\|multi`                   | `ko`      |
| `--model <name>`                                 | `sommers\|whisper`                            | `sommers` |
| `--diarize`                                      | 화자분리(`use_diarization`) 활성화            | off       |
| `--speakers <n>`                                 | 예상 화자 수, `0`=자동(`spk_count`)           | —         |
| `--keywords <kw...>`                             | 키워드 부스팅(가중치 문법 없음)               | —         |
| `--itn` / `--no-itn`                             | 역정규화(ITN)                                 | on        |
| `--profanity-filter`                             | 비속어 필터                                   | off       |
| `--disfluency-filter` / `--no-disfluency-filter` | 간투어 필터                                   | on        |
| `--word-timestamps`                              | 단어별 타임스탬프 포함                        | off       |
| `--domain <GENERAL\|CALL>`                       | 도메인                                        | —         |
| `--json`                                         | 파일 출력 대신 원본 응답 JSON을 stdout에 출력 | off       |

### Whisper에서 넘어오기

Whisper 사용감을 그대로 흉내 내되, 플래그를 기계적으로 복사하지 않고 RTZR API의 실제 동작에 맞춰
재해석했습니다.

```bash
# Whisper
whisper audio.mp3 --model medium --language Korean --output_format srt --output_dir out

# rtzr (같은 손맛)
npx @spencer0124/rtzr-cli audio.mp3 --language ko --output_format srt --output_dir out --diarize
```

| Whisper                                  | rtzr                                                          | 왜 이렇게 매핑했는가                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `audio.mp3`(위치 인자)                   | `audio.mp3`                                                   | 동일. 다중 파일/글롭 지원                                                                                                   |
| `--output_format {txt,vtt,srt,tsv,json}` | `-f txt\|srt\|vtt\|json\|all`                                 | `tsv`는 RTZR 응답 구조와 안 맞아 생략                                                                                       |
| `--output_dir` / `-o`                    | 동일                                                          | 기본값 `.`                                                                                                                  |
| `--language`                             | `-l ko\|ja\|en\|detect\|multi`                                | ISO 코드로 매핑                                                                                                             |
| `--model tiny/base/small/medium/large`   | `--model sommers\|whisper`                                    | **개념 재해석** — 로컬 모델 "크기"라는 축이 RTZR엔 없음. 대신 한국어 특화(`sommers`) vs 다국어(`whisper`)라는 축으로 재정의 |
| `--task transcribe/translate`            | `transcribe`만 지원                                           | RTZR은 번역을 별도 파이프라인으로 처리해 근본적으로 다름 — 억지로 맞추지 않고 명시적으로 뺌                                 |
| `--word_timestamps`                      | `--word-timestamps`                                           | 동일 개념(`use_word_timestamp`)                                                                                             |
| (없음)                                   | `--diarize`, `--speakers <n>`                                 | **RTZR 고유** — Whisper엔 없는 화자분리(`use_diarization`, `spk_count`; `0`=자동)                                           |
| (없음)                                   | `--keywords <kw...>`                                          | **RTZR 고유** — 키워드 부스팅. 가중치 문법 없음, `sommers`는 한글 발음 표기 필수, 단어당 20자 이하·최대 500개               |
| (없음)                                   | `--itn/--no-itn`, `--profanity-filter`, `--disfluency-filter` | **RTZR 고유** 후처리 옵션                                                                                                   |

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

## 🔌 MCP Server (rtzr-mcp)

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

| 파라미터   | 타입                                        | 기본값    | 설명                                                                                    |
| ---------- | ------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `input`    | string (필수)                               | —         | http(s) URL 또는 base64 인코딩된 오디오. 엣지 런타임엔 파일시스템이 없어 로컬 경로 불가 |
| `filename` | string                                      | 자동 유추 | 코덱 판별용 파일명 힌트. URL은 경로/Content-Type에서 자동 추정, base64 입력은 명시 권장 |
| `model`    | `sommers` \| `whisper`                      | `sommers` | `whisper`는 `language`도 함께 지정해야 함                                               |
| `language` | `ko` \| `ja` \| `en` \| `detect` \| `multi` | `ko`      |                                                                                         |
| `diarize`  | boolean                                     | `false`   | 화자분리                                                                                |
| `speakers` | number                                      | `0`(자동) | 예상 화자 수                                                                            |
| `keywords` | string[]                                    | —         | 키워드 부스팅(단어당 20자 이하, 최대 500개)                                             |
| `format`   | `txt` \| `srt` \| `vtt` \| `json`           | `txt`     | 출력 포맷                                                                               |

> **base64는 짧은 클립에만.** base64는 tool 호출 자체에 인라인되어 호출자(LLM)의 컨텍스트를 그대로
> 거치므로, 디코드 후 3MB(대략 1분 내외의 압축 음성) 초과 시 즉시 에러로 거부합니다. 더 긴 파일은 아래
> `request_upload_url`을 쓰세요.

### `request_upload_url` tool (긴 파일용)

호출자에게 1회용 프리사인 업로드 URL과 그대로 실행 가능한 `curl -X PUT` 명령을 돌려줍니다. 코드 실행
환경이 있다면 그 curl을 **자기 샌드박스에서 직접** 실행해 로컬 파일을 스트리밍하고, 끝나면 그 fetch URL을
`transcribe`의 `input`으로 넘기면 됩니다.

base64를 청크로 쪼개는 이전 방식(`upload_chunk`)은 실제로 **근본 문제를 해결하지 못했습니다** — 한 번에
보내든 여러 조각으로 보내든 호출자(LLM)가 생성해야 하는 총 텍스트 양은 그대로였기 때문입니다. 프리사인
업로드는 모델이 파일을 텍스트로 만들어낼 필요 자체를 없애서(샌드박스가 로컬 파일을 바로 HTTP로 전송)
이 문제를 구조적으로 없앱니다. 단, claude.ai 같은 코드 실행 환경은 기본적으로 아웃바운드 네트워크가
막혀있어서, curl이 실패하면 사용자가 Settings → Capabilities에서 이 도메인을 허용 목록에 추가해야
합니다(1회성 수동 단계). 만료 5분, 1회 사용, 최대 20MB. 자세한 배경은
[`packages/mcp-worker/README.md`](packages/mcp-worker/README.md)와 `LESSONS.md` #9 참고.

**설계**: `McpAgent`/Durable Object 없이 `createMcpHandler`(stateless) — `transcribe` 호출 하나가 그대로
완결되는 작업이라 요청 간 세션 상태를 유지할 이유가 없습니다(프리사인 업로드만 R2를 씀, Durable Object는
아님 — R2 객체는 무작위 id로만 주소되고 Worker 간 조율 상태가 필요 없음). 실제 Workers 런타임에
배포해보며 잡은 버그(`fetch` 바인딩 문제, Worker의 자기 zone 셀프-fetch 문제)까지 포함해
자세한 설계 배경은 [`packages/mcp-worker/README.md`](packages/mcp-worker/README.md)에 있습니다.

---

## 🛠️ Development

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

## 📂 Project Structure

- `packages/core` — `@spencer0124/rtzr-core`: 환경 중립 라이브러리(인증·업로드·폴링·포맷터).
- `packages/cli` — `@spencer0124/rtzr-cli`: `rtzr` CLI 겸 라이브러리(commander 기반, Whisper 호환 플래그).
- `packages/mcp-worker` — `@spencer0124/rtzr-mcp`: 원격 MCP 서버(Cloudflare Workers, stateless, BYO-key).
  npm 미배포(private) — `wrangler deploy`로 배포.

---

## 🔗 Links

- **GitHub**: [spencer0124/rtzr-cli](https://github.com/spencer0124/rtzr-cli)
- **npm**: [@spencer0124/rtzr-cli](https://www.npmjs.com/package/@spencer0124/rtzr-cli) ·
  [@spencer0124/rtzr-core](https://www.npmjs.com/package/@spencer0124/rtzr-core)
- **원격 MCP**: https://rtzr.seungyongcho.com/mcp
