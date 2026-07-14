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
- **얇은 `index.ts` + 검증된 `handler.ts`**: 실제 로직(입력 해석, 자격증명 해석, `core.transcribe()` 호출,
  포맷, 에러 처리)은 `src/handler.ts`에 있고 `src/handler.test.ts`가 주입 가능한 `fetchImpl`/`env`로
  검증합니다. `src/index.ts`는 Worker/MCP 배선만 담당하는 얇은 레이어라 별도 유닛테스트 없이
  `wrangler dev` + 실제 tool 호출로 검증합니다.

## 개발

```bash
pnpm typecheck
pnpm test
pnpm dev      # wrangler dev — Cloudflare 로그인 불필요, 로컬에서 /mcp 경로로 JSON-RPC 확인 가능
pnpm deploy   # wrangler deploy — Cloudflare 로그인 필요
```

데모 폴백 키 설정(최초 1회, 값은 저장소 어디에도 남지 않음):

```bash
echo "$RTZR_CLIENT_ID" | wrangler secret put RTZR_CLIENT_ID
echo "$RTZR_CLIENT_SECRET" | wrangler secret put RTZR_CLIENT_SECRET
```

로컬 확인 예시:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

더 자세한 배경은 `../../docs/concept.md` §8과 `../../CLAUDE.md`의 "packages/mcp-worker" 섹션 참고.
