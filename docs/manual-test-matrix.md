# CLI · MCP 옵션 수동 테스트 매트릭스

CLI(`rtzr` 0.2.0)와 원격 MCP(`https://rtzr.seungyongcho.com/mcp`)가 **같은 core config로 같은 동작을 하는지**를
옵션 축별로 검증한다. 케이스는 기능 축(A~I)으로 분류하고, 각 케이스에 CLI/MCP 양면을 병기한다 — 두 표면을
따로 문서화하지 않는 이유는 "동일 config → 동일 결과"가 핵심 검증 대상이기 때문.

- Expected의 근거: `docs/rtzr-config-constraints.md` 실측 프로브(대괄호 `[T·P]` ID), core `schema.ts` 에러
  메시지 원문, `CLI_FIELD_LABELS`/`MCP_FIELD_LABELS` 표면 vocabulary.
- 작성일: 2026-07-15. 실행 결과는 각 케이스 하단 **실제 결과** 줄에 기록한다.

## 판정 기준 (3등급)

| 등급 | 의미 | 실패 처리 |
| --- | --- | --- |
| **deterministic** | 정확한 문자열/exit code/구조가 예측됨 (에러 메시지, 파일 존재, WEBVTT 헤더 등) | 불일치 = 버그 |
| **structural** | 정확한 텍스트는 예측 불가하나 구조는 예측됨 (words[] 존재, [Speaker N] 라벨 유무 등) | 불일치 = 버그 |
| **observational** | STT 품질에 의존해 확률적 (키워드 부스팅 효과, ITN 차이 등) | 불일치 = 기록만, 버그 아님 |

## 실행 규약

1. **순차 실행** — RTZR 동시처리 제한(폴링 권장 5초). 병렬 제출 금지.
2. CLI 출력은 전부 `out_test/`(gitignored)로. 케이스 간 파일 덮어쓰기를 피하려면 `-o out_test/<케이스ID>`.
3. MCP는 이 세션에 연결된 커넥터의 `transcribe`/`request_upload_url` 툴로 호출. JSON-RPC를 직접 쳐야 하는
   케이스(G8·G9)만 curl로 `https://rtzr.seungyongcho.com/mcp`에 POST.
4. H·I(에러 케이스)는 네트워크를 타지 않으므로 순서 무관, 아무 때나 실행 가능.
5. ⚪ 표시는 선택 케이스 — 시간/쿼터 아끼려면 생략 가능.

## 사전 준비 (P0)

```bash
mkdir -p out_test
# G5(base64)용 5초 클립 — test_audio/0*.mp3 glob(G1)에 안 걸리게 clip- 접두사
ffmpeg -y -i test_audio/01.mp3 -t 5 -c copy test_audio/clip-5s.mp3
rtzr --version   # 0.2.0, 자격증명은 env 또는 config.json에 있어야 함
```

**테스트 자산**: `test_audio/01.mp3`(50초, 기내방송·단일 화자, 1.9MB) · `test_audio/02.mp3`(301초, 11MB —
diarize·업로드 플로우용; base64 3MB 한도 초과 + 업로드 20MB 한도 이내라 가드 테스트 겸용).

**01.mp3 baseline 기지 사실** (2026-07-15 smoke test, 기본 옵션): "좌석 **배트**를 매주시고", "좌석 등
**받지**와", "창문 **덮게**는" 으로 오인식됨 (좌석벨트/등받이/덮개) → D1 키워드 부스팅의 비교 기준.
숫자·간투어·비속어는 부재 → E1~E3은 "성공 + 차이 없음"이 정상.

**표면 기본값 차이 (해석 시 주의)**: CLI는 `--model sommers`·`-l ko`·itn/disfluency/paragraph-splitter를
**항상 명시 전송**(commander 기본값), MCP는 language(ko)와 diarize(false)만 채우고 나머지는 미전송(API
기본값 위임). 결과는 같아야 하지만 raw config는 다르다.

---

## A. 기본 동작 (baseline)

### A1. 무옵션 기본 전사

| | |
| --- | --- |
| 목적 | 기본값(sommers·ko·txt)으로 end-to-end 성공 + 두 표면 결과 일치 |
| CLI | `rtzr test_audio/01.mp3 -o out_test/a1` |
| MCP | `transcribe { input: <01 업로드 URL> }` (업로드는 G7 절차) |
| Expected | ① exit 0 / isError 없음 ② `out_test/a1/01.txt` 생성 / 텍스트 반환 ③ "이스타 항공"·"제주 국제공항" 포함, **`[Speaker` 문자열 부재**(C3 회귀 겸용), 문단 분리된 여러 줄 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS (2026-07-15) — exit 0, `out_test/a1/01.txt` 생성. "이스타 항공"·"제주 국제공항" 포함, `[Speaker` 부재, 문단 7줄. smoke test와 문장 단위까지 동일.
**실제 결과 — MCP**: ✅ PASS — 반환 텍스트가 CLI 출력과 **완전 일치** (오인식 지점 "좌석 배트"·"등 받지"·"창문 덮게"까지 동일).

