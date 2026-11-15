import React from 'react';

// Stamp art library — one hand-drawn landmark silhouette per country, authored
// as plain SVG inside a 100×100 box (ground line near y=94). Every stamp style
// reuses the SAME art, so adding a country is one entry here and nothing else.
//
// Styling is inherited from the stamp frame: the art group sets the pen (stroke
// currentColor, round caps), and the few solid accents below opt in with
// fill="currentColor" stroke="none".
//
// SAMPLE SET ONLY — 12 countries across regions, kept intentionally small so the
// style can be approved before the full world list is drawn. Any country without
// an entry falls back to its flag inside the same frame.

export const SAMPLE_STAMP_COUNTRIES = ['US', 'BR', 'FR', 'IT', 'JP', 'EG', 'IN', 'MX', 'GB', 'AU', 'AE', 'ZA'];

const solid = { fill: 'currentColor', stroke: 'none' };

export const LANDMARKS = {
  // Statue of Liberty
  US: (
    <g>
      <path d="M28 94h44" />
      <path d="M36 94V82h28v12" />
      <path d="M44 82c-1-13 2-24 5-31m7 31c1-13-2-24-5-31" />
      <circle cx="50" cy="39" r="6" />
      <path d="M44 35l-4-6M50 33v-7M56 35l4-6" />
      <path d="M57 50l12-18" />
      <path d="M66 32h7" />
      <path d="M69 32c-2-3-1-6 1-9 2 3 3 6 1 9z" style={solid} />
      <path d="M41 54h-6v16h6" />
    </g>
  ),
  // Christ the Redeemer over the ridge
  BR: (
    <g>
      <path d="M4 94l22-40 14 18 14-34 18 32 12-12 12 36" />
      <circle cx="54" cy="14" r="4" />
      <path d="M54 18v24" />
      <path d="M42 25h24" />
      <path d="M54 42l-5 6m5-6l5 6" />
    </g>
  ),
  // Eiffel Tower
  FR: (
    <g>
      <path d="M50 6v14" />
      <path d="M42 22h16" />
      <path d="M45 22c1 12 0 22-3 32m13-32c-1 12 0 22 3 32" />
      <path d="M39 54h22" />
      <path d="M41 54c-2 14-5 26-9 40m27-40c2 14 5 26 9 40" />
      <path d="M36 74h28" />
      <path d="M44 63l12 8m-12 0l12-8" />
      <path d="M30 94h40" />
    </g>
  ),
  // Colosseum
  IT: (
    <g>
      <path d="M10 94V56a40 28 0 0 1 80 0v38" />
      <path d="M8 72h84" />
      <path d="M16 94V82a4 4 0 0 1 8 0v12M32 94V82a4 4 0 0 1 8 0v12M48 94V82a4 4 0 0 1 8 0v12M64 94V82a4 4 0 0 1 8 0v12M80 94V82a4 4 0 0 1 8 0v12" />
      <path d="M24 72V64a3.5 3.5 0 0 1 7 0v8M38 72V64a3.5 3.5 0 0 1 7 0v8M52 72V64a3.5 3.5 0 0 1 7 0v8M66 72V64a3.5 3.5 0 0 1 7 0v8" />
    </g>
  ),
  // Mt Fuji behind a torii gate
  JP: (
    <g>
      <path d="M4 94c14-26 30-44 46-44s32 18 46 44" />
      <path d="M30 94V60M70 94V60" />
      <path d="M22 58c10-4 46-4 56 0" />
      <path d="M28 71h44" />
    </g>
  ),
  // Pyramids under the sun
  EG: (
    <g>
      <path d="M46 44l30 50H16z" />
      <path d="M76 62l20 32H56z" />
      <circle cx="72" cy="24" r="8" />
      <path d="M6 94h88" />
    </g>
  ),
  // Taj Mahal
  IN: (
    <g>
      <path d="M14 94h72" />
      <path d="M26 82h48" />
      <path d="M34 82V52h32v30" />
      <path d="M50 52c-9 0-15 8-15 15h30c0-7-6-15-15-15z" />
      <path d="M50 37v-8" />
      <path d="M44 82V66a6 6 0 0 1 12 0v16" />
      <path d="M26 82V56M74 82V56" />
      <circle cx="26" cy="52" r="3" />
      <circle cx="74" cy="52" r="3" />
    </g>
  ),
  // Chichen Itza
  MX: (
    <g>
      <path d="M34 34h32l16 60H18z" />
      <path d="M40 34V24h20v10" />
      <path d="M50 24v-6" />
      <path d="M30 50h40M26 64h48M22 78h56" />
      <path d="M46 50v44M54 50v44" />
      <path d="M8 94h84" />
    </g>
  ),
  // Big Ben
  GB: (
    <g>
      <path d="M34 30h32v34H34z" />
      <path d="M31 30l19-18 19 18" />
      <path d="M50 12V5" />
      <circle cx="50" cy="44" r="9" />
      <path d="M50 44v-5M50 44l4 3" />
      <path d="M34 64h32v24H34z" />
      <path d="M28 88h44" />
      <path d="M20 94h60" />
    </g>
  ),
  // Sydney Opera House
  AU: (
    <g>
      <path d="M10 82c0-20 14-34 30-34-6 10-8 22-6 34z" />
      <path d="M36 82c0-20 14-34 30-34-6 10-8 22-6 34z" />
      <path d="M62 82c0-18 12-30 26-30-6 9-8 20-6 30z" />
      <path d="M6 82h88" />
      <path d="M16 94h26M54 94h28" />
    </g>
  ),
  // Burj Khalifa
  AE: (
    <g>
      <path d="M50 6v10" />
      <path d="M48 16h4l4 24 5 26 6 28H33l6-28 5-26z" />
      <path d="M40 54h20M36 72h28" />
      <path d="M20 94h60" />
    </g>
  ),
  // Table Mountain
  ZA: (
    <g>
      <path d="M6 94l22-40h44l22 40z" />
      <path d="M24 60c8-4 44-4 52 0" />
      <circle cx="76" cy="26" r="7" />
      <path d="M6 94h88" />
    </g>
  ),
};

export const hasLandmark = (code) => !!LANDMARKS[String(code || '').toUpperCase()];

export default LANDMARKS;