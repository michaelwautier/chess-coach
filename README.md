# Chess Coach

Play timed chess games against Stockfish with an AI coach. When you play an inaccuracy, a mistake or a blunder,
the clock stops and the coach explains what went wrong: first a hint, then the best move, the engine's refutation
and the positional idea behind it (weak squares, pawn structure, missing bishop…). It also flags the engine's own
errors when you fail to punish them.

The UI is in French.

## Features

- Games against Stockfish 19 (WebAssembly, runs in the browser) at 20 levels, with an optional adaptive mode
  that adjusts the level between games.
- 5+3, 10+0, 10+5 and 15+10 time controls.
- Move-by-move analysis with Lichess-style judgements (inaccuracy / mistake / blunder) and game accuracy.
- Coaching pauses: retry the move, see the solution, or continue.
- On-demand advice during your turn, history browsing, end-of-game review with an AI summary, PGN export.
- Board color presets or custom colors, and 12 freely licensed piece sets (see `public/pieces/CREDITS.md`).
- AI coach providers: Claude (Anthropic), OpenAI or any OpenAI-compatible API, Google Gemini, or the viewer's
  own Claude account when the app is published as a claude.ai artifact.

## Getting started

Requires Node.js 20 or newer (see `.nvmrc`).

```bash
npm install
npm run dev
```

| Script                   | Purpose                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `npm run dev`            | Development server                                                                      |
| `npm run build`          | Type-check and build the static site into `dist/`                                       |
| `npm run build:artifact` | Build with relative paths into `dist-artifact/` (sub-path hosting, claude.ai artifacts) |
| `npm test`               | Unit tests (Vitest)                                                                     |
| `npm run lint`           | ESLint                                                                                  |
| `npm run typecheck`      | vue-tsc                                                                                 |
| `npm run check`          | Lint, type-check and test                                                               |

`scripts/copy-stockfish.mjs` copies the Stockfish worker build from `node_modules` into `public/stockfish`
before `dev` and `build` (it is not committed).

## Architecture

```
src/
  chess/       Pure chess helpers: notation, evaluation maths, attack tables with pins and batteries, position report
  engine/      Stockfish web-worker wrapper (UCI), engine levels and move selection
  game/        Game rules for the coach: move judgement, statistics, adaptive level, clock, background analysis
  coach/       Prompt builders, answer parsing and AI providers (Anthropic, OpenAI, Gemini, claude.ai)
  storage/     Settings, API keys and game history persistence
  platform/    Bridge to the claude.ai artifact runtime (optional)
  stores/      Pinia stores: game flow, settings, dialogs
  components/  Vue components
tests/unit/    Vitest unit tests
```

Everything runs client-side: there is no backend. The coach never computes chess facts itself — the engine lines,
evaluations and attack/defence counts are computed by code and passed to the model, which is instructed to rely
on them only.

## AI providers and API keys

Users bring their own API key. Keys stay in the browser (localStorage when "remember" is checked, sessionStorage
otherwise) and are sent only to the chosen provider's API:

- **Anthropic**: direct browser calls are allowed with the `anthropic-dangerous-direct-browser-access` header.
- **Google Gemini**: native REST API (`streamGenerateContent`).
- **OpenAI**: Chat Completions. OpenAI does not guarantee browser (CORS) access; the base URL can point to a
  relay or any OpenAI-compatible service.

API keys are billed per use and are separate from ChatGPT or Claude subscriptions.

## Hosting

`npm run build` produces a static site: any static host works (Cloudflare Pages, Netlify, GitHub Pages, or a VPS
behind Caddy/nginx). Serve `.wasm` files as `application/wasm` if possible (the loader also works without it).
The engine is single-threaded, so no cross-origin isolation headers are needed.

## License

GPL-3.0-or-later. Stockfish and chessground are GPL-3.0, so a hosted version must make its source code available
under the same license. Piece sets come from Lichess; their authors and licenses (GPL, MIT, Apache 2.0, CC BY,
CC BY-SA, CC0) are listed in `public/pieces/CREDITS.md`.
