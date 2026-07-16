# RTZR config 제약: 가설 검증

파일 STT `config`의 교차 필드·모델 종속 제약을 문서 기반 **가설**로 세우고, 실제 API 호출로 **검증**한 결과.

- 실측: 2026-07-14 · 오디오 `test_audio/01.mp3` · raw `config`를 `POST /v1/transcribe`에 직접 전송(`mapping.ts` 우회) 후 HTTP 상태로 판정.
- 재실측: 2026-07-16 · 최초 실행에서 429(동시처리 초과)로 판정 불가였던 P3·P4를 순차 실행(앞 잡 완료를 5초 폴링으로 확인 후 다음 제출)으로 재실행 — 둘 다 200 확정.

---

## 1. 초기 가설 (문서 근거)

`A → B` = "A이면 반드시 B"(requires) · `¬(A ∧ B)` = 상호 배타(excludes)

| # | 가설 | 문서 근거 |
| --- | --- | --- |
| C1 | `model=whisper` → `language` 설정 | whisper는 language 필수 (model/language 페이지) |
| C2 | `language∈{detect,multi}` → `model=whisper` | detect/multi는 whisper 전용 (language 페이지) |
| C3 | `language_candidates` 설정 → `language∈{detect,multi}` | "candidates는 detect/multi일 때만 적용" (language 페이지) |
| C4 | `use_itn` → `model=sommers ∧ language=ko` | "Sommers 모델의 language가 ko일 때만" (itn 페이지) |
| C5 | `diarization.spk_count` 설정 → `use_diarization=true` | "use_diarization=false면 diarization 설정 불가" (diarization 페이지) |
| C6 | `paragraph_splitter.max` 설정 → `use_paragraph_splitter=true` | max는 splitter true일 때만 (paragraph 페이지) |
| C7 | `keywords≠[]` → 전사 언어=`ko` | "현재 한국어 전사에만 지원" (keywords 페이지) |
| C8 | `¬(use_diarization ∧ multi_channel)` | 다중채널이면 화자분리 미동작 (diarization 페이지) |
| C9 | `use_refinement` → `¬multi_channel` (Enterprise) | multi_channel과 배타 (refinement 페이지) |
| B1 | keyword ≤20자·≤500개, spk_count ≥0, max ≥1 | 마스터/각 페이지 |

---

## 2. 검증 결과

O = 가설이 실측과 일치 · X = 불일치(수정/폐기 필요)

| # | 가설 | 결과 | 비고 |
| --- | --- | :---: | --- |
| C1 | whisper → language | **O** | whisper 무-language = 400 `unsupported language` [T9] |
| C2 | detect/multi → whisper | **O** | sommers+detect = 400 `unsupported language` [T6] |
| C3 | candidates → detect/multi | **X** | 실제 조건은 detect/multi가 아니라 **whisper**. whisper에서 ko·detect·multi 전부 candidates 수용=200 [P1,P2,P3], sommers+candidates=400 [P5,T7] |
| C4 | use_itn → sommers+ko | **X** | API가 거부 안 하고 **무시**. whisper+use_itn=true=200 [T5] |
| C5 | spk_count → use_diarization | **O** | spk_count 단독 = 400 `diarization cannot be used without use_diarization` [T1,T2] |
| C6 | max → use_paragraph_splitter | **X** | API가 거부 안 하고 **무시**. max 단독/splitter=false=200 [T3,T4] |
| C7 | keywords → ko | **X** | API가 거부 안 하고 **무시**. sommers+ja+keywords=200 [T8] |
| C8·C9 | multi_channel 배타 | — | `multi_channel`은 config 플래그가 아님(별도 문의 기능) → 검증 범위 밖 |
| B1 | 범위 제한 | — | API가 검증 안 함 → 클라이언트 사이드 가드로만 유지 |

**미지 필드**: `{...,totally_made_up_field:true}` = 200 [T10] → API는 모르는 필드를 무시.
**API 철학**: 언어값·candidates·diarization은 엄격 거부(400) / itn·paragraph-max·keywords·미지 필드는 관대 수용(200).

---

## 3. 반영할 가설 (최종)

### 3-A. 하드 제약 — API가 400으로 거부 (스키마에서 fail-fast)

| 순서 | 규칙 | 형식 | 증거 |
| --- | --- | --- | --- |
| 1 | C1 whisper → language 필수 | `model=whisper → language 설정` | T9 |
| 2 | C2 detect/multi → whisper | `language∈{detect,multi} → model=whisper` | T6 |
| 3 | **C3′** languageCandidates → whisper | `languageCandidates 설정 → model=whisper` | P1·P2·P3·P5·T7 |
| 4 | C5 spkCount → useDiarization | `spkCount 설정 → useDiarization=true` | T1·T2 |

### 3-B. 문서화만 — API가 200으로 수용·무시 (요청 차단 아님)

| 규칙 | 실동작 | 증거 |
| --- | --- | --- |
| C4 useItn은 sommers+ko에서만 효과 | 비대상에서도 수용, 효과만 없음 | T5 |
| C6 paragraphSplitterMax는 splitter on일 때만 효과 | splitter off/무플래그여도 수용 | T3·T4 |
| C7 keywords는 한국어 전사에만 효과 | 비-ko에서도 수용 | T8 |

### 3-C. 범위 밖
C8·C9(multi_channel 배타)·Enterprise(pii/refinement/insight) — config 스키마 대상 아님. B1은 클라이언트 가드.

---

## 부록: 프로브 원본

| ID | config | HTTP | 응답 |
| --- | --- | :---: | --- |
| T0 | `{sommers}` | 200 | baseline |
| T1 | `{sommers, diarization:{spk_count:2}}` | 400 | diarization cannot be used without use_diarization |
| T2 | `{sommers, use_diarization:false, diarization:{spk_count:2}}` | 400 | 동일 |
| T3 | `{sommers, paragraph_splitter:{max:80}}` | 200 | |
| T4 | `{sommers, use_paragraph_splitter:false, paragraph_splitter:{max:80}}` | 200 | |
| T5 | `{whisper, language:en, use_itn:true}` | 200 | |
| T6 | `{sommers, language:detect}` | 400 | unsupported language |
| T7 | `{sommers, language:ko, language_candidates:[ko,en]}` | 400 | unsupported language |
| T8 | `{sommers, language:ja, keywords:[에스티티]}` | 200 | |
| T9 | `{whisper}` | 400 | unsupported language |
| T10 | `{sommers, totally_made_up_field:true}` | 200 | |
| P1 | `{whisper, language:ko, language_candidates:[ko,en]}` | 200 | ← C3 수정 근거 |
| P2 | `{whisper, language:detect, language_candidates:[ko,en]}` | 200 | |
| P3 | `{whisper, language:multi, language_candidates:[ko,en]}` | 200 | 2026-07-16 재실행 (최초 시도는 429 동시처리 초과) |
| P4 | `{whisper, language:ko}` | 200 | 2026-07-16 재실행 (최초 시도는 429 동시처리 초과) — baseline 컨트롤 |
| P5 | `{sommers, language_candidates:[ko,en]}` | 400 | unsupported language |
