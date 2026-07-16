# @spencer0124/rtzr-cli

Whisper처럼 쓰는 [RTZR (Return Zero)](https://developers.rtzr.ai/) STT CLI입니다. 화자분리·키워드부스팅·ITN을
지원합니다. 리턴제로의 공식 도구가 아닌, RTZR STT API를 활용한 비공식 CLI/라이브러리입니다.

```bash
npx @spencer0124/rtzr-cli audio.mp3 --diarize
```

## 인증

```bash
rtzr configure   # RTZR_CLIENT_ID / RTZR_CLIENT_SECRET을 대화형으로 입력, 로컬에 저장
```

환경변수 `RTZR_CLIENT_ID` / `RTZR_CLIENT_SECRET`이 있으면 로컬 설정보다 우선 사용됩니다.

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
| `--language-candidates <langs...>` | 언어 감지 후보군(`--model whisper` 전용) | `ko/ja/zh/en` |
| `--itn` / `--no-itn` | 역정규화(ITN) | on |
| `--profanity-filter` | 비속어 필터 | off |
| `--disfluency-filter` / `--no-disfluency-filter` | 간투어 필터 | on |
| `--paragraph-splitter` / `--no-paragraph-splitter` | 문단 나누기 | on |
| `--paragraph-max <n>` | 문단 최대 글자 수(문단 나누기 on일 때만) | `50` |
| `--word-timestamps` | 단어별 타임스탬프 포함(`--json`에서만 확인 가능) | off |
| `--domain <GENERAL\|CALL>` | 도메인 | — |
| `--json` | 파일 출력 대신 원본 응답 JSON을 stdout에 출력 | off |

## 라이브러리로 사용

이 패키지는 CLI 바이너리(`rtzr`) 겸 라이브러리입니다. 설정 로딩 헬퍼와 `@spencer0124/rtzr-core`의 전체
표면(클라이언트, 포맷터, 스키마)을 함께 export합니다.

```ts
import { loadCredentials, RtzrClient } from "@spencer0124/rtzr-cli";
```

더 자세한 내용은 GitHub 저장소를 참고하세요: https://github.com/spencer0124/rtzr-cli
