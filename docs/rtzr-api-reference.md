# RTZR STT API 레퍼런스 (파일/배치 STT)

RTZR(Return Zero / vito.ai) 파일 STT API의 옵션을 **모델 비교 중심**으로 재구조화한 문서.
공식 문서(`developers.rtzr.ai/docs/stt-file/*`, 2026-07-14 fetch)를 정제한 원본 스냅샷은 `internal-docs/rtzr-api-raw.md`(로컬 전용, 커밋 안 됨) 참고.

> **한눈 요약**
> - 엔드포인트는 딱 2개: `POST /v1/transcribe`(요청) → `GET /v1/transcribe/{id}`(폴링).
> - 옵션은 많지만 **대부분 두 모델에 공통**. 모델별로 실제로 갈리는 건 `language`·`keywords`·`detect/multi` 3가지뿐.
> - 헷갈림의 원인은 **중첩·조건부 필드**(`diarization.spk_count`, `paragraph_splitter.max`, `language_candidates`)와 **모델 종속 제약**(`use_itn`은 sommers+ko 전용 등).

---

## 1. 요청 흐름

```
①  POST /v1/authenticate           (client_id/secret → access_token, 6h 만료)
②  POST /v1/transcribe             (file + config JSON → {id})
③  GET  /v1/transcribe/{id}        (5초 간격 폴링 → transcribing→completed/failed)
```

- **Base URL:** `https://openapi.vito.ai` (⚠ `rtzr.ai` 아님)
- **인증:** `POST /v1/authenticate`, `application/x-www-form-urlencoded`(`client_id`,`client_secret`) → `{access_token, expire_at}`. 토큰 **6시간** 만료. 이후 `Authorization: Bearer {token}`.
- **요청:** `POST /v1/transcribe`, `multipart/form-data` = `file`(binary) + `config`(JSON 문자열).
- **결과:** `GET /v1/transcribe/{id}`, **폴링(권장 5초, 더 짧으면 429)**. `status`가 `transcribing`이면 반복 조회.
- **지원 포맷:** mp4, m4a, mp3, amr, flac, wav.
- **제약:** 파일 최대 **2GB / 4시간**.

---

## 2. 모델 비교 (⚠ 핵심)

모델은 `model_name`으로 지정. 기본값 `sommers`.

| 항목 | **`sommers`** (기본) | **`whisper`** (리턴제로 파인튜닝) |
| --- | --- | --- |
| 정체 | 리턴제로 자체 개발 | OpenAI Whisper 한국어 파인튜닝 |
| 강점 | 빠른 응답, 다양한 도메인 | 다국어(100개) |
| **`language`** | **선택** (미설정 시 `ko`) | **필수** |
| 지원 언어 | `ko`, `ja` (2개) | ISO 639-1 100개 |
| `detect`/`multi` 언어 감지 | ✗ | ✅ (whisper 전용) |
| `language_candidates` | ✗ | ✅ (whisper 전용) |
| **`keywords` 표기** | 한글 발음 표기만 (순수 한글) | 한글+영어약자+숫자, **`language="ko"` 필수** |
| `use_itn` (영/숫자 변환) | ✅ (단, `language="ko"`일 때만) | ✗ (문서상 sommers ko 전용) |
| 기본 동시처리 제한(무료) | 10 | **2** |
| 기본 동시처리 제한(Basic) | 20 | 5 |

> 나머지 옵션(`use_diarization`, `domain`, `use_disfluency_filter`, `use_profanity_filter`,
> `use_paragraph_splitter`, `use_word_timestamp`)은 **두 모델 공통**으로 동작(문서상 모델 구분 없음).

---

## 3. 전체 config 옵션표

**적용 모델**과 **의존관계**(어느 필드가 켜져야 유효한지)를 함께 표기.

| 필드 | 타입 | 기본값 | 허용값 | 적용 모델 | 의존관계 / 비고 |
| --- | --- | --- | --- | --- | --- |
| `model_name` | string | `sommers` | `sommers`, `whisper` | — | — |
| `language` | string | `ko` | `ko`,`ja`,(whisper)`detect`,`multi`,ISO코드 | 공통 | **whisper는 필수**. sommers는 `ko`/`ja`만 |
| `language_candidates` | array | `["ko","ja","zh","en"]` | ISO 코드 배열 | **whisper 전용** | `language`가 `detect`/`multi`일 때만 |
| `use_diarization` | boolean | `false` | — | 공통 | 다중채널과 배타적 |
| `diarization.spk_count` | integer | `0`(예측) | 0 이상 정수 | 공통 | **`use_diarization=true`일 때만** |
| `use_itn` | boolean | `true` | — | **sommers+`ko` 전용** | 영어/숫자/단위 표기 변환 |
| `use_disfluency_filter` | boolean | `true` | — | 공통 | 간투어(`음`,`뭐`) 제거 |
| `use_profanity_filter` | boolean | `false` | — | 공통 | 욕설 `*` 마스킹 |
| `use_paragraph_splitter` | boolean | `true` | — | 공통 | 문단 나누기 |
| `paragraph_splitter.max` | integer | `50` | 1 이상 정수 | 공통 | **`use_paragraph_splitter=true`일 때만** |
| `domain` | string | `GENERAL` | `GENERAL`,`CALL` | 공통 | `CALL`=통화 특화 |
| `use_word_timestamp` | boolean | `false` | — | 공통 | `utterances[].words[]` 추가 |
| `keywords` | array | — | 문자열 배열 | 한국어 전사만 | 단어당 20자↓, 최대 500개. **score 문법 없음** |
| *다중 채널* | — | — | — | 공통 | config 플래그 아님 — **별도 문의** 필요 |