### A2. 출력 포맷 전체 (txt/srt/vtt/json)

| | |
| --- | --- |
| 목적 | 포맷터 4종이 각 표면에서 올바른 구조로 나오는지 |
| CLI | `rtzr test_audio/01.mp3 -f all -o out_test/a2` (호출 1건으로 4파일) |
| MCP | `format: "srt"` / `"json"` 각 1회 (vtt ⚪ — 포맷터는 core 공용이라 CLI 검증으로 충분) |
| Expected | ① 성공 ② CLI: `01.txt`·`01.srt`·`01.vtt`·`01.json` 4개 ③ srt: `1\nHH:MM:SS,mmm --> …` 번호+콤마 타임코드 / vtt: 첫 줄 `WEBVTT` + 점 타임코드 / json: raw API 응답(`results.utterances[]`에 `start_at`·`duration`·`msg`·`spk` — **spk는 diarize 없이도 존재**하는 게 정상) |
| 판정 | deterministic (구조) |

**실제 결과 — CLI**: ✅ PASS — 4파일 전부 생성. srt: 번호+`00:00:00,934` 콤마 타임코드 / vtt: `WEBVTT` 헤더+점 타임코드 / json: `{id, status, results}` 구조, utterance 키 `start_at·duration·spk·spk_type·msg·lang`, **diarize 없이도 `spk: 0` 존재** (스펙대로).
**실제 결과 — MCP**: ✅ PASS — srt·json·vtt(⚪ 포함) 3건 모두 CLI와 타임코드까지 동일한 출력. `[Speaker` 라벨 없음.

### A3. CLI `--json` stdout 모드

| | |
| --- | --- |
| 목적 | `--json`이 파일 대신 stdout으로 raw JSON을 내보내는지 (파이프 사용성) |
| CLI | `rtzr test_audio/01.mp3 --json -o out_test/a3 > out_test/a3.json` |
| MCP | 해당 없음 (MCP는 항상 텍스트 반환) |
| Expected | ① exit 0 ② `out_test/a3/` 디렉토리에 **파일 미생성**, stdout(`a3.json`)에 유효한 JSON ③ 진행 로그(`[rtzr] …`)는 stderr로만 — `a3.json`을 `jq .`로 파싱 가능해야 함 |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — exit 0, `out_test/a3/` 디렉토리 자체가 미생성(파일 0), stdout이 유효 JSON(utterances 7개), 진행 로그는 stderr 분리 확인 (stdout 리다이렉트 파일이 `json.load`로 파싱됨).

---

## B. 모델 · 언어

### B1. whisper + ko

| | |
| --- | --- |
| 목적 | whisper 모델 정상 경로 (language 명시 시 성공 [T5 계열]) |
| CLI | `rtzr test_audio/01.mp3 --model whisper -l ko -o out_test/b1` |
| MCP | `transcribe { input: …, model: "whisper", language: "ko" }` |
| Expected | ① 성공 ② 한국어 전사 ③ sommers와 텍스트가 다를 수 있음(모델 차이 기록) |
| 판정 | structural (성공) + observational (품질 비교) |

**실제 결과 — CLI**: ✅ PASS — 성공. **주목**: sommers의 오인식 3곳("좌석 배트"·"등 받지"·"창문 덮게")을 whisper는 전부 올바르게 전사("좌석 벨트"·"등받이"·"창문 덮개"). 이 오디오에선 whisper 품질이 우위.
**실제 결과 — MCP**: ✅ PASS — CLI와 완전 일치.

### B2. whisper + detect (언어 자동 감지)

| | |
| --- | --- |
| 목적 | detect가 whisper에서만 허용되는 정상 경로 (거부 경로는 H1) |
| CLI | `rtzr test_audio/01.mp3 --model whisper -l detect -f json -o out_test/b2` |
| MCP | ⚪ B3으로 대체 |
| Expected | ① 성공 ② json의 utterance `lang` 필드가 `"ko"`로 감지 ③ 전사는 한국어 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS — 성공, utterance 7개 전부 `lang: "ko"`로 감지, 한국어 전사 정상.

### B3. whisper + detect + languageCandidates

