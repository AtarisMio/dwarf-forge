# TypeScript migration implementation plan

**Goal:** Migrate runtime, tests, and tooling to TypeScript with strict, enforced type coverage while preserving game behavior and saves.

**Architecture:** Preserve module responsibilities. Central game types describe swords, contracts, tickets and action outcomes; workshop types describe scene snapshots and callbacks. Parse persisted unknown values at the runtime boundary before exposing typed state.

**Toolchain:** TypeScript 5.9, Three.js 0.180 types, Node.js 22 types, Vite 7, tsx and node:test.

## Requirements
- All application, test and tooling source uses .ts.
- Strict compilation, no explicit any or TypeScript suppression directives.
- Keep existing rule values, rendering, animations, UI and save compatibility.
- Type checking gates production build and CI; all existing regression tests remain meaningful.

## Ownership and sequence
1. Parent: strict compiler configuration, dependency lock, main DOM/event boundary, SVG helpers, script migration, CI and contributor documentation.
2. Gameplay lane: rule IDs, game state, discriminated action outcomes, save validation, ticket data and associated tests.
3. Workshop lane: typed Three.js scene/materials/animation/physics, scene API, and geometry regression tests.
4. Input/audio lane: typed DOM event adapters with small mockable interfaces, Web Audio, and associated tests.
5. Parent integration: run npm run typecheck, npm test and npm run build; inspect suppression/unsafe-cast coverage; smoke test desktop and phone game flow and old-save continuation.
6. Publish the verified source and production build to the existing GitHub repository and Cloudflare deployment; verify live assets.
