# NAM + TONE3000 Amp Sim

A React/Vite frontend for real-time neural amp modeling in the browser: mic/interface input →
AudioWorklet running NAM inference → optional cab IR → output, with model browsing from
TONE3000 built in. Same codebase runs as a website or gets wrapped for desktop (Tauri).

## Architecture

```
getUserMedia → inputGain → [AudioWorklet: nam-processor] → (IR convolver) → outputGain → speakers
                                     ^
                          model bytes loaded via postMessage
                          (from local file OR downloaded from TONE3000)
```

- `src/audio/AudioEngine.js` — owns the Web Audio graph, device selection, gain staging, metering.
- `src/audio/nam-processor.js` — the `AudioWorkletProcessor` where inference actually runs.
- `src/lib/tone3000-client.js` — OAuth 2.0 + PKCE client for the TONE3000 API.
- `src/components/*` — device picker, model loader (local + TONE3000), amp rack controls, meter.

## 1. Install

```
npm install
npm install neural-amp-modeler-wasm
```

That second package is TONE3000's open-sourced fork of Steven Atkinson's NAM Core DSP,
compiled to WebAssembly for the browser (`tone3000.com/blog/introducing-live-input-on-tone3000`).
It's kept out of `package.json` deliberately — **its published export path can drift between
versions**, so after installing, open `node_modules/neural-amp-modeler-wasm/README.md` and
confirm the real entry point. The only place that assumption lives is the top of
`src/audio/nam-processor.js` (`import('neural-amp-modeler-wasm/engine')`) — until you've
verified and adjusted it if needed, the app runs on a soft-clip fallback stage instead of the
real model, so you can develop/test everything else (routing, gate, meters, model upload UI)
without being blocked on that.

## 2. TONE3000 API key (for the "Browse TONE3000" button)

1. Log in at [tone3000.com](https://www.tone3000.com), go to **Settings → API Keys**, create one.
2. Copy `.env.example` to `.env` and fill in `VITE_T3K_PUBLISHABLE_KEY`.
3. There's no anonymous access to the API — every browse/download goes through an OAuth
   redirect where the user signs into their own TONE3000 account. Localhost redirect URIs
   are allowed automatically in dev; register your production URL under the key's settings
   before deploying.
4. Local `.nam`/IR file loading works with no API key at all, if you'd rather skip this.

## 3. Run

```
npm run dev
```

`vite.config.js` already sets the `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy`
headers threaded WASM builds usually need — if you deploy the built `dist/` behind your own
server, set those headers there too or the worklet will fail to initialize.

Note: browsers run `AudioWorkletProcessor.process()` in fixed 128-sample blocks regardless of
your interface's buffer size — this is a browser constraint, not something to tune here.

## 4. Package for desktop

The frontend is plain Vite/React, so it drops into [Tauri](https://tauri.app) without changes:

```
npm create tauri-app@latest -- --template react
# point devUrl / frontendDist in src-tauri/tauri.conf.json at this project's dev server / dist/
npm run tauri dev
npm run tauri build
```

Tauri over Electron here mainly because the app is Web Audio + WASM (no native audio bindings
needed), so you get a much smaller binary for the same result. If you later want ASIO/lower
latency than the browser's audio stack can give you, that's a separate native audio layer, not
something this frontend can add on its own.

## Known gaps / what's stubbed

- **NAM inference** — real WASM integration point exists but needs the export path confirmed
  against your installed `neural-amp-modeler-wasm` version (see step 1). Falls back to a
  `tanh` soft-clip stage otherwise, so the app runs but isn't actually modeling an amp yet.
- **No model caching/library UI** — TONE3000 downloads apply immediately; add IndexedDB
  storage if you want a persistent local model rack.
- **Mono signal chain** — fine for a guitar amp sim; widen `outputChannelCount` in
  `AudioEngine.js` if you need stereo (e.g. a stereo cab pair).
