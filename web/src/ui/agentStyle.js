// Presentation constants shared by the 3D agents and the DOM panels.

import { LANDMARKS } from '../city/layout.js';

export const ROLE_COLORS = {
  'nsp-scout': '#4E79A7',
  'mahadbt-scout': '#F28E2B',
  'foundations-scout': '#59A14F',
  'opps-scout': '#FF9DA7',
  watchman: '#76B7B2',
  mayor: '#EDC948',
  'deep-diver': '#B07AA1',
  gatekeeper: '#9bc53d',
  verifier: '#5e60ce',
  profiler: '#00a6a6',
  'kit-builder': '#e07a5f',
  'conflict-checker': '#8d6e63',
};
export const roleColor = (id) => ROLE_COLORS[id] ?? '#9aa3ad';

export const STATUS = {
  idle: { label: 'Idle', color: '#9aa3ad' },
  walking: { label: 'Walking', color: '#4ea8de' },
  working: { label: 'Working', color: '#f4a261' },
  busy: { label: 'Working', color: '#f4a261' },
  done: { label: 'Done', color: '#43aa8b' },
  failed: { label: 'Failed', color: '#e63946' },
};

export const TOOL_ICON = { search: '🔍', fetch: '📄', agent: '🤖', monitor: '👁', database: '📚' };

const BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
export const landmark = (id) => BY_ID[id];
export const placeName = (id) => BY_ID[id]?.short ?? id ?? '';

export function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
