# rtzr-cli

> Whisper처럼 쓰는 [RTZR (Return Zero)](https://developers.rtzr.ai/) STT CLI — 화자분리·키워드부스팅·ITN 지원.
> 리턴제로의 공식 도구가 아닌, RTZR STT API를 활용한 비공식 CLI/라이브러리입니다.

```bash
npx @seungyongcho/rtzr-cli <audio> --diarize
```

> ⚠️ 현재 스캐폴딩 단계입니다. 실제 transcribe 기능은 다음 단계에서 구현됩니다.

## 개발

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## 구조

- `packages/core` — `@seungyongcho/rtzr-core`: 환경 중립 라이브러리(인증·업로드·폴링·포맷터).
- `packages/cli` — `@seungyongcho/rtzr-cli`: `rtzr` CLI 겸 라이브러리(commander 기반, Whisper 호환 플래그).

자세한 설계는 `docs/concept.md` 참고(내부 기획 메모).
