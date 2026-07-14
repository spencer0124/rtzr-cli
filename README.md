# rtzr-cli

> Whisper처럼 쓰는 [RTZR (Return Zero)](https://developers.rtzr.ai/) STT CLI — 화자분리·키워드부스팅·ITN 지원.
> 리턴제로의 공식 도구가 아닌, RTZR STT API를 활용한 비공식 CLI/라이브러리입니다.

```bash
npx @spencer0124/rtzr-cli audio.mp3 --diarize
```

## 설치 / 인증

```bash
npm install -g @spencer0124/rtzr-cli   # 또는 npx로 설치 없이 실행
rtzr configure                          # RTZR_CLIENT_ID / RTZR_CLIENT_SECRET을 대화형으로 입력, 로컬에 저장
```

환경변수 `RTZR_CLIENT_ID` / `RTZR_CLIENT_SECRET`이 있으면 로컬 설정보다 우선 사용됩니다. 키는 절대 커밋되지
않고, 저장 위치는 사용자 홈의 설정 폴더입니다.

## 사용법

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

## 원격 MCP (Cloudflare Workers)

Claude Code 등 MCP 클라이언트에서 바로 붙일 수 있는 원격 서버가 배포돼 있습니다. 서버는 BYO-key 방식이라
호출자의 RTZR 키를 요청 헤더로만 받고 저장하지 않습니다.

```bash
claude mcp add --transport http rtzr https://rtzr.seungyongcho.com/mcp \
  --header "X-RTZR-CLIENT-ID: ..." --header "X-RTZR-CLIENT-SECRET: ..."
```

`transcribe` tool 하나를 노출하며, CLI와 같은 옵션(diarize/speakers/keywords/language/model/format)을
지원합니다. 입력은 로컬 파일 경로 대신 http(s) URL 또는 base64 문자열입니다(엣지 런타임에는 파일시스템이
없음). 자세한 설계는 `packages/mcp-worker/README.md` 참고.

## 개발

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @spencer0124/rtzr-core test:coverage   # core 커버리지 리포트
```

## 구조

- `packages/core` — `@spencer0124/rtzr-core`: 환경 중립 라이브러리(인증·업로드·폴링·포맷터).
- `packages/cli` — `@spencer0124/rtzr-cli`: `rtzr` CLI 겸 라이브러리(commander 기반, Whisper 호환 플래그).
- `packages/mcp-worker` — `@spencer0124/rtzr-mcp`: 원격 MCP 서버(Cloudflare Workers, stateless, BYO-key).
  npm 미배포(private) — `wrangler deploy`로 배포.
