# Delivery verification — Coastline Kart

The delivered game runs entirely in the browser with Three.js. Roblox Studio and
Blender are not used. All models, textures, UI artwork and audio are generated
locally; the standalone HTML makes zero external requests.

| Requirement | Verified result |
| --- | --- |
| Fully assembled playable game | Single 628,758-byte HTML contains runtime, circuit, six karts, UI and audio |
| One dressed circuit | 682 m coastal circuit; village/plaza/gardens, palms, lighthouse, boats, grandstand, pit stalls, sponsor signs and pennants |
| Responsive driving | Real keyboard acceleration and steering verified in Chromium; speed reached 26.4 m/s before drift |
| Left/right direction fix (1.0.1) | 14 real-browser checks pass: arrows and A/D in both camera views, left/right drifting and boost release, and both touch buttons; heading is checked against the driver's right vector rather than world X/Z signs |
| Progressive steering (1.1.0) | Shared keyboard/touch hold-time ramp, gentler maximum angle at speed, release centering and fresh ramp on reverse; 18 browser/control checks pass; 0.3 s input turns about 1 degree instead of 7–8 degrees in the measured setup |
| Drifting and boost | Left and right drifting preserve their direction and award boost when released; both browser checks pass with the new progressive steering |
| AI opponents | Five opponents use pursuit steering, curve braking and overtaking lanes through the same movement/collision system |
| Checkpoints and laps | 12 ordered gates per lap, 3 laps; gate 37 means three complete laps; reverse-driving guard checked |
| Complete race loop | Countdown → racing → all 6 finish → results → restart checked in real browser |
| Full rendered race | Continuous real-time playthrough ran 86.47 s wall time, player finish 76.616 s, all 6 finish, no console errors |
| Pause / recovery | Pause freezes simulation; resume works; car reset preserves progress and adds 2 s; restart clears race state |
| Materials / pivots / scale | Kart high/low variants have finite positions/normals, correct +Z forward, steering/spin pivots and 0.5 mm wheel-contact tolerance |
| VFX / audio | Pooled drift sparks/skids, boost feedback, confetti; locally synthesized engine, tires, wind, melody and cues; audio integration reports no browser errors |
| Desktop rendering | 1280×800 Chromium continuous-race samples averaged 76.0 FPS; lowest 1 s sample 48.3 FPS, highest 88.4 FPS |
| Mobile layout / input | Chromium 390×844 touch emulation checked; no horizontal overflow; real touch steering, auto throttle, brake/drift controls and pause UI |
| Offline operation | Zero HTTP/HTTPS requests during browser QA |
| Source delivery | Source ZIP includes assets' generators, game logic, build scripts and standalone game |
| Code formatting | JavaScript, CSS, HTML and tool scripts use the checked-in Prettier configuration; formatting check, build, full race logic and both steering verification suites pass |
| Online hosting | Public site at https://coastline-kart-riviera-run.jjuyp.chatgpt.site/; fresh anonymous Chromium context returns HTTP 200, starts a race and verifies progressive steering without login or browser errors |

Performance numbers describe this workstation's Chromium run, not physical phone
hardware. Screenshots and machine-readable reports are in `output/playwright/`.
The full rendered race used AI-supplied steering for the player through the same
driving path; keyboard drifting and touch steering were exercised separately.
Audio synthesis was integrated and error-checked; subjective speaker listening
was not separately verified.

Evidence: `full-race-report.json`, `browser-report.json`, `kart-asset-check.json`,
`steering-report.json`, `steering-fixed-desktop.png`, `steering-fixed-mobile-left.png`, `steering-fixed-mobile-right.png`,
`final-menu.png`, `final-race-sector-1.png` through `-3.png`, `final-results.png`,
`mobile-menu.png`, `mobile-driving.png`, `mobile-paused.png`.

Selected committed evidence is in `docs/qa/`: the continuous race report,
progressive-steering measurements and direction checks. The progressive report
compares the previous bundled game with 1.1.0 through actual keyboard and touch
events; the old baseline HTML is a local QA artifact, not required to play.