---

## 4. 모델별로 갈리는 지점 (deep-dive)

### 4-1. `language`
- **sommers:** 선택. `ko`(기본) 또는 `ja`만. 그 외 값 불가.
- **whisper:** **필수.** ISO 639-1 100개 + 특수값 `detect`/`multi`.

### 4-2. 언어 감지 — `detect` / `multi` (⚠ whisper 전용)
- **`detect`** — 오디오 전체가 단일 언어인데 무슨 언어인지 모를 때 자동 감지.
- **`multi`** — 문장/구간별로 언어가 섞인 오디오(국제 회의 등).
- 둘 다 `language_candidates`로 후보를 좁혀 정확도↑ (기본 `["ko","ja","zh","en"]`). ⚠ 후보 많을수록 정확도 하락 가능.

### 4-3. `keywords` 표기 규칙 (⚠ 가장 헷갈리는 부분)

한국어 전사에만 지원. **가중치(score) 문법 없음 — plain 문자열 배열.**

| | **sommers** | **whisper** |
| --- | --- | --- |
| 표기 | **한글 발음대로**, 순수 한글만 | 한글 + 영어약자 + 숫자 조합 |
| 언어 조건 | — | **`language="ko"` 필수** |
| O 예시 | `에스티티`, `에이피아이` | `stt`, `에스티티`, `위스퍼 V2`, `Api` |
| X 예시 | `STT`, `api`, `에스TT`, `에스티티2` | 발음-표기 경계 모호: `Agenda`, `1on1`, `B2B` |

- 영어+숫자 조합은 **표기=발음인 약어만** 효과 있음(`STT`,`CBT`,`V2`).
- 공통 제한: 단어당 **20자 이하**, 최대 **500개**.

---

## 5. 중첩·조건부 필드 주의 (⚠ 반복 함정)

flat하게 쓰면 무시되거나 에러 나는 **중첩 필드**들:

```jsonc
{
  "use_diarization": true,
  "diarization": { "spk_count": 2 },        // ⚠ diarization.spk_count — flat 아님

  "use_paragraph_splitter": true,
  "paragraph_splitter": { "max": 80 },      // ⚠ paragraph_splitter.max — flat 아님

  "language": "multi",
  "language_candidates": ["ko", "en"]       // language=detect|multi일 때만 유효
}
```

- **`diarization.spk_count`** — `use_diarization=false`면 `diarization` 객체 자체를 설정 불가. 미설정 시 화자 수 자동 예측(전화면 `2` 권장).
- **`paragraph_splitter.max`** — `use_paragraph_splitter=true`인데 미설정 시 `50`. 권장: 50(모바일)/80(태블릿)/130(PC). ⚠ 단일 문장이 max보다 길면 초과 문단 반환 가능.
- **`language_candidates`** — `language`가 `detect`/`multi`가 아니면 무시.

### 배타 관계
- **화자 분리 ↔ 다중 채널:** 함께 못 씀. 다중 채널이면 화자분리 미동작, `spk`에 채널 ID 순차 부여.
- 문단 나누기 × 화자 분리: 화자분리 시 **화자 발화 단위**로 문단 나눔, 미사용 시 파일 전체 기준.

---

## 6. 프리셋 (공식 샘플)

| 프리셋 | config |
| --- | --- |
| sommers 기본 | `{ "model_name": "sommers", "use_diarization": false, "domain": "GENERAL" }` |
| sommers 통화+화자분리 | `{ "model_name": "sommers", "domain": "CALL", "use_diarization": true, "diarization": { "spk_count": 2 } }` |
| sommers 일본어 | `{ "model_name": "sommers", "language": "ja", "use_diarization": false }` |
| whisper 영어+화자분리 | `{ "model_name": "whisper", "language": "en", "use_diarization": true }` |
| whisper 다국어 감지 | `{ "model_name": "whisper", "language": "multi", "language_candidates": ["ko","en","ja"] }` |
| 키워드 부스팅 | `{ "keywords": ["에스티티", "에이피아이"] }` (sommers) |
| 단어 타임스탬프 | `{ "use_word_timestamp": true }` |
| 문단 80자 | `{ "use_paragraph_splitter": true, "paragraph_splitter": { "max": 80 } }` |

