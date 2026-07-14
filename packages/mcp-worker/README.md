# @spencer0124/rtzr-mcp

[RTZR (Return Zero)](https://developers.rtzr.ai/) STT API용 원격 MCP 서버. Cloudflare Workers 위에서
`@spencer0124/rtzr-core`를 그대로 재사용하는 stateless 서버로, `transcribe` tool 하나를 노출합니다.

npm에 배포되는 패키지가 아닙니다(`private: true`) — 이미 배포돼 있는 서버에 연결하려면:

```bash
claude mcp add --transport http rtzr https://rtzr.seungyongcho.com/mcp \
  --header "X-RTZR-CLIENT-ID: ..." --header "X-RTZR-CLIENT-SECRET: ..."
```

헤더를 생략해도 동작합니다 — 데모용 공유 키로 폴백하기 때문입니다(아래 "인증" 참고). 진지하게 쓰려면
자기 키를 헤더로 넣으세요.

## `transcribe` tool

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `input` | string (필수) | — | http(s) URL 또는 base64 인코딩된 오디오. 엣지 런타임엔 파일시스템이 없어 로컬 경로 불가 |
| `filename` | string | 자동 유추 | 코덱 판별용 파일명 힌트. URL은 경로/Content-Type에서 자동 추정, base64는 명시 권장 |
| `model` | `sommers` \| `whisper` | `sommers` | `whisper`는 `language`도 함께 지정해야 함 |
| `language` | `ko` \| `ja` \| `en` \| `detect` \| `multi` | `ko` | |
| `diarize` | boolean | `false` | 화자분리 |
| `speakers` | number | `0`(자동) | 예상 화자 수 |
| `keywords` | string[] | — | 키워드 부스팅(단어당 20자 이하, 최대 500개) |
| `format` | `txt` \| `srt` \| `vtt` \| `json` | `txt` | 출력 포맷 |

> **base64는 짧은 클립에만.** base64는 tool 호출 자체에 인라인되기 때문에 호출자(LLM)의 컨텍스트를
> 그대로 거칩니다 — 디코드 후 3MB(대략 1분 내외의 압축 음성)를 넘으면 즉시 에러로 거부합니다. 더 긴
> 파일은 아래 `request_upload_url`을 쓰세요.

## `request_upload_url` tool

긴 파일을 위한 프리사인 업로드. 인자 없이 호출하면(선택 `filename`) 1회용 업로드 URL과 그대로 실행 가능한
`curl -X PUT` 명령을 돌려줍니다. 호출자가 코드 실행/셸 환경을 갖고 있다면 그 curl을 **자기 샌드박스에서
직접** 실행해 로컬 파일을 서버로 스트리밍하고, 업로드가 끝나면 돌려받은 fetch URL을 `transcribe`의
`input`으로 넘기면 됩니다.

**왜 이게 base64 청크(예전 `upload_chunk`)보다 나은가**: base64를 한 번에 보내든 여러 청크로 쪼개서
보내든, 호출자(LLM)가 결국 생성해야 하는 총 텍스트 양은 그대로입니다 — 청크는 "한 번의 tool 호출이 너무
커서 실패하는" 문제만 없앨 뿐, "그 정도 분량을 애초에 모델이 자기 출력으로 만들어내야 한다"는 진짜 제약은
전혀 건드리지 못합니다. 프리사인 업로드는 **모델이 파일 바이트를 텍스트로 생성할 필요 자체를 없앱니다** —
sandbox가 로컬 파일을 곧바로 HTTP로 전송하기 때문입니다. `upload_chunk`는 이 근본 문제 때문에
제거했습니다(`LESSONS.md` #9).

- 만료 5분, 1회 사용, 최대 20MB.
- **주의**: claude.ai 같은 코드 실행 환경은 기본적으로 아웃바운드 네트워크가 막혀 있습니다. curl이
  네트워크 에러로 실패하면, 사용자가 Settings → Capabilities → Code execution and file creation →
  Additional allowed domains에 이 서버 도메인을 추가해야 합니다 — 우리가 대신 해줄 수 없는 1회성
  수동 단계입니다.
- **구현 메모**: 업로드된 파일을 `transcribe`가 다시 쓸 때, Worker가 자기 자신의 공개 URL을 fetch로
  재호출하면 안 됩니다 — Cloudflare에서 Worker가 자기 zone을 서브리퀘스트로 부르는 게 안정적으로
  동작하지 않아 프로덕션에서 간헐적 522가 났습니다. 그래서 `transcribe`는 `input`이 자기 서버의
  업로드 URL이면 HTTP를 타지 않고 **같은 Worker 실행 안에서 R2를 직접 읽습니다**
  (`handleTranscribe`의 `preResolvedAudio` 옵션).

## 설계

- **stateless**: `agents/mcp`의 `createMcpHandler` + `@modelcontextprotocol/sdk`의 `McpServer`.
  `McpAgent`/Durable Object를 쓰지 않습니다 — `transcribe`는 호출 하나로 완결되는 작업이라 요청 간 세션
  상태를 유지할 이유가 없습니다.
- **인증(BYO-key + 데모 폴백)**: `X-RTZR-CLIENT-ID` / `X-RTZR-CLIENT-SECRET` 요청 헤더를 우선 사용하고,
  헤더가 없는 필드만 `RTZR_CLIENT_ID`/`RTZR_CLIENT_SECRET` Worker secret(데모 공유 키)으로 폴백합니다
  (`src/handler.ts`의 `resolveCredentials`, 필드별 독립 폴백 — 헤더 하나만 와도 나머지 하나만 폴백됨).
  이 secret은 `wrangler secret put`으로 설정하며 **로컬 파일이 아니라 Cloudflare의 암호화 저장소로 바로
  전송**되므로 레포에 남는 값이 전혀 없습니다(`.dev.vars`는 `wrangler dev` 로컬 실행용이며 이미
  `.gitignore` 처리됨). 데모 키를 쓰는 익명 호출자는 다른 사람과 RTZR 쿼터를 공유하게 됩니다.
- **`transcribe` tool 입력**: 위 표 참고.
- **프리사인 업로드는 R2 + HMAC-SHA256**: `src/uploadUrl.ts`가 Web Crypto(`crypto.subtle`)로 업로드
  URL을 서명/검증합니다(`signUploadToken`/`verifyUploadToken`, 순수 함수라 실제 Workers 런타임 없이
  vitest로 검증). `PUT /uploads/:id`가 서명·만료·크기(20MB)를 검증해 R2에 저장, `transcribe`는 자기
  서버의 업로드 URL을 감지하면 R2를 직접 읽어 재사용(위 "구현 메모" 참고).
- **얇은 `index.ts` + 검증된 `handler.ts`/`uploadUrl.ts`**: 실제 로직(입력 해석, 자격증명 해석, 업로드
  서명, `core.transcribe()` 호출, 포맷, 에러 처리)은 `src/handler.ts`/`src/uploadUrl.ts`에 있고 각각의
  테스트가 주입 가능한 `fetchImpl`/`env`로 검증합니다. `src/index.ts`는 Worker/MCP 배선 + `/uploads/:id`
  HTTP 라우팅만 담당하는 얇은 레이어라 별도 유닛테스트 없이 `wrangler dev` + 실제 tool/HTTP 호출로
  검증합니다.

## 개발

```bash
pnpm typecheck
pnpm test
pnpm dev      # wrangler dev — Cloudflare 로그인 불필요, 로컬에서 /mcp 경로로 JSON-RPC 확인 가능
pnpm deploy   # wrangler deploy — Cloudflare 로그인 필요
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

더 자세한 배경은 `../../docs/concept.md` §8과 `../../CLAUDE.md`의 "packages/mcp-worker" 섹션 참고.
