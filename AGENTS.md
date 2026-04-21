# Agent notes — Cyllene

## Completed (pet / weather)

- **Cyllene tab pet** uses vector `CyllenePetGraphic` in [`src/components/DragonCompanion.tsx`](src/components/DragonCompanion.tsx) (not emoji/egg).
- **Weather-linked motion** + **time-of-day** shell on `.cyllene-pet-scene`; **hourly cron pulse animations** were intentionally removed.
- **Rich ambience** in [`src/components/CylleneWeatherAmbience.tsx`](src/components/CylleneWeatherAmbience.tsx) + styles in [`src/index.css`](src/index.css) (sunny butterflies/flowers, hot-day cactus + dust devil, clouds, rain/thunder + lightning SVG, wind gusts + leaves, snow, fog).
- **Thunder**: random flash + `haptic.notification("warning")` on rising edge (see `DragonCompanion`).
- **Shipped in git**: commit `21bb695` (`feat(pet): weather ambience around Cyllene companion`). Branch may be ahead of `origin/main` until pushed.

## Architecture

`useWeather` → [`src/pages/DragonPage.tsx`](src/pages/DragonPage.tsx) → `DragonCompanion` → `CylleneWeatherAmbience` + `index.css`.

## Session context

Prior design discussion: Cursor transcript id `525e8bc5-e06a-4b59-8b5c-6acf0fb0f769` (pet weather / Hermes mini-app ideas).

## Working tree

Unrelated WIP may still be unstaged (e.g. `App.tsx`, `ChatPage.tsx`, `telegram.ts`, etc.). Pet/weather paths above are committed.
