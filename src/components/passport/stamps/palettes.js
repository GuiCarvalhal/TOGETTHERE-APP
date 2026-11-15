// Colour palettes for the collectible passport stamps. One entry per sample
// country keeps each badge visually distinct (strong palette, layered sky /
// ground / accent) while the SAME landmark line art from landmarks.jsx is
// reused inside it — adding a country stays one drawing plus one palette.
//
// Every palette: top/bottom = sky gradient, sun = highlight disc, ground =
// horizon band, accent = secondary colour, plate = label/paper colour, ink =
// the landmark pen colour, rim = outer collectible edge.
export const STAMP_PALETTES = {
  US: { top: '#1B3A6B', bottom: '#3E6DA8', sun: '#F2B441', ground: '#0E2445', accent: '#D94F3D', plate: '#FBF1DC', ink: '#0B1A2E', rim: '#0E2445' },
  BR: { top: '#0F5C4B', bottom: '#37A97B', sun: '#F7D046', ground: '#0A3B2F', accent: '#F2B233', plate: '#FFF6DC', ink: '#08251D', rim: '#0A3B2F' },
  FR: { top: '#1F356B', bottom: '#5479BC', sun: '#F5D06A', ground: '#16264A', accent: '#D9453A', plate: '#FDF4E3', ink: '#101E3A', rim: '#16264A' },
  IT: { top: '#A33F27', bottom: '#E08A4E', sun: '#FBE3A6', ground: '#6B2415', accent: '#1E7A4F', plate: '#FCEED6', ink: '#43160C', rim: '#6B2415' },
  JP: { top: '#8E1F3A', bottom: '#D4506E', sun: '#F7E0C6', ground: '#5C1229', accent: '#F2C14E', plate: '#FDEDE4', ink: '#3A0A18', rim: '#5C1229' },
  EG: { top: '#C97A2E', bottom: '#E9B45C', sun: '#FFF0C9', ground: '#8A4B22', accent: '#1F6F7A', plate: '#FDF0D6', ink: '#3A2210', rim: '#7A3F1C' },
  IN: { top: '#B85A1E', bottom: '#E8A13C', sun: '#FFF1D0', ground: '#6B2E12', accent: '#1F7A6B', plate: '#FDEFD8', ink: '#3A1708', rim: '#6B2E12' },
  MX: { top: '#0E6B4F', bottom: '#34A87E', sun: '#F5C542', ground: '#0A3E2E', accent: '#C0392B', plate: '#FBF3DC', ink: '#07281D', rim: '#0A3E2E' },
  GB: { top: '#1B2B4A', bottom: '#40608F', sun: '#D9C48A', ground: '#121E36', accent: '#B03A2E', plate: '#F7EFDC', ink: '#0C1526', rim: '#121E36' },
  AU: { top: '#123B57', bottom: '#2C7DA0', sun: '#F4C95D', ground: '#0C2C42', accent: '#E76F51', plate: '#FDF3E0', ink: '#08202F', rim: '#0C2C42' },
  AE: { top: '#8A5E1C', bottom: '#C79A3A', sun: '#FFE9A8', ground: '#3E2A0A', accent: '#1F5F6B', plate: '#FDF1D7', ink: '#2C1D06', rim: '#3E2A0A' },
  ZA: { top: '#123C4A', bottom: '#37869B', sun: '#F2B233', ground: '#0B2733', accent: '#D9772E', plate: '#FBF2DE', ink: '#071C24', rim: '#0B2733' },
};

// Countries outside the sample set still get a rich badge: pick one of these by
// a stable hash of the country code, so the same country always looks the same.
const FALLBACKS = [
  { top: '#1E3A5F', bottom: '#4B84B8', sun: '#F2C14E', ground: '#122840', accent: '#D96C4A', plate: '#FBF2DE', ink: '#0A1A2B', rim: '#122840' },
  { top: '#5B2A52', bottom: '#A9578A', sun: '#F6D57A', ground: '#3B1735', accent: '#E0A33C', plate: '#FBEFE6', ink: '#2A0F26', rim: '#3B1735' },
  { top: '#14524A', bottom: '#3E9E86', sun: '#F7D97C', ground: '#0B322D', accent: '#E2704C', plate: '#FBF4DE', ink: '#052420', rim: '#0B322D' },
  { top: '#7A3A17', bottom: '#C97A3C', sun: '#FBE3A6', ground: '#4E230D', accent: '#2C7A7B', plate: '#FCF0DB', ink: '#311406', rim: '#4E230D' },
  { top: '#2B3A63', bottom: '#5E6FA8', sun: '#E9D08A', ground: '#1B2440', accent: '#C2543F', plate: '#F8F1E6', ink: '#0F1628', rim: '#1B2440' },
  { top: '#0F4C63', bottom: '#2E93A8', sun: '#F5CE6B', ground: '#093443', accent: '#E4693F', plate: '#FAF3E3', ink: '#052630', rim: '#093443' },
];

export function paletteFor(code) {
  const key = String(code || '').toUpperCase();
  if (STAMP_PALETTES[key]) return STAMP_PALETTES[key];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 9973;
  return FALLBACKS[hash % FALLBACKS.length];
}

export default STAMP_PALETTES;