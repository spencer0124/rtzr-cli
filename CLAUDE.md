# rtzr-cli — Claude Code 프로젝트 메모

RTZR(Return Zero / vito.ai) STT API를 감싸는 환경 중립 `core` 라이브러리 + Whisper 스타일 CLI(`rtzr`, 패키지명
`@seungyongcho/rtzr-cli`)
+ (로드맵) 원격 MCP. 전체 기획은 `docs/concept.md` 참고 (⚠ 이 문서는 내부 메모라 공개 repo에는 포함 금지 —
아직 `.gitignore`에 반영 안 됨, 공개 전 처리 필요. 아래 "레포 상태" 참고).

## RTZR API 공식 문서 (실측 근거)

전부 `mcp__docs-mcp-server__fetch_url`로 직접 확인한 링크. 스펙이 헷갈리면 재확인할 것 — concept.md의 초기
설계 가정 중 최소 2건이 실제 API와 달랐다(`LESSONS.md` 참고).

- 개요: https://developers.rtzr.ai/docs/
- 인증: https://developers.rtzr.ai/docs/authentications/
- 배치/파일 STT (핵심): https://developers.rtzr.ai/docs/stt-file/
- 키워드 부스팅: https://developers.rtzr.ai/docs/stt-file/keywords/
- 화자분리: https://developers.rtzr.ai/docs/stt-file/diarization/
- 처리량 제한: https://developers.rtzr.ai/docs/rate_limit/

## API 핵심 스펙 요약 (자주 까먹는 것들)

- Base URL: `https://openapi.vito.ai` (⚠ `rtzr.ai`가 아니라 `vito.ai`).
- `POST /v1/authenticate` — `application/x-www-form-urlencoded`, `client_id`/`client_secret` → `{access_token, expire_at}`. 토큰 만료 **6시간**.
- `POST /v1/transcribe` — `multipart/form-data`(`file` + `config` JSON 문자열), `Authorization: Bearer` → `{id}`.
- `GET /v1/transcribe/{id}` — 폴링, 권장 간격 **5초**(더 짧으면 429). `status: transcribing|completed|failed`.
- **`spk_count`는 `diarization.spk_count`로 중첩** — flat 필드 아님.
- **`keywords`는 가중치(score) 문법이 없는 plain 문자열 배열.** `단어:score` 같은 건 존재하지 않음. `sommers`
  모델은 한글 발음 표기 필수, `whisper`는 한글+영어약자+숫자. 단어당 20자 이하, 최대 500개.
- 응답 utterance 필드: `start_at`(ms), `duration`(ms), `msg`, `spk`, `spk_type`, `lang`.
- **`spk`는 화자분리를 요청하지 않아도 항상 내려온다**(단일 채널이면 `spk: 0`). "spk 필드 존재 여부"로 화자분리
  여부를 판단하면 안 됨 — `LESSONS.md` #1이 정확히 이 실수였음.

## 코드 규칙

- `packages/core`는 환경 중립 유지: `fs`/`process.env` 직접 참조 금지. 오디오=바이트, 키=인자로만 받음
  (Cloudflare Workers에서 그대로 돌리기 위함 — `client.ts` 상단 주석 참고).
- 포맷터(`toTxt`/`toSrt`/`toVtt`)는 순수 함수. 화자 라벨은 **`opts.speakerLabels`로 opt-in**해야 함(`LESSONS.md` #1 참고).
- `fetch`의 `Response` 객체는 body를 **한 번만** 읽을 수 있음 — vitest에서 fetch mock을 여러 번 호출해야 하면
  `mockResolvedValue(sameResponse)`가 아니라 `mockImplementation(() => freshResponse())`를 써야 함.

## 실수/교훈

- **경로:** `LESSONS.md`
- **언제 봐라:** 포맷터(`toTxt`/`toSrt`/`toVtt`) 추가·수정, RTZR API 응답 필드 관련 가정, `@types/node`/pnpm
  빌드 이슈, vitest fetch mock 작성, 시크릿(`RTZR_CLIENT_SECRET`) 취급 시.
- 반복 방지용 기록이니 관련 작업 전에 한 번 훑을 것. 이 레포에서 실제로 겪은 버그·설계 오판·환경 함정 7건이
  정리돼 있다.

## 레포 상태 / 아직 정리 안 된 것

- git 루트 = pnpm 모노레포 루트 (`project/rtzr-cli/`, 이 폴더). 예전엔 `project/rtzr-stt/rtzr-stt/`로 이중
  중첩돼 있었으나 2026-07-14에 평탄화 + `rtzr-stt` → `rtzr-cli` 리네임 완료.
- `docs/concept.md`와 `docs/*.pdf`(인턴 과제 안내 자료)는 **공개 repo에 포함 금지** (concept.md 자체에 명시됨).
  아직 `.gitignore`에 반영 안 됐으므로 공개(git push) 전 반드시 처리할 것.
- `RTZR_CLIENT_SECRET`은 아직 rotate 안 됨 (`LESSONS.md` #7).
- 이번 세션 라이브 테스트 산출물이 `out/`, `out_diarized/`에 남아있음 — 확인용, 필요 없으면 정리 가능.
