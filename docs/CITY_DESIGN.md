# City Design

Rule: **boxes, cones, cylinders, planes. Flat colours. No textures, no models, no external assets.** Every design is original. It should look good because of the palette, soft lighting and motion: cheerful, clean and toy-like.

## 1. Layout (top view, units = metres)

An isometric diorama: one city block grid on a flat grey base (48×48), shown as a floating tile. There are 3×3 blocks of 11×11, separated by 3 m roads, plus a ring road around the edge.

```
            x = -14                  x = 0                 x = +14
 z = -14  Central Scholarships   Watchtower + park     State Scholarships
          Hall (NSP)
 z = 0    Homes (filler)         Town Hall + plaza     Shops (filler)
 z = +14  Private & Foundation   Park + pond (filler)  Opportunities district
          Scholarships                                 (3 small buildings)
```
- **Roads:** centre lines at x, z = ±7 (inner grid) and ±21 (ring). Asphalt with dashed centre lines, crosswalk stripes at the intersections, and kerbed sidewalks around every block.
- **Traffic:** cars and trucks loop on the inner and outer rings, **keep-left** (Indian roads), with rounded turns. Parked cars line the spoke roads.
- **Filler:** apartment blocks, shops with awnings, parks with trees, benches, lamp posts and a pond. Every building gets window grids and rooftop details (AC units, water tanks, solar panels, antennas, stair huts).
- **Camera:** orthographic isometric view from `[1, 1, 1]`-ish. `OrbitControls` with polar limits (roughly 30° to 65°), zoom limits, and pan clamped to the base. The initial zoom fits the viewport.
- **Lights:** a hemisphere light plus one warm directional sun with soft PCF shadows (2048 map) covering the base.
- **Performance:** every repeated primitive (boxes, cylinders, cones, windows, trees, vehicle parts) is drawn with **instanced meshes** that have per-instance colours, which keeps draw calls in the tens. `?stats` shows FPS and draw calls.

## 2. Landmarks

Only NSP is named as a portal in the UI. The others are generic, so the city works for any state and any listing site. Each landmark has an always-on label pill, and hovering shows its name card plus a highlight ring on the ground.

| Landmark | Event `building` ID | Design | Palette |
|---|---|---|---|
| **Central Scholarships Hall (NSP)** | `nsp` | Civic hall on a stepped plinth, white-columned portico, pediment and a gold dome | navy `#2F4B7C`, white, gold |
| **State Scholarships** | `mahadbt` (any state portal) | 3-storey office with a central tower and a terracotta pyramid roof | saffron `#F28E2B` |
| **Private & Foundation Scholarships** | `foundations` | Two modern glass towers joined by a sky bridge, with a rooftop garden | teal-green `#59A14F`, glass blue |
| **Watchtower** | `watchtower` | Tall tapered stone tower, balcony ring, glass lantern room, red cone roof, and a pulsing beacon with a rotating beam | stone `#8C8C8C`, beacon `#FFD166` |
| **Town Hall** | `townhall` | Cream hall with a clock tower and a red roof, on a plaza with a fountain, benches and flower beds. This is where the plan and briefing happen. | cream `#F4E9D8`, red |
| **Opportunities district** | `opportunities` | Three small buildings: a Hackathon Garage, a Tech Events Arena (dome) and a Meetup Kiosk, with bunting. It is cuttable: with the add-on off it stays as idle scenery. | purple `#B07AA1`, pink, yellow |

Building states (driven by events):
- `idle`: normal colour
- `busy`: a TinyFish call is in flight against this building. The emissive pulse goes from 0.1 to 0.4, and a small floating icon shows the tool: 🔍 search, 📄 fetch, 🤖 agent, 👁 monitor (drei `<Html>` text, so there are no assets).
- `error`: brief red tint for 1.5 s
- Watchtower lamp: steady glow after `watchtower.checked`, and it blinks red/yellow on `watchtower.change`

Signs use drei `<Html>` labels (DOM, so there are no font assets).

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
