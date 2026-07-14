# 실수/교훈 기록

`CLAUDE.md`에서 분리된 문서. 이 레포에서 작업할 때 반복하지 않기 위한 기록이니, 관련 작업(포맷터 추가,
API 응답 필드 가정, `@types/node`/pnpm 빌드 이슈, vitest fetch mock, 시크릿 취급) 전에 한 번 훑을 것.

1. **`toSrt`/`toVtt` 화자 라벨 조건 불일치 (진짜 버그, 실 API로 발견)**
   `toTxt`는 `opts.speakerLabels`가 true일 때만 `[Speaker N]`을 붙이는데, `toSrt`/`toVtt`는 `u.spk !== undefined`
   만 보고 무조건 붙였음. RTZR API는 화자분리를 요청하지 않아도 `spk: 0`을 항상 내려주므로, `--diarize` 없이
   돌려도 SRT/VTT엔 `[Speaker 0]`이 찍히는 버그였음. `-f all`로 4개 포맷을 한 번에 뽑아 txt와 srt/vtt를
   육안 비교하다가 발견. 세 포맷터 모두 `opts.speakerLabels` 명시적 opt-in으로 통일해서 수정, 회귀 테스트 추가,
   **실 API로 CLI 바이너리 재실행까지** 해서 확인함. (`packages/core/src/formatters.ts`의 BUGFIX 주석 참고.)
   → 교훈: 같은 데이터를 여러 형식으로 찍어내는 자매 함수(sibling formatters)를 만들 때는 조건 로직을
   한 곳에서 공유하거나, 최소한 시그니처를 통일해서 "하나만 다르게 짜는" 실수를 구조적으로 막을 것.

2. **`concept.md`의 API 설계 가정 2건이 실측과 달랐음**
   - `keywords`에 `단어:score` 가중치 문법이 있다고 가정했으나, 실제 API는 가중치 없는 plain 문자열 배열만 지원.
   - `spk_count`가 flat 필드라고 가정했으나, 실제로는 `diarization.spk_count`로 중첩.
   → 교훈: 외부 API를 감싸는 설계 문서는 초안 단계에서 "그럴듯한 추측"으로 쓰고, **구현 직전에 반드시 공식
   문서로 재검증**할 것. 이번엔 `fetch_url`로 실제 페이지를 읽고서야 잡혔음.

3. **`@types/node` 누락으로 빌드 실패**
   `client.ts`에서 `fetch`/`Blob` 전역 타입을 못 찾는다는 에러(`Cannot find name 'fetch'`)가 났음. Node 18+의
   전역 fetch/Blob 타입 선언은 `lib.dom`이 아니라 `@types/node`에서 옴 — devDependency로 빠뜨렸던 게 원인.
   → 교훈: `fetch`/`Blob`/`FormData` 같은 Node 전역 웹 API를 쓰는 패키지는 `@types/node`를 반드시 devDependency로.

4. **pnpm의 postinstall 스크립트 차단 (esbuild)**
   pnpm이 공급망 보안 기본값으로 `esbuild`의 postinstall 빌드 스크립트를 막고 `pnpm-workspace.yaml`에
   `allowBuilds` 스텁을 자동으로 추가함. `esbuild: true`로 명시 승인해야 tsup/vitest가 정상 동작.
   → 이건 실수라기보단 pnpm의 정상적인 안전장치. 처음 보는 사람은 당황할 수 있어서 기록.

5. **vitest가 테스트 파일 없는 패키지에서 실패 종료**
   `packages/cli`엔 아직 유닛테스트가 없는데, 그냥 `vitest run`은 "No test files found"로 exit 1을 뱉어서
   `pnpm -r test`가 전체 실패로 잡힘. `test` 스크립트에 `--passWithNoTests` 추가해서 해결.

6. **fetch mock에서 같은 `Response` 인스턴스를 여러 번 재사용 → body 재사용 에러**
   `vi.fn().mockResolvedValue(response)`는 매 호출마다 **같은 Response 객체**를 반환하는데, Fetch API의
   Response body는 한 번만 읽을 수 있어서(`.json()` 호출 시 스트림 소비) 두 번째 호출에서
   `TypeError: Body is unusable: Body has already been read`가 남. `mockImplementation(async () => freshResponse())`
   로 매번 새 Response를 만들도록 고침.

7. **채팅에 붙여넣은 `RTZR_CLIENT_SECRET`을 옮겨 적다가 마지막 글자(`h`) 하나를 빠뜨림**
   실 API 첫 호출에서 `401 H0002 invalid credential`이 남. 원인은 API 문제가 아니라 단순 오타였음.
   → 교훈: 사람이 채팅에 붙여넣은 긴 시크릿 문자열을 손으로 옮겨 적지 말고, 가능하면 그대로 복사해서 쓰거나
   최소한 재확인할 것. 그리고 애초에 **채팅에 시크릿이 여러 번 노출됐으므로, 공개 배포 전 RTZR 콘솔에서
   반드시 rotate**할 것 (아직 안 함 — 해야 할 일로 남아있음, `CLAUDE.md`의 "레포 상태" 참고).

8. **`this.fetchImpl(...)`로 저장해둔 bare `fetch` 참조가 Cloudflare Workers에서 `Illegal invocation`으로 터짐**
   `RtzrClient` 생성자가 `opts.fetchImpl ?? fetch`로 기본값을 저장하고 나중에 `this.fetchImpl(url, init)`처럼
   메서드 호출 형태로 불렀는데, 이러면 Workers/브라우저의 `fetch` 구현이 기대하는 리시버가 아니라
   `RtzrClient` 인스턴스가 `this`로 잡혀서 `Illegal invocation` 런타임 에러가 남. Node의 `fetch`(undici)는
   이 바인딩 문제에 관대해서 vitest로는 절대 안 잡히고, **`packages/mcp-worker`를 `wrangler dev`로 실제
   Workers 런타임에 띄워서 `tools/call`까지 왕복시켜보고서야** 발견함. `opts.fetchImpl ?? fetch.bind(globalThis)`
   로 고침(`packages/core/src/client.ts`, `packages/mcp-worker/src/handler.ts` 둘 다).
   → 교훈: "환경 중립" 코드는 타입체크·유닛테스트가 초록이어도 **실제 목표 런타임(Workers)에서 한 번은
   돌려봐야** 이런 종류의 버그를 잡는다. 함수 참조를 변수에 저장했다가 나중에 호출할 거면 `.bind(...)`를
   습관화할 것.
