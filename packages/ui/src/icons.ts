// Tracés SVG — port direct de docs/design/ui.jsx (ICONS). Données graphiques
// pures, aucune décision métier : pas soumis aux règles de la Phase 9.0.
export const ICONES = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10",
  doc: "M6 2h8l4 4v16H6zM14 2v4h4",
  plus: "M12 5v14M5 12h14",
  inbox: "M3 13h5l2 3h4l2-3h5M3 13l3-9h12l3 9v6H3z",
  check: "M4 12l5 5L20 6",
  x: "M6 6l12 12M18 6L6 18",
  chart: "M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-1-3-2 .5a7 7 0 00-1.4-1.4L17 4l-3-1-1 2a7 7 0 00-2 0L10 3 7 4l.4 2.1A7 7 0 006 7.5L4 7 3 10l2 1a7 7 0 000 2l-2 1 1 3 2.1-.5A7 7 0 008 19l1 2 3-1 1-2a7 7 0 002 0l1 2 3-1-.5-2.1A7 7 0 0019 14z",
  bell: "M6 9a6 6 0 1112 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6zM10 20a2 2 0 004 0",
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.3 3-5 7-5s7 1.7 7 5M17 11a3 3 0 000-6M22 20c0-2.6-1.7-4.2-4-4.7",
  lock: "M6 10V8a6 6 0 1112 0v2M5 10h14v10H5zM12 14v3",
  unlock: "M7 10V8a5 5 0 019.6-2M5 10h14v10H5z",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  download: "M12 3v12m0 0l-4-4m4 4l4-4M4 19h16",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  paperclip: "M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  alert: "M12 3l9 16H3zM12 10v4M12 17v.5",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8v.5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  // Absent de docs/design/ui.jsx (aucun toggle de visibilité mot de passe
  // dans la maquette) — glyphe "eye" existant + un trait diagonal, même
  // style minimaliste que le reste de ce fichier, pas une invention libre.
  eyeOff: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6zM3 3l18 18",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  logout: "M15 4h4v16h-4M10 12h9m0 0l-4-4m4 4l-4 4",
  calc: "M6 3h12v18H6zM9 7h6M8 11h.5M12 11h.5M16 11h.5M8 14h.5M12 14h.5M16 14h.5M8 17h4",
  scale: "M12 3v18M7 7h10M5 7l-2 6h4zM19 7l-2 6h4zM3 13a2 2 0 004 0M17 13a2 2 0 004 0M8 21h8",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  refresh: "M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M18 4v5h-5M6 20v-5h5",
  chevronD: "M6 9l6 6 6-6",
  chevronR: "M9 6l6 6-6 6",
  building: "M4 21V5l8-2 8 2v16M9 9h.5M9 13h.5M9 17h.5M14.5 9h.5M14.5 13h.5M14.5 17h.5",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  delegate: "M7 8a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.5-5 5-5M14 12h7m0 0l-3-3m3 3l-3 3M14 19h7",
  flow: "M5 5h6v4H5zM13 15h6v4h-6zM8 9v3h8M8 12v3"
} as const;

export type NomIcone = keyof typeof ICONES;
