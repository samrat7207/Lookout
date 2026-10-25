// City grid (CITY_DESIGN §1): 5×5 blocks of 11 m, 3 m roads, an outer ring road, 76 m grey base.
// The inner 3×3 holds the landmarks; the outer ring holds four districts (offices, campus,
// homes, market) and corner parks. Agents only use the inner roads.
// Landmark ids match the event `building` ids from EVENT_SCHEMA so Stage 2 can
// route characters to them.

export const BASE = 76;
export const ASPHALT = 73; // road surface extent (±36.5)
export const BLOCK = 11;
export const ROAD_W = 3;
export const ROAD_LINES = [-35, -21, -7, 7, 21, 35];
export const BLOCK_CENTERS = [-28, -14, 0, 14, 28];
export const KERB_H = 0.16;
export const LOT_TOP = 0.2; // ground level inside a block
export const ROAD_TOP = 0.05;
export const LANDMARKS = [
  {
    id: 'nsp',
    name: 'Central Scholarships Hall',
    short: 'NSP Hall',
    blurb: 'Central government scholarships',
    icon: '🏛️',
    x: -14, z: -14, labelY: 7.6,
    hits: [{ x: -14, z: -14.6, w: 9, h: 6.4, d: 7 }],
  },
  {
    id: 'mahadbt', // any state portal; only NSP is named in the UI
    name: 'State Scholarships',
    short: 'State Scholarships',
    blurb: 'State government schemes',
    icon: '🏢',
    x: 14, z: -14, labelY: 7.4,
    hits: [{ x: 14, z: -15.3, w: 8.6, h: 6.6, d: 5 }],
  },
  {
    id: 'foundations',
    name: 'Private & Foundation Scholarships',
    short: 'Private & Foundation',
    blurb: 'Corporate and foundation awards',
    icon: '🌱',
    x: -14, z: 14, labelY: 9.6,
    hits: [{ x: -14, z: 13.6, w: 7.4, h: 7.6, d: 5.4 }],
  },
  {
    id: 'watchtower',
    name: 'Watchtower',
    short: 'Watchtower',
    blurb: 'Keeps an eye on deadline changes',
    icon: '🗼',
    x: 0, z: -14, labelY: 13.4,
    hits: [{ x: 0, z: -14, w: 3, h: 11.8, d: 3 }],
  },
  {
    id: 'townhall',
    name: 'Town Hall',
    short: 'Town Hall',
    blurb: 'Where your plan is briefed',
    icon: '🏛',
    x: 0, z: 0, labelY: 14.6,
    hits: [{ x: 0, z: -1.8, w: 7.6, h: 6.6, d: 4.4 }],
  },
  {
    id: 'library',
    name: 'Library',
    short: 'Library',
    blurb: 'Saved runs: the Librarian looks up your last one',
    icon: '📚',
    x: -14, z: 0, labelY: 7.2,
    hits: [{ x: -14.6, z: -0.4, w: 7.4, h: 5.4, d: 5.2 }],
  },
  {
    id: 'cafeteria',
    name: 'Cafeteria',
    short: 'Cafeteria',
    blurb: 'Where agents hand data to each other',
    icon: '☕',
    x: 11.6, z: -1.2, labelY: 4.2,
    hits: [{ x: 11.6, z: -1.6, w: 4.0, h: 1.8, d: 4.0 }],
  },
  {
    id: 'opportunities',
    name: 'Opportunities District',
    short: 'Opportunities',
    blurb: 'Hackathons and tech events',
    icon: '💻',
    x: 14, z: 14, labelY: 5.6,
    hits: [
      { x: 11.4, z: 11.8, w: 3.6, h: 3.4, d: 3.3, name: 'Hackathon Garage' },
      { x: 16.4, z: 12.2, w: 4.4, h: 3.1, d: 4.4, name: 'Tech Events Arena' },
      { x: 11.6, z: 16.6, w: 2.8, h: 2.4, d: 2.8, name: 'Meetup Kiosk' },
    ],
  },
];