| | |
| --- | --- |
| 목적 | candidates가 whisper에서 수용되는지 [P2: whisper+detect+candidates=200] |
| CLI | `rtzr test_audio/01.mp3 --model whisper -l detect --language-candidates ko en -o out_test/b3` |
| MCP | `transcribe { input: …, model: "whisper", language: "detect", languageCandidates: ["ko","en"] }` |
| Expected | ① 성공 ② ko로 감지된 한국어 전사 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS — 성공, ko 전사 (B1과 동일 텍스트).
**실제 결과 — MCP**: ✅ PASS — `languageCandidates: ["ko","en"]` 수용, CLI와 동일 출력.

### B4. whisper + multi ⚪

| | |
| --- | --- |
| 목적 | multi 정상 경로 확정 — 실측 당시 429로 판정 불가였던 프로브 [P3] 마무리 |
| CLI | `rtzr test_audio/01.mp3 --model whisper -l multi -o out_test/b4` |
| MCP | 해당 없음 (CLI로 충분) |
| Expected | ① 성공 (P3의 429는 rate limit이었지 400이 아니었음 — 200 예상) ② 한국어 단일 오디오라 결과는 B1과 유사 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS — 성공, B1과 동일 텍스트. **[P3] 프로브 확정**: whisper+multi는 200 (당시 429는 rate limit이었음).

---

## C. 화자분리 (02.mp3, 5분)

### C1. diarize 자동 (speakers 미지정) — MCP 업로드 플로우(G7) 겸용

| | |
| --- | --- |
| 목적 | 화자분리 + 라벨 opt-in 출력, MCP 쪽은 request_upload_url→PUT→transcribe 전체 플로우 검증 겸용 |
| CLI | `rtzr test_audio/02.mp3 --diarize -f srt -o out_test/c1` |
| MCP | ① `request_upload_url { filename: "test_audio/02.mp3" }` ② 반환된 curl로 PUT (응답 `ok`) ③ `transcribe { input: "<fetch URL>", diarize: true, format: "srt" }` |
| Expected | ① 성공 ② srt 각 큐 텍스트가 `[Speaker N]`로 시작 ③ 02가 다화자 오디오면 N이 2종 이상, CLI와 MCP의 화자 수 일치 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS — 성공, 전 큐에 `[Speaker N]` 라벨, auto가 화자 0~8(9명) 분리. 02.mp3는 라디오 대담+뉴스 리포트+거리 인터뷰 구성이라 9화자가 타당. (내용: 물가/프렌드플레이션 뉴스)
**실제 결과 — MCP**: ✅ PASS — 업로드 플로우(G7: 발급→PUT 11.5MB `ok`→transcribe) 정상, 44개 큐·화자 0~8·타임코드가 CLI와 일치.

### C2. diarize + speakers 고정

| | |
| --- | --- |
| 목적 | `spk_count`가 `diarization.spk_count`로 중첩 전송되어 화자 수가 고정되는지 (CLAUDE.md의 "자주 까먹는" 스펙) |
| CLI | `rtzr test_audio/02.mp3 --diarize --speakers 2 -f srt -o out_test/c2` |
| MCP | ⚪ 생략 (매핑은 동일 core, 배선은 H-M2가 검증) |
| Expected | ① 성공 ② `[Speaker N]`의 N ∈ {0, 1}만 등장 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS — `[Speaker 0]` 26큐 + `[Speaker 1]` 18큐, 다른 화자 번호 없음 — spk_count=2 고정이 `diarization.spk_count` 중첩으로 정확히 전달됨.

### C3. 라벨 opt-in 회귀 (LESSONS #1) — 추가 호출 0건

| | |
| --- | --- |
| 목적 | diarize 안 켠 출력에 `[Speaker 0]`이 새면 안 됨 — API가 spk를 항상 내려주기 때문에 생겼던 실제 버그의 회귀 체크 |
| CLI | A1·A2 산출물 재검사: `grep -rL "\[Speaker" out_test/a1 out_test/a2` 가 전 파일 나열 |
| MCP | A1·A2의 MCP 반환 텍스트에 `[Speaker` 부재 확인 |
| Expected | ① txt/srt/vtt 어디에도 `[Speaker` 없음 (json은 raw라 `spk` 필드 있는 게 정상) |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — `grep -rl "[Speaker"` 결과 없음 (a1·a2 전 파일 + a3.json). a2 json의 raw `spk` 필드 7건은 정상.
**실제 결과 — MCP**: ✅ PASS — A1(txt)·A2(srt/vtt) 반환 텍스트에 `[Speaker` 부재 확인.

---

## D. 키워드 부스팅

### D1. baseline 오인식 교정

