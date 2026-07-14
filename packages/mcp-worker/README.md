# @spencer0124/rtzr-mcp

[RTZR (Return Zero)](https://developers.rtzr.ai/) STT API용 원격 MCP 서버. Cloudflare Workers 위에서
`@spencer0124/rtzr-core`를 그대로 재사용하는 stateless 서버로, `transcribe` tool 하나를 노출합니다.

npm에 배포되는 패키지가 아닙니다(`private: true`) — 이미 배포돼 있는 서버에 연결하려면:

```bash
claude mcp add --transport http rtzr https://rtzr.seungyongcho.com/mcp \
  --header "X-RTZR-CLIENT-ID: ..." --header "X-RTZR-CLIENT-SECRET: ..."
```

## 설계

- **stateless**: `agents/mcp`의 `createMcpHandler` + `@modelcontextprotocol/sdk`의 `McpServer`.
  `McpAgent`/Durable Object를 쓰지 않습니다 — `transcribe`는 호출 하나로 완결되는 작업이라 요청 간 세션
  상태를 유지할 이유가 없습니다.
- **BYO-key**: `X-RTZR-CLIENT-ID` / `X-RTZR-CLIENT-SECRET` 요청 헤더로 매 요청마다 자격증명을 받습니다.
  서버는 키를 저장하지 않습니다.
- **`transcribe` tool 입력**: `input`(http(s) URL 또는 base64), `filename?`(코덱 추정용, base64 입력 시
  권장), `model?`(`sommers`\|`whisper`, whisper는 `language` 필수), `language?`, `diarize?`, `speakers?`,
  `keywords?`, `format?`(`txt`\|`srt`\|`vtt`\|`json`).
- **얇은 `index.ts` + 검증된 `handler.ts`**: 실제 로직(입력 해석, `core.transcribe()` 호출, 포맷, 에러 처리)은
  `src/handler.ts`에 있고 `src/handler.test.ts`가 주입 가능한 `fetchImpl`로 검증합니다. `src/index.ts`는
  Worker/MCP 배선만 담당하는 얇은 레이어라 별도 유닛테스트 없이 `wrangler dev` + 실제 tool 호출로 검증합니다.

## 개발

```bash
pnpm typecheck
pnpm test
pnpm dev      # wrangler dev — Cloudflare 로그인 불필요, 로컬에서 /mcp 경로로 JSON-RPC 확인 가능
pnpm deploy   # wrangler deploy — Cloudflare 로그인 필요
```

로컬 확인 예시:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

더 자세한 배경은 `../../docs/concept.md` §8과 `../../CLAUDE.md`의 "packages/mcp-worker" 섹션 참고.