---

## 7. 응답 스키마 (`GET /v1/transcribe/{id}`)

```jsonc
{
  "id": "{TRANSCRIBE_ID}",
  "status": "completed",              // transcribing | completed | failed
  "results": {
    "utterances": [
      {
        "start_at": 4737,             // ms
        "duration": 2360,             // ms
        "msg": "안녕하세요.",
        "spk": 0,                     // 화자/채널 ID
        "lang": "ko",                 // 설정 언어, 또는 detect/multi 시 예측 언어
        "spk_type": "NORMAL",         // (옵션에 따라) 화자 유형
        "words": [                    // use_word_timestamp=true일 때만
          { "start_at": 4737, "duration": 600, "text": "안녕하세요." }
        ]
      }
    ]
  }
}
```

| 필드 | 설명 | 단위/값 |
| --- | --- | --- |
| `status` | 전사 상태 | `transcribing`/`completed`/`failed` |
| `utterances[].start_at` | 발화 시작 | ms |
| `utterances[].duration` | 발화 길이 | ms |
| `utterances[].msg` | 발화 텍스트 | string |
| `utterances[].spk` | 화자/채널 ID | integer |
| `utterances[].lang` | 언어 | ISO 639-1 |
| `utterances[].words[]` | 단어별 `start_at`/`duration`/`text` | `use_word_timestamp=true` 시 |

> ⚠ **`spk`는 화자분리를 요청하지 않아도 항상 내려온다** (단일 채널이면 `spk: 0`).
> "spk 필드 존재 여부"로 화자분리 여부를 판단하면 안 됨.
>
> **failed:** `{ "id": "...", "status": "failed", "error": { "code": "...", "message": "..." } }`

---

## 8. 오류 코드

| 단계 | HTTP | Code | 의미 |
| --- | --- | --- | --- |
| POST | 400 | H0001 | 잘못된 파라미터 |
| POST | 400 | H0010 | 지원하지 않는 파일 포맷 |
| POST | 401 | H0002 | 유효하지 않은 토큰 |
| POST | 413 | H0005 | 파일 사이즈 초과 |
| POST | 413 | H0006 | 파일 길이 초과 |
| POST | 429 | A0001 | 사용량 초과 |
| POST | 429 | A0002 | 동시 처리 제한 초과 |
| GET | 403 | H0003 | 권한 없음 |
| GET | 404 | H0004 | 전사 결과 없음 |
| GET | 410 | H0007 | 전사 결과 만료됨 |
| GET | 429 | A0003 | 요청 제한 초과(폴링 과다) |
| 공통 | 500 | E500 | 서버 오류 |

---

## 9. 처리량 제한

시간 기반이 아니라 **동시 처리량** 기준, **계정(organization) 단위**.

**파일 STT 동시처리제한(= 동시 in-flight 파일 수), 모델별 차등:**

| 등급 | `sommers` | `whisper` |
| --- | :---: | :---: |
| 무료 | 10 | 2 |
| Basic | 20 | 5 |
| Enterprise | 협의 | 협의 |

- 초과 시 `429` + `{"code":"A0002"}`.
- 권장 대응: **지수 백오프**(1→2→4→8초), **클라이언트 큐**(동시처리제한만큼만 in-flight 유지).

---

## 10. Enterprise 기능 (참고용 — 본 프로젝트 미사용)

> 아래 3종은 **Enterprise 라이선스 계약 필요**. 이 프로젝트에서는 사용하지 않으며, 구분을 위해 별도 섹션에만 기재.

| 기능 | 파라미터 | 요약 |
| --- | --- | --- |
| 개인정보 필터 | `use_pii`(false), `pii_preset`(`all`/`finance`) | 이름·전화·주민번호·카드번호 등을 `*` 마스킹 |
| 전사 결과 보정 (NEW) | `use_refinement`(false) | 오디오 근거로 텍스트 교정. `GET ...?result=refined`, `refine_status`. **다중채널과 배타적** |
| 인사이트 (NEW) | `use_insight`(false), `insight.prompt` | 전사 기반 요약/분류. `results.insight[]`(title/summary/category) |

---

### 참고
- 원본 스냅샷: `internal-docs/rtzr-api-raw.md` (로컬 전용, 커밋 안 됨)
- 공식 문서: https://developers.rtzr.ai/docs/stt-file/
- 이 프로젝트가 실제 사용하는 범위: 위 3~9절(파일 STT config). Enterprise·스트리밍 제외.
