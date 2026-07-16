# @spencer0124/rtzr-core

[RTZR (Return Zero)](https://developers.rtzr.ai/) STT API를 감싸는 환경 중립(environment-neutral)
라이브러리입니다. 인증·업로드·폴링·포맷터·검증 스키마를 제공합니다. `fs`나 `process.env`를 직접 참조하지
않고 오디오는 바이트로, 키는 인자로만 받습니다. 그래서 Node CLI와 Cloudflare Workers 어디서든 동일하게
동작합니다.

CLI가 필요하다면 [`@spencer0124/rtzr-cli`](https://www.npmjs.com/package/@spencer0124/rtzr-cli)를 쓰세요.
이 패키지는 직접 라이브러리로 통합할 때 씁니다.

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

| export | 설명 |
| --- | --- |
| `RtzrClient` | 토큰을 메모리 캐시하는 클래스형 클라이언트. `authenticate()`/`submit()`/`poll()`/`transcribe()` |
| `transcribe(audio, filename, opts)` | 매 호출마다 새 클라이언트를 만드는 함수형 원샷 래퍼(웹 서버 함수에 적합) |
| `toTxt`/`toSrt`/`toVtt`/`toJson` | Whisper `--output_format` 호환 포맷터 |
| `transcribeConfigSchema`/`rtzrCredentialsSchema` | zod 스키마. CLI 플래그와 MCP tool 입력의 단일 소스 |

화자 라벨은 `{ speakerLabels: true }`로 명시적으로 켜야 합니다. RTZR API는 화자분리를 요청하지 않아도
`spk: 0`을 항상 내려주기 때문입니다.

더 자세한 내용은 GitHub 저장소를 참고하세요: https://github.com/spencer0124/rtzr-cli
