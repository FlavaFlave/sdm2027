/** Proste, własne ikony (SVG, kolor z currentColor). */
const S = (body) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  passport: S('<rect x="11" y="6" width="26" height="36" rx="3"/><circle cx="24" cy="21" r="6"/><path d="M18 21h12M24 15c-2 3-2 9 0 12M24 15c2 3 2 9 0 12M17 33h14"/>'),
  pair: S('<circle cx="17" cy="14" r="5"/><circle cx="31" cy="14" r="5"/><path d="M8 40v-7a9 9 0 0 1 18 0M22 40v-7a9 9 0 0 1 18 0"/>'),
  phone: S('<rect x="14" y="5" width="20" height="38" rx="4"/><path d="M21 37h6"/><path d="M19 15h10M19 21h10M19 27h6"/>'),
  sun: S('<circle cx="24" cy="24" r="8"/><path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M10.6 37.4l3.5-3.5M33.9 14.1l3.5-3.5"/>'),
  quake: S('<path d="M4 30h7l4-12 6 22 5-26 5 20 3-4h10"/><path d="M14 8h20"/>'),
  crowd: S('<circle cx="12" cy="16" r="4"/><circle cx="24" cy="12" r="4"/><circle cx="36" cy="16" r="4"/><path d="M5 38v-6a7 7 0 0 1 14 0M17 38v-10a7 7 0 0 1 14 0v10M29 38v-6a7 7 0 0 1 14 0"/>'),
  nomeat: S('<circle cx="24" cy="24" r="18"/><path d="M11 37L37 11"/><path d="M17 26c0-6 4-10 9-10 4 0 6 3 6 6 0 6-6 9-11 9-2 0-4-2-4-5z"/>'),
  med: S('<rect x="8" y="14" width="32" height="24" rx="4"/><path d="M18 14v-4h12v4M24 20v12M18 26h12"/>'),
  noalc: S('<circle cx="24" cy="24" r="18"/><path d="M11 37L37 11"/><path d="M19 12h10l-2 12a3 3 0 0 1-6 0zM24 27v8M20 35h8"/>'),
  camera: S('<rect x="6" y="14" width="36" height="24" rx="4"/><circle cx="24" cy="26" r="7"/><path d="M17 14l3-5h8l3 5"/>'),
  shoes: S('<path d="M6 30c4 0 8-6 10-10l6 4c3 2 9 3 14 3 4 0 6 2 6 5v2H6z"/><path d="M6 36h36"/>'),
  map: S('<path d="M6 12l11-4 14 4 11-4v28l-11 4-14-4-11 4z"/><path d="M17 8v28M31 12v28"/>'),
  knife: S('<path d="M8 40l18-18M26 22l12-14c2 4 1 10-4 14l-8 0"/><circle cx="36" cy="36" r="8"/><path d="M30 42l12-12"/>'),
  bow: S('<circle cx="22" cy="10" r="4"/><path d="M22 16c5 2 10 6 12 12M22 16l-4 10 2 16M18 26l8 4M20 42h6"/>'),
  law: S('<path d="M24 6v34M14 40h20M10 12h28M10 12l-5 12a5 5 0 0 0 10 0zM38 12l-5 12a5 5 0 0 0 10 0z"/>'),
  yen: S('<circle cx="24" cy="24" r="18"/><path d="M17 13l7 10 7-10M24 23v13M18 25h12M18 30h12"/>'),
  bus: S('<rect x="8" y="8" width="32" height="28" rx="5"/><path d="M8 22h32M14 36v4M34 36v4"/><circle cx="15" cy="29" r="2"/><circle cx="33" cy="29" r="2"/>'),
  church: S('<path d="M24 4v8M20 8h8M14 22l10-10 10 10v20H14z"/><path d="M20 42v-8a4 4 0 0 1 8 0v8M8 42h32"/>'),
  bag: S('<rect x="10" y="14" width="28" height="26" rx="5"/><path d="M18 14v-4a6 6 0 0 1 12 0v4M10 26h28"/>'),
  doc: S('<path d="M12 6h17l9 9v27H12z"/><path d="M29 6v9h9M18 24h14M18 30h14M18 36h8"/>'),
  heart: S('<path d="M24 40S7 30 7 18a8 8 0 0 1 17-4 8 8 0 0 1 17 4c0 12-17 22-17 22z"/>'),
  sos: S('<circle cx="24" cy="24" r="18"/><path d="M24 14v12M24 32v1"/>'),
};

export function icon(name) { return ICONS[name] || ICONS.doc; }
