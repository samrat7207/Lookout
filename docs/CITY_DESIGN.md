# City Design

Rule: **boxes, cones, cylinders, planes. Flat colours. No textures, no models, no external assets.** It should look good because of the palette, soft lighting and motion.

## 1. Layout (top view, units = metres)

```
              Watchtower (0, -8)
                   ▲
                   │
 NSP (-8, 0) ◀──── Town Hall (0, 0) ────▶ MahaDBT (8, 0)
                   │
              (camera from +z, raised, looking at origin)
```
- Ground: a 30×30 plane in grass green, with paths as thin light-grey boxes (0.02 high) from Town Hall to each building.
- Camera: `OrbitControls` with limited polar angle (no going under the ground), starting at `[0, 14, 16]` with an FOV of about 40. Let auto-rotate run slowly while idle, and stop it once a run starts.
- Lights: one hemisphere light plus one directional light with soft shadows (shadow map size 1024).

## 2. Buildings

| Building | Shape | Colour | Sign |
|---|---|---|---|
| **NSP** | wide box 4×3×3 + flat roof slab + a small flag (cone) | navy `#2F4B7C` | "NSP" |
| **MahaDBT** | box 3.5×2.5×3.5 + pyramid roof (4-sided cone) | saffron `#F28E2B` | "MahaDBT" |
| **Watchtower** | tall thin box 1.2×6×1.2 + cone top + a sphere "lamp" | stone `#8C8C8C`, lamp `#FFD166` | "Watchtower" |
| **Foundations** | box 3×2.2×3 + a flat roof + a small dome (sphere half) | teal-green `#59A14F` | "Foundations" |
| **Town Hall** | box 4×2.5×3 + 4 cylinder columns + triangular pediment | cream `#F4E9D8` | "Town Hall" |

**Opportunities district (cuttable):** at `(0, 8)`, three small booths (box 1.5×1.2×1.5 each, purple `#B07AA1`, with banner planes) under one sign, "Hackathons". It is drawn only when `opps-scout` is in `run.started.agents`. Foundations sits at `(-8, -6)`.

Building states (driven by events):
- `idle`: normal colour
- `busy`: a TinyFish call is in flight against this building. The emissive pulse goes from 0.1 to 0.4, and a small floating icon shows the tool: 🔍 search, 📄 fetch, 🤖 agent, 👁 monitor (drei `<Html>` text, so there are no assets).
- `error`: brief red tint for 1.5 s
- Watchtower lamp: steady glow after `watchtower.checked`, and it blinks red/yellow on `watchtower.change`

Signs use drei `<Text>` (the default font is fine) or `<Html>` labels.

## 3. Characters

Built from simple shapes: a body (box 0.5×0.7×0.35), a head (box 0.4), and a hat (cone) in the agent's colour. Total height is about 1.3.

| Agent | Hat colour |
|---|---|
| nsp-scout | `#4E79A7` blue |
| mahadbt-scout | `#E15759` red |
| watchman | `#76B7B2` teal |
| mayor | `#EDC948` gold (stays at Town Hall) |
| foundations-scout | `#59A14F` green |
| opps-scout | `#FF9DA7` pink (cuttable) |
| deep-diver | `#B07AA1` purple (optional) |

States (from events):
| State | Trigger | Visual |
|---|---|---|
| `spawned` | `agent.spawned` | Pops in at Town Hall (scale goes 0 to 1) |
| `walking` | `agent.walking` | Lerps along the path to the target, with a little bob (sin of time) |
| `working` | `agent.working` | Stands at the door and taps (small rotation wiggle). Thought bubble shows "…" |
| `found` | `agent.found` | **Lights up** (emissive glow plus a point light for 1.5 s). The speech bubble shows `finding.bubble`. |
| `error` | `agent.error` | Grey puff, bubble shows "Hmm, site slow. Retrying" |
| `returning` | `agent.returning` | Walks back to Town Hall |
| `done` | `agent.done` | Idles at Town Hall and faces the camera |

Walking speed is about 3 m/s, so each trip takes about 3 s. If a new target arrives mid-walk, retarget smoothly.

Bubble queue: when several `agent.found` events arrive close together, show each for at least 1.2 s and keep a maximum of 3 queued. When a newer one arrives, the oldest is dropped and a "+N more" counter is shown. This stops a burst of findings from flickering.

## 4. Overlay UI (HTML, not 3D)

- **Top left:** profile form (course, state, category, gender, disability) and a **Run** button.
- **Top right:** a **LIVE / MOCK** toggle (pill switch), a recording dropdown when in mock, and a speed control of 1×, 2× or 4×.
- **Top centre:** a countdown banner, "NSP closes in 7 days · 31 Oct 2026". It appears as soon as the headline finding arrives.
- **Right panel:** the plan, as **one list sorted by deadline**, with divider labels (This week, This month, Later, No date). Each row shows a kind badge (🎓 scholarship, 💻 hackathon, 📅 event), the title, source badge, date and its label, days left, "why", a source link and the action. Scholarship rows have a **View Application Kit** button.
- **Application Kit drawer:** documents checklist, prefilled fields (persona values marked "from sample student"), steps, deadline and source link. A fixed notice at the top reads: **"Lookout never submits forms and never asks for, enters or stores passwords, OTPs or Aadhaar numbers."** Sensitive fields show "Enter this yourself on the official portal". There are no input boxes.
- The profile form is captioned **"sample student"**.
- **Bottom:** an event ticker (the last 5 events in small text). It shows judges the real API calls happening.
- **Mode badge:** "Replaying recorded run from 24 Oct, 10:15" when in mock, so we are honest with judges.

## 5. Performance

- There are fewer than 100 meshes, so there is no need for instancing.
- `frameloop="always"` is fine.
- Use Html bubbles with `distanceFactor` so they scale with zoom.