| | |
| --- | --- |
| 목적 | keywords가 baseline의 실제 오인식("좌석 배트"·"등 받지"·"창문 덮게")을 교정하는지 |
| CLI | `rtzr test_audio/01.mp3 --keywords 좌석벨트 등받이 창문덮개 -o out_test/d1` |
| MCP | `transcribe { input: …, keywords: ["좌석벨트","등받이","창문덮개"] }` |
| Expected | ① 성공 (plain 문자열 — score 문법 없음) ② "좌석벨트"·"등받이" 등으로 교정되면 부스팅 효과 확인 ③ 미교정이어도 버그 아님 — 기록만 |
| 판정 | observational |

**실제 결과 — CLI**: ✅ PASS — 3곳 중 2곳 교정: "좌석 **벨트**" ✓ · "창문 **덮개**" ✓ · "등 받지"는 미교정. 부스팅 효과 실재 확인.
**실제 결과 — MCP**: ✅ PASS — CLI와 동일하게 2/3 교정.

---

## E. 텍스트 후처리 (01.mp3 · CLI 위주, MCP는 E6 콤보 1건으로 배선만 확인)

### E1. `--no-itn`

| | |
| --- | --- |
| 목적 | ITN off 플래그가 config에 실리는지 (commander negatable boolean 배선) |
| CLI | `rtzr test_audio/01.mp3 --no-itn -o out_test/e1` |
| MCP | E6에 포함 |
| Expected | ① 성공 ② 01에 숫자가 없어 baseline과 동일할 수 있음 — 차이 있으면 기록 |
| 판정 | structural (성공) + observational (차이) |

**실제 결과 — CLI**: ✅ PASS — 성공. baseline과의 차이는 띄어쓰기 2곳("등받지"/"비행모드")뿐 — 오디오에 숫자가 없어 ITN 효과 자체는 관찰 불가(예상대로).

### E2. `--no-disfluency-filter`

| | |
| --- | --- |
| 목적 | 간투어 필터 off 배선 |
| CLI | `rtzr test_audio/01.mp3 --no-disfluency-filter -o out_test/e2` |
| MCP | E6에 포함 |
| Expected | ① 성공 ② 정제된 기내방송이라 baseline과 동일 예상 — 간투어 등장 시 기록 |
| 판정 | structural + observational |

**실제 결과 — CLI**: ✅ PASS — 성공, baseline과 완전 동일(간투어 없는 정제된 방송 — 예상대로).

### E3. `--profanity-filter` ⚪

| | |
| --- | --- |
| 목적 | 비속어 필터 on 배선 (01에 비속어 없음 → 성공 여부만) |
| CLI | `rtzr test_audio/01.mp3 --profanity-filter -o out_test/e3` |
| MCP | 해당 없음 |
| Expected | ① 성공 ② baseline과 동일 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS — 성공, baseline과 완전 동일(비속어 없음 — 예상대로).

### E4. `--no-paragraph-splitter`

| | |
| --- | --- |
| 목적 | 문단 분리 off 시 출력 구조 변화 |
| CLI | `rtzr test_audio/01.mp3 --no-paragraph-splitter -o out_test/e4` |
| MCP | E6에 포함 |
| Expected | ① 성공 ② txt 줄 구성이 baseline(문단 단위 7줄)과 다름 — utterance 분절이 달라짐 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS — 구조 변화 명확: baseline 7줄 → **전체가 utterance 1개, 한 줄**로 반환됨.

### E5. `--paragraph-max 20`

| | |
| --- | --- |
| 목적 | 문단 최대 길이 조정 (API가 soft 적용 — max 단독도 수용 [T3·T4]) |
| CLI | `rtzr test_audio/01.mp3 --paragraph-max 20 -o out_test/e5` |
| MCP | 해당 없음 |
| Expected | ① 성공 ② 줄당 길이가 baseline(기본 50자)보다 짧아지는 경향 — 정확히 20자 보장은 아님 |
| 판정 | observational |

**실제 결과 — CLI**: ✅ PASS(성공) — 단, **max 20의 가시적 효과 없음**: 출력이 baseline과 완전 동일. 문단이 이미 문장 단위 최소 granularity라 그 이하로는 쪼개지 않는 것으로 보임 — soft 적용 [T3·T4]과 부합, 버그 아님.

### E6. MCP 후처리 콤보 (itn·disfluency·paragraphSplitter off)

| | |
| --- | --- |
| 목적 | MCP 표면에서 후처리 boolean 3종이 config로 배선되는지 (개별 효과는 E1~E4 CLI 결과로 판정) |
| CLI | 해당 없음 |
| MCP | `transcribe { input: …, itn: false, disfluencyFilter: false, paragraphSplitter: false }` |
| Expected | ① 성공 ② 출력 구조가 E4 CLI 결과와 같은 경향(문단 미분리) |
| 판정 | structural |

