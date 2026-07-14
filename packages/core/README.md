# @spencer0124/rtzr-core

[RTZR (Return Zero)](https://developers.rtzr.ai/) STT API를 감싸는 환경 중립(environment-neutral) 라이브러리 —
인증·업로드·폴링·포맷터·검증 스키마. `fs`나 `process.env`를 직접 참조하지 않고 오디오를 바이트로, 키를
인자로만 받기 때문에 Node CLI와 Cloudflare Workers 등 어디서든 동일하게 동작합니다.

CLI가 필요하다면 [`@spencer0124/rtzr-cli`](https://www.npmjs.com/package/@spencer0124/rtzr-cli)를 사용하세요.
이 패키지는 직접 라이브러리로 통합하려는 경우에 씁니다.

```ts
import { RtzrClient, toSrt } from "@spencer0124/rtzr-core";

const client = new RtzrClient({ clientId, clientSecret });
const result = await client.transcribe(audioBytes, "sample.wav", {
  useDiarization: true,
  keywords: ["리턴제로"],
});

console.log(toSrt(result, { speakerLabels: true }));
```

## API

- `RtzrClient` — 토큰을 메모리 캐시하는 클래스형 클라이언트. `authenticate()` / `submit()` / `poll()` /
  `transcribe()`.
- `transcribe(audio, filename, opts)` — 매 호출마다 새 클라이언트를 만드는 함수형 원샷 래퍼(웹 서버 함수 등에
  적합).
- `toTxt` / `toSrt` / `toVtt` / `toJson` — Whisper `--output_format` 호환 포맷터. 화자 라벨은
  `{ speakerLabels: true }`로 명시적 opt-in해야 함(RTZR API는 화자분리를 요청하지 않아도 `spk: 0`을 내려줌).
- `transcribeConfigSchema` / `rtzrCredentialsSchema` — zod 스키마. CLI 플래그 검증과 (로드맵) MCP 도구 입력
  스키마의 단일 소스.

더 자세한 내용은 GitHub 저장소를 참고하세요: https://github.com/spencer0124/rtzr-cli
