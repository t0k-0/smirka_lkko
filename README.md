# Šmírka Mobile

Mobile-first PWA for recording LKKO glider, aerotow, and motorized flights and
synchronizing the daily log with Klubko.

## Development

```sh
npm install
npm run dev
```

The production-ready static site is generated in `dist/`:

```sh
npm run check
npm run build
```

Browser tests use a mocked Klubko server and never write to the real service:

```sh
npx playwright install chromium
npm run test:e2e
```

## Structure

- `src/domain.ts` contains pure flight, composer, landing, and reference-data rules.
- `src/persistence.ts`, `src/klubko.ts`, and `src/sync.ts` isolate browser storage and network behavior.
- `src/App.tsx` contains the Preact feature views and application commands.
- `tests/` contains unit and component-level regression tests; `e2e/` covers the mobile workflow.

Existing installations are migrated from the original `gl5`,
`klubko-config`, and `klubko-sync-queue` keys. The generated service worker
precaches the hashed production assets.
