# @spencer0124/rtzr-mcp

[RTZR (Return Zero)](https://developers.rtzr.ai/) STT API용 원격 MCP 서버입니다. Cloudflare Workers 위에서
`@spencer0124/rtzr-core`를 그대로 재사용하는 stateless 서버입니다. `transcribe`와 `request_upload_url`
두 tool을 노출합니다.

npm에 배포되는 패키지가 아닙니다(`private: true`). 이미 배포돼 있는 서버에 연결하려면:

```bash
claude mcp add --transport http rtzr https://rtzr.seungyongcho.com/mcp \
  --header "X-RTZR-CLIENT-ID: ..." --header "X-RTZR-CLIENT-SECRET: ..."
```

헤더를 생략해도 동작합니다. 데모용 공유 키로 폴백하기 때문입니다(아래 "설계"의 인증 참고).
진지하게 쓰려면 자기 키를 헤더로 넣으세요.

## `transcribe` tool

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `input` | string (필수) | — | http(s) URL 또는 base64 인코딩된 오디오. 엣지 런타임엔 파일시스템이 없어 로컬 경로 불가 |
| `filename` | string | 자동 유추 | 코덱 판별용 파일명 힌트. URL은 경로/Content-Type에서 자동 추정, base64는 명시 권장 |
| `model` | `sommers` \| `whisper` | `sommers` | `whisper`는 `language`도 함께 지정해야 함 |
| `language` | `ko` \| `ja` \| `en` \| `detect` \| `multi` | `ko` | |
| `languageCandidates` | string[] | `ko/ja/zh/en` | `model: whisper` 전용 |
| `diarize` | boolean | `false` | 화자분리 |
| `speakers` | number | `0`(자동) | 예상 화자 수 — `diarize: true` 필요 |
| `keywords` | string[] | — | 키워드 부스팅(단어당 20자 이하, 최대 500개) |
| `itn` | boolean | `true` | 역정규화(예: "이십삼" → "23") |
| `disfluencyFilter` | boolean | `true` | 간투어(어, 음 등) 필터 |
| `profanityFilter` | boolean | `false` | 비속어 필터 |
| `paragraphSplitter` | boolean | `true` | 문단 나누기 |
| `paragraphSplitterMax` | number | `50` | 문단 최대 글자 수(`paragraphSplitter` on일 때만) |
| `wordTimestamps` | boolean | `false` | 각 발화에 단어별 `words[]`(시작/길이/텍스트) 추가 — **`format: "json"`에서만 보임** |
| `domain` | `GENERAL` \| `CALL` | `GENERAL` | 오디오 도메인 힌트 |
| `format` | `txt` \| `srt` \| `vtt` \| `json` | `txt` | 출력 포맷 |

> 위 기본값은 RTZR 공식 문서(`developers.rtzr.ai/docs/stt-file/`, 2026-07-14 확인)를 그대로 반영했습니다.
> `paragraphSplitter`는 API 기본값이 `true`라 이 파라미터를 노출하기 전에도 조용히 적용되고 있었습니다.
> `wordTimestamps`가 추가하는 `words[]`는 `format: "json"`에서만 보입니다. `toTxt`/`toSrt`/`toVtt`는
> 발화(utterance) 단위를 유지합니다.

> **base64는 짧은 클립 전용입니다.** tool 호출에 인라인되어 LLM 컨텍스트를 그대로 거칩니다.
> 디코드 후 3MB(약 1분 분량)를 넘으면 즉시 에러로 거부합니다. 긴 파일은 아래 `request_upload_url`을 쓰세요.

## `request_upload_url` tool

3MB를 넘는 오디오는 프리사인 업로드로 보냅니다.

1. tool을 호출하면(선택 인자 `filename`) **1회용 업로드 URL과 실행 가능한 `curl -X PUT` 명령**을 돌려줍니다.
2. 그 curl을 코드 실행 샌드박스에서 실행합니다. 파일은 LLM 컨텍스트를 거치지 않습니다.
3. 반환된 fetch URL을 `transcribe`의 `input`으로 넘깁니다.

| 제약     | 값   |
| -------- | ---- |
| 만료     | 5분  |
| 사용     | 1회  |
| 최대크기 | 20MB |

- base64 청킹(예전 `upload_chunk`)은 폐기했습니다. 청크로 쪼개도 LLM이 생성해야 하는 총 텍스트 양은
  그대로이기 때문입니다(`LESSONS.md` #9). 프리사인 업로드는 그 생성 자체를 없앱니다.
- claude.ai 같은 코드 실행 환경은 아웃바운드 네트워크가 기본 차단입니다. curl이 실패하면 사용자가
  Settings → Capabilities → Code execution and file creation → Additional allowed domains에 이 서버
  도메인을 추가해야 합니다.

## 설계

- **stateless**: `agents/mcp`의 `createMcpHandler`와 `@modelcontextprotocol/sdk`의 `McpServer`를 씁니다.
  `transcribe`는 호출 하나로 완결되는 작업이라 `McpAgent`/Durable Object를 쓰지 않습니다.
- **인증(BYO-key + 데모 폴백)**: `X-RTZR-CLIENT-ID` / `X-RTZR-CLIENT-SECRET` 요청 헤더를 우선 씁니다.
  헤더가 없는 필드만 Worker secret(데모 공유 키)으로 폴백합니다(`src/handler.ts`의 `resolveCredentials`,
  필드별 독립 폴백). 서버는 어느 쪽 키도 저장하지 않습니다. 데모 키를 쓰는 호출자는 다른 사람과 RTZR
  쿼터를 공유합니다.
- **프리사인 업로드(R2 + HMAC-SHA256)**: `src/uploadUrl.ts`가 Web Crypto로 업로드 URL을 서명·검증합니다
  (`signUploadToken`/`verifyUploadToken`, 순수 함수라 vitest로 검증). `PUT /uploads/:id`가 서명·만료·크기를
  확인해 R2에 저장합니다.
- **셀프-fetch 금지**: `transcribe`는 `input`이 자기 서버의 업로드 URL이면 HTTP를 타지 않고 같은 Worker
  실행 안에서 R2를 직접 읽습니다(`handleTranscribe`의 `preResolvedAudio`). Worker가 자기 zone을
  서브리퀘스트로 부르면 프로덕션에서 간헐적 522가 나기 때문입니다(`LESSONS.md` #9).
- **얇은 `index.ts` + 검증된 `handler.ts`/`uploadUrl.ts`**: 실제 로직은 `src/handler.ts`/`src/uploadUrl.ts`에
  있고, 주입 가능한 `fetchImpl`/`env`로 테스트합니다. `src/index.ts`는 Worker/MCP 배선과 `/uploads/:id`
  라우팅만 담당합니다. 배선은 `wrangler dev`와 실제 tool/HTTP 호출로 검증합니다.

## 개발

```bash
pnpm typecheck
pnpm test
pnpm dev      # wrangler dev (Cloudflare 로그인 불필요), 로컬 /mcp 경로로 JSON-RPC 확인
pnpm deploy   # wrangler deploy (Cloudflare 로그인 필요)
```

필요한 인프라(최초 1회):

```bash
wrangler r2 bucket create rtzr-uploads               # 프리사인 업로드 저장소
echo "$RTZR_CLIENT_ID" | wrangler secret put RTZR_CLIENT_ID       # 데모 폴백 키
echo "$RTZR_CLIENT_SECRET" | wrangler secret put RTZR_CLIENT_SECRET
openssl rand -hex 32 | wrangler secret put UPLOAD_SIGNING_SECRET  # 업로드 URL 서명용, RTZR 키와 별개
```

값은 전부 Cloudflare의 암호화 저장소로 바로 전송되며 레포 어디에도 남지 않습니다(로컬 `wrangler dev`용
값만 `.dev.vars`에, 이미 `.gitignore` 처리됨).

로컬 확인 예시:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

더 자세한 배경은 `../../internal-docs/concept.md`(내부 기획 메모, repo에는 커밋되지 않음) §8과
`../../CLAUDE.md`의 "packages/mcp-worker" 섹션을 참고하세요.