**실제 결과 — MCP**: ✅ PASS — E4 CLI와 동일한 단일 문단 출력(paragraphSplitter:false 배선 확인), itn/disfluencyFilter도 에러 없이 수용.

---

## F. 워드 타임스탬프

### F1. wordTimestamps + json

| | |
| --- | --- |
| 목적 | words[] 배열이 json 출력에 나타나는지 — MCP inputSchema에서 이 필드가 통째로 누락됐던 실사고(LESSONS)의 회귀 체크 |
| CLI | `rtzr test_audio/01.mp3 --word-timestamps --json > out_test/f1.json` |
| MCP | `transcribe { input: …, wordTimestamps: true, format: "json" }` |
| Expected | ① 성공 ② `utterances[].words[]` 존재, 각 원소에 start/duration/text ③ words의 텍스트를 이으면 utterance `msg`와 대응 |
| 판정 | structural |

**실제 결과 — CLI**: ✅ PASS — utterance마다 `words[]`(start_at/duration/text), words 텍스트 연결 = `msg` 정확 일치.
**실제 결과 — MCP**: ✅ PASS — 7개 utterance 전부 words[] 포함된 raw JSON 반환.

### F2. wordTimestamps + txt ⚪

| | |
| --- | --- |
| 목적 | 문서화된 제약("--json 출력에만 반영") 확인 — txt에는 아무 흔적 없어야 함 |
| CLI | `rtzr test_audio/01.mp3 --word-timestamps -o out_test/f2` |
| MCP | 해당 없음 (같은 포맷터) |
| Expected | ① 성공 ② `01.txt`가 baseline과 동일 형태(타임스탬프 흔적 없음) |
| 판정 | deterministic (구조) |

**실제 결과 — CLI**: ✅ PASS — txt가 baseline과 완전 동일(diff 없음) — words는 json 출력에만 반영됨을 확인.

---

## G. 입력 처리 (표면 고유 동작)

### G1. CLI glob + 다중 파일 순차 처리

| | |
| --- | --- |
| 목적 | tinyglobby 확장 + 순차 처리(동시처리 제한 대응) + 파일별 출력 |
| CLI | `rtzr "test_audio/0*.mp3" -o out_test/g1` (01·02 매칭, clip-5s는 제외됨) |
| MCP | 해당 없음 (MCP는 호출당 1입력) |
| Expected | ① exit 0 ② `01.txt`·`02.txt` 둘 다 생성 ③ stderr 진행 로그가 파일별로 순차 출력 |
| 판정 | deterministic (구조) |

**실제 결과 — CLI**: ✅ PASS — exit 0, `01.txt`·`02.txt` 생성, 파일별 순차 진행 로그. `clip-*` 파일은 glob에 미포함(의도대로).

### G2. CLI 존재하지 않는 파일

| | |
| --- | --- |
| 목적 | 파일 IO 에러의 exit code와 메시지 (API 호출 없어야 함) |
| CLI | `rtzr test_audio/nope.mp3 -o out_test; echo "exit=$?"` |
| MCP | 해당 없음 |
| Expected | ① exit 1 ② stderr에 `[rtzr] nope.mp3: … ENOENT …` ③ 업로드 진행 로그 이후가 아니라 즉시 실패 |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — exit 1, `[rtzr] nope.mp3: ENOENT: no such file or directory, open 'test_audio/nope.mp3'` 즉시 출력(업로드 로그 없음 = API 미도달).

### G3. CLI 혼합 (성공 1 + 실패 1)

| | |
| --- | --- |
| 목적 | 한 파일 실패가 나머지 처리를 막지 않되 exit는 1 (hadFailure 패턴) |
| CLI | `rtzr test_audio/01.mp3 test_audio/nope.mp3 -o out_test/g3; echo "exit=$?"` |
| MCP | 해당 없음 |
| Expected | ① exit 1 ② `out_test/g3/01.txt`는 정상 생성 ③ nope.mp3 에러는 stderr에 별도 라인 |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — exit 1, `01.txt`는 정상 생성 + nope.mp3 ENOENT는 별도 stderr 라인 (부분 실패가 나머지를 막지 않음).

### G4. CLI 매칭 없는 glob

| | |
| --- | --- |
| 목적 | 빈 매칭의 명시적 에러 (조용히 성공하면 안 됨) |
| CLI | `rtzr "test_audio/*.wav" -o out_test; echo "exit=$?"` |
| MCP | 해당 없음 |
| Expected | ① exit 1 ② `No audio files matched: test_audio/*.wav` ③ API 호출 0 |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — exit 1, `No audio files matched: test_audio/*.wav`, API 호출 0.

