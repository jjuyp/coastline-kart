# Coastline Kart — 夕陽海岸盃

A finished, browser-native coastal kart racer. All geometry, textures, signage,
music and sound are procedurally generated locally. No Roblox Studio or Blender.

![Coastline Kart gameplay](docs/screenshots/gameplay.png)

## Play

Double-click **Coastline-Kart.html**. The complete game is contained in this one
HTML file; no server, installation, CDN, model downloads or internet are needed.
Use a current browser with WebGL and hardware acceleration enabled.

- W / Up: throttle. S / Down: brake. A D / Left Right: steer.
- Tap a steering key for a small correction. Hold it for up to 0.95 seconds to
  progressively increase the steering angle. The maximum angle is gentler at
  high speed; release the key to center, or change direction to start a fresh turn.
  Touch steering buttons use the same timing.
- Hold Space through a turn to charge a drift. Release after the blue meter
  fills for a mini boost; charge to orange for a longer super boost.
- Turquoise road pads give a short boost.
- R: return the kart to the center of its current section (+2 seconds).
- C: change chase camera. M: mute. Esc / P: pause. Enter: start / restart.
- On a touch device, throttle is automatic. Use the on-screen steering, brake
  and drift buttons. Landscape orientation offers a wider view.
- HQ / ECO changes rendering quality. Slow devices reduce internal rendering
  resolution automatically while retaining crisp UI.

The 682 m Riviera Run has 12 sequential gates per lap, three laps, six drivers,
wheel-to-wheel contacts, barriers, overtaking AI, individual lap times, final
standings, personal best persistence and a full pause / restart loop. AI drivers
finish after the player; the results board fills in their actual finish times.

## Source

`src/world.js` builds the circuit and coastal town. `src/kart.js` builds detailed
karts plus distant LOD variants. `src/race.js` contains fixed 120 Hz driving,
collision handling, AI pursuit and race rules. `src/main.js` integrates input,
camera, pooled VFX, UI and rendering. `src/audio.js` synthesizes original audio.
`src/steering.js` controls progressive keyboard and touch steering independently
of the AI drivers.

For a clean checkout: `npm ci`, then `npm run build`. Run `npm run dev`
for localhost preview. The build emits `dist/index.html` and the standalone HTML.
Development helpers can reuse the adjacent tidepool-jelly dependency installation
on this workstation; shipped HTML has no such dependency.

## Code formatting

Source files use two-space indentation, consistent line breaks and a 100-column
target. Run `npm run format` to apply the checked-in Prettier configuration, or
`npm run format:check` to verify it. Generated game bundles, dependency folders
and QA output are excluded from formatting.

## Validation

`npm run check` checks a complete three-lap simulation, ordered checkpoints,
all opponents finishing, acceleration, pause, restart, reset penalties and
reverse-driving gate rejection. Browser evidence and measured performance are
recorded under `output/playwright/`. Browser QA helpers use the existing local
Chromium installation and Playwright Core; they are workstation-specific tools.

The checked-in standalone HTML is the directly usable offline delivery. No
hosted deployment is required. Selected browser verification reports are included
under `docs/qa/`; additional workstation-only captures remain under `output/`.