### G5. MCP base64 인라인 (소형 클립)

| | |
| --- | --- |
| 목적 | base64 입력 경로 + 기본 filename(mp3) 추론 |
| CLI | 해당 없음 |
| MCP | `transcribe { input: "<clip-5s.mp3의 base64>" }` — base64 생성은 shell(`base64 -i test_audio/clip-5s.mp3`)에서, 모델 컨텍스트로 재검증 금지(LESSONS #9) |
| Expected | ① 성공 ② 01.mp3 첫 5초에 해당하는 텍스트("손님 여러분…" 앞부분) |
| 판정 | structural |

**실제 결과 — MCP**: ✅ PASS — 컨텍스트 부담을 줄이려 16kbps 모노 재인코딩 클립(10.5KB → base64 13.9KB) 사용. filename 힌트 없이 mp3 기본 추론으로 성공, 첫 5초 텍스트("…보내셨습니다.") 반환.

### G6. MCP 외부 URL 입력

| | |
| --- | --- |
| 목적 | 자기 호스트가 아닌 URL의 fetch 경로 + content-type 기반 확장자 추론 |
| CLI | 해당 없음 |
| MCP | `transcribe { input: "https://download.samplelib.com/mp3/sample-3s.mp3" }` (음성 없는 샘플일 수 있음 — 대체 공개 음성 URL 사용 가능) |
| Expected | ① isError 아님 ② 음성이 없으면 빈 전사도 정상 — fetch 실패(HTTP 에러)만 아니면 통과 |
| 판정 | structural |

**실제 결과 — MCP**: ✅ PASS — isError 없이 빈 전사 반환(샘플이 음악이라 utterance 0개 — 예상 범위). URL fetch + content-type 추론 경로 정상.

### G7. MCP request_upload_url 플로우 — C1에서 겸용 실행

절차만 정의: ① `request_upload_url` → presigned PUT URL + fetch URL ② shell에서 curl PUT → 응답 `ok`
③ fetch URL로 `transcribe`. 판정은 C1에 기록.

### G8. MCP presigned URL single-use

| | |
| --- | --- |
| 목적 | 업로드 파일이 1회 GET 후 소멸하는지 (transcribe 안 거침 — RTZR 미도달) |
| CLI | 해당 없음 |
| MCP | 새 업로드 1건 후 shell에서: `curl -s -o /dev/null -w "%{http_code}\n" <fetch URL>` 2회 연속 |
| Expected | ① 1회차 200 ② 2회차 404 (`not found — expired, never uploaded, or already consumed`) |
| 판정 | deterministic |

**실제 결과 — MCP**: ✅ PASS — 1회차 GET 200(10474B = 업로드 원본), 2회차 404 + `not found — expired, never uploaded, or already consumed`.

### G9. MCP 3MB base64 가드

| | |
| --- | --- |
| 목적 | 대형 base64가 atob 전에 추정 길이로 거부되는지 — 모델 컨텍스트를 거치지 않도록 shell에서 JSON-RPC 직접 POST |
| CLI | 해당 없음 |
| MCP | shell에서: 02.mp3(11MB)를 base64로 payload 파일 생성 후 `curl -X POST https://rtzr.seungyongcho.com/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d @payload.json` (`tools/call` transcribe, input=base64) |
| Expected | ① isError=true ② 메시지에 `over the 3MB inline limit` + URL/upload 대안 안내 ③ RTZR API 미도달 (즉시 반환 — 폴링 지연 없음) |
| 판정 | deterministic |

**실제 결과 — MCP**: ⚠️ **PASS (버그 1건 발견)** — 가드 자체는 정상: 02.mp3 base64(16M chars)를 JSON-RPC로 직접 POST → 1.8초 만에 isError + `base64 input is ~11.5MB, over the 3MB inline limit …` (RTZR 미도달). **버그**: 에러 메시지가 "or use the **upload_chunk** tool"을 안내하는데 이 툴은 현재 서버에 존재하지 않음(→ `request_upload_url`로 교체된 흔적, `handler.ts`의 stale 문구). 수정 필요.

### G10. presigned URL 만료 (5분 대기) ⚪

| | |
| --- | --- |
| 목적 | expires 서명 검증 |
| MCP | 업로드 URL 발급 후 5분+ 대기 → curl PUT |
| Expected | ① HTTP 403 `invalid or expired upload token` |
| 판정 | deterministic |

**실제 결과 — MCP**: ✅ PASS — 세션 초반에 미리 발급해둔 URL(만료 +19분 경과)로 PUT → HTTP 403 `invalid or expired upload token` (대기 없이 검증).

---

## H. 검증 에러 surfacing — 전부 API 호출 0건

하드 제약 4건(`rtzr-config-constraints.md` §3-A)이 **네트워크 도달 전에** 각 표면의 vocabulary로 거부되는지.
CLI는 일부러 존재하지 않는 파일(`nope.mp3`)을 줘서 "스키마 에러가 ENOENT보다 먼저" = 검증이 IO에
선행함을 함께 증명한다(`cli.integration.test.ts`와 같은 트릭). MCP는 `input: "dGVzdA=="`(더미)로 검증이
입력 해석에 선행함을 증명. Expected 메시지는 `formatConfigError`의 label 치환 결과 원문.

### H1. detect/multi는 whisper 전용 [T6]

| | |
| --- | --- |
| CLI | `rtzr test_audio/nope.mp3 -l detect; echo "exit=$?"` |
| MCP | `transcribe { input: "dGVzdA==", language: "detect" }` |
| Expected (CLI) | exit 1 · stderr: `error: --language "detect"/"multi" is only supported when --model is "whisper"` |
| Expected (MCP) | isError · `Invalid transcribe options: language "detect"/"multi" is only supported when model is "whisper"` |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — exit 1, 예측 문자열과 완전 일치. nope.mp3인데 ENOENT가 아니라 스키마 에러 = 검증이 IO 선행.
**실제 결과 — MCP**: ✅ PASS — 에러 메시지 예측과 완전 일치 (`Invalid transcribe options: language "detect"/"multi" is only supported when model is "whisper"`).

### H2. speakers는 diarize 필수 [T1·T2]

| | |
| --- | --- |
| CLI | `rtzr test_audio/nope.mp3 --speakers 2; echo "exit=$?"` |
| MCP | `transcribe { input: "dGVzdA==", speakers: 2 }` |
| Expected (CLI) | exit 1 · `error: --speakers requires --diarize` |
| Expected (MCP) | isError · `Invalid transcribe options: speakers requires diarize` |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — `error: --speakers requires --diarize`, exit 1.
**실제 결과 — MCP**: ✅ PASS — `Invalid transcribe options: speakers requires diarize`.

### H3. languageCandidates는 whisper 전용 [P1·P5·T7]

| | |
| --- | --- |
| CLI | `rtzr test_audio/nope.mp3 --language-candidates ko en; echo "exit=$?"` |
| MCP | `transcribe { input: "dGVzdA==", languageCandidates: ["ko","en"] }` |
| Expected (CLI) | exit 1 · `error: --language-candidates is only supported when --model is "whisper"` |
| Expected (MCP) | isError · `Invalid transcribe options: languageCandidates is only supported when model is "whisper"` |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — `error: --language-candidates is only supported when --model is "whisper"`, exit 1.
**실제 결과 — MCP**: ✅ PASS — `Invalid transcribe options: languageCandidates is only supported when model is "whisper"`.

### H4. whisper는 language 필수 [T9] — **MCP 전용**

| | |
| --- | --- |
| CLI | **재현 불가** — `-l` 기본값 ko가 항상 전송돼 이 제약에 도달할 수 없음 (기본값 설계의 의도된 결과) |
| MCP | `transcribe { input: "dGVzdA==", model: "whisper" }` — 핸들러가 whisper일 땐 ko 기본값을 일부러 안 채움 |
| Expected (MCP) | isError · `Invalid transcribe options: language is required when model is "whisper"` |
| 판정 | deterministic |

**실제 결과 — MCP**: ✅ PASS — `Invalid transcribe options: language is required when model is "whisper"` — 핸들러가 whisper일 때 ko 기본값을 의도적으로 안 채우는 분기 검증 완료.

### H5. 클라이언트 사이드 범위 가드 (B1 — API는 검증 안 함)

| | |
| --- | --- |
| CLI | ① `rtzr test_audio/nope.mp3 --keywords 이십일글자를넘기기위한아주아주긴키워드입니다` (22자) ② `rtzr test_audio/nope.mp3 --diarize --speakers -1` |
| MCP | `transcribe { input: "dGVzdA==", keywords: ["이십일글자를넘기기위한아주아주긴키워드입니다"] }` — MCP는 inputSchema(SDK) 층에서 거부 |
| Expected (CLI) | ① exit 1 · `error: --keywords: String must contain at most 20 character(s)` ② exit 1 · `error: --speakers: Number must be greater than or equal to 0` |
| Expected (MCP) | 호출이 스키마 검증에서 거부(형태는 SDK/클라이언트 의존 — isError 또는 프로토콜 에러) · 핸들러 미도달 |
| 판정 | CLI deterministic / MCP structural |

**실제 결과 — CLI**: ✅ PASS — ① `error: --keywords: String must contain at most 20 character(s)` ② `error: --speakers: Number must be greater than or equal to 0` — 둘 다 exit 1, 예측 문자열 일치.
**실제 결과 — MCP**: ✅ PASS — MCP SDK inputSchema 층에서 JSON-RPC `-32602 Input validation error`로 거부, zod issue `path: ["keywords", 0]` 포함 — 핸들러 미도달 확인.

---

## I. 인증

### I1. CLI 자격증명 없음

| | |
| --- | --- |
| 목적 | creds 부재 시 즉시 안내 + exit 1 (env → config.json 순 탐색이므로 둘 다 제거해야 재현) |
| CLI | config 파일(`rtzr configure`가 출력하는 경로, macOS: `~/Library/Preferences/rtzr/config.json`)을 임시로 옮긴 뒤: `env -u RTZR_CLIENT_ID -u RTZR_CLIENT_SECRET rtzr test_audio/01.mp3; echo "exit=$?"` — 끝나면 원복 |
| MCP | 해당 없음 (아래 I2) |
| Expected | ① exit 1 ② `No RTZR credentials found. Run \`rtzr configure\`, or set RTZR_CLIENT_ID / RTZR_CLIENT_SECRET.` ③ API 호출 0 |
| 판정 | deterministic |

**실제 결과 — CLI**: ✅ PASS — config.json 임시 이동 + env 제거 후: `No RTZR credentials found. Run \`rtzr configure\`, or set RTZR_CLIENT_ID / RTZR_CLIENT_SECRET.` exit 1, API 호출 0. config 원복 완료.

### I2. MCP 자격증명 — 범위 밖 (명시)

커넥터에 BYO-key 헤더(`X-RTZR-CLIENT-ID/SECRET`)가 설정돼 있고 서버에 demo fallback 키도 있어, 이
환경에서는 "Missing RTZR credentials" 경로를 재현할 수 없다. 해당 분기는 `handler.test.ts`(resolveCredentials
단위 테스트)가 커버 — 라이브 검증 대상에서 제외.

---

## 예상 사용량 요약

| 구분 | 필수 | ⚪ 선택 포함 |
| --- | --- | --- |
| 라이브 transcribe 잡 — CLI | 15건 (01×12 · 02×3) | +3건 |
| 라이브 transcribe 잡 — MCP | 9건 (01계열×8 · 02×1) | +2건 |
| 오디오 쿼터 소모 | 약 30분 분량 (01=50초×20, 02=5분×4, 클립·샘플 ~1분) | +약 3분 |
| 소요 시간 (순차, 폴링 5초) | 약 30~45분 | +10분 (G10 대기 5분 포함) |

H·I 에러 케이스 ~12건은 로컬/서버 검증 단계에서 차단되어 RTZR API에 도달하지 않는다 (쿼터 0).

---

## 실행 총평 (2026-07-15, ⚪ 선택 포함 전 케이스 실행)

**28케이스 전부 PASS** — deterministic 케이스의 에러 메시지·exit code·HTTP 상태는 예측 문자열과 전부
글자 단위로 일치했고, CLI/MCP 두 표면의 전사 결과는 모든 공통 케이스에서 동일했다.

**발견 사항 (수정 후보)**:

1. ✅ **G9 — stale 에러 메시지** (2026-07-16 수정 완료): 3MB base64 가드 메시지가 폐기된 `upload_chunk` 툴을
   안내하던 문제 — `request_upload_url` 안내로 교체하고, 같은 시대의 죽은 배관(`maxInlineBase64Bytes` 옵션,
   `resolveAudioInput`의 `maxInlineBytes` 파라미터)도 함께 제거 (`packages/mcp-worker/src/handler.ts`).

**관찰 기록 (버그 아님)**:

- whisper가 이 오디오(01)에서 sommers보다 정확 — sommers 오인식 3곳을 whisper는 전부 올바르게 전사 (B1).
- keywords 부스팅은 3곳 중 2곳 교정 — 효과는 실재하나 완전하지 않음 (D1).
- `--paragraph-max 20`은 문장 단위 이하로는 안 쪼갬 — soft 적용의 실동작 확인 (E5).
- diarize auto는 02.mp3(대담+뉴스+인터뷰)에서 9화자로 분리 — 콘텐츠 구성상 타당 (C1).
- 실측 미결이던 [P3] whisper+multi = 200 확정 (B4). 2026-07-16에 raw config 프로브(P3·P4)를 순차 실행으로
  재실행해 둘 다 200을 직접 확인 — `docs/rtzr-config-constraints.md` 부록에 반영됨.

**실사용량**: 라이브 transcribe 잡 29건(01계열 24 + 02 4 + 외부샘플 1), 소요 약 35분.
