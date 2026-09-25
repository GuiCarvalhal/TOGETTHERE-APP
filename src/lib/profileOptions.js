// Curated, selectable option catalogs for the universal profile.
// Interests and Cuisine are stored as arrays of stable machine KEYS on the
// existing User fields (interests + dietary_preferences). Each option has a
// stable key, a human label, and an emoji glyph for chip rendering.
//
// Backward compatibility: stored free-text values are mapped to catalog keys
// case-insensitively on read; anything unmatched is preserved as a custom
// chip so no existing data is lost. Only what the user explicitly saves is
// written, in catalog-key format (plus any remaining custom strings).

export const INTERESTS = [
  { key: 'hiking', label: 'Hiking', emoji: '🥾' },
  { key: 'beaches', label: 'Beaches', emoji: '🏖️' },
  { key: 'museums', label: 'Museums', emoji: '🏛️' },
  { key: 'nightlife', label: 'Nightlife', emoji: '🌃' },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { key: 'food_tours', label: 'Food tours', emoji: '🍜' },
  { key: 'wellness_spa', label: 'Wellness/Spa', emoji: '🧖' },
  { key: 'sports', label: 'Sports', emoji: '⚽' },
  { key: 'live_music', label: 'Live music', emoji: '🎶' },
  { key: 'photography', label: 'Photography', emoji: '📷' },
  { key: 'history', label: 'History', emoji: '📜' },
  { key: 'nature_wildlife', label: 'Nature/Wildlife', emoji: '🌿' },
  { key: 'water_sports', label: 'Water sports', emoji: '🏄' },
  { key: 'road_trips', label: 'Road trips', emoji: '🚗' },
  { key: 'festivals', label: 'Festivals', emoji: '🎪' },
  { key: 'art', label: 'Art', emoji: '🎨' },
  { key: 'architecture', label: 'Architecture', emoji: '🏙️' },
  { key: 'wine', label: 'Wine', emoji: '🍷' },
  { key: 'family_friendly', label: 'Family-friendly', emoji: '👨‍👩‍👧' },
  { key: 'adventure', label: 'Adventure', emoji: '🧭' },
];

export const CUISINE = [
  { key: 'italian', label: 'Italian', emoji: '🍝' },
  { key: 'japanese', label: 'Japanese', emoji: '🍣' },
  { key: 'mexican', label: 'Mexican', emoji: '🌮' },
  { key: 'thai', label: 'Thai', emoji: '🍜' },
  { key: 'indian', label: 'Indian', emoji: '🫓' },
  { key: 'chinese', label: 'Chinese', emoji: '🥡' },
  { key: 'french', label: 'French', emoji: '🥐' },
  { key: 'mediterranean', label: 'Mediterranean', emoji: '🫒' },
  { key: 'brazilian', label: 'Brazilian', emoji: '🍖' },
  { key: 'korean', label: 'Korean', emoji: '🍲' },
  { key: 'vegan', label: 'Vegan', emoji: '🌱' },
  { key: 'vegetarian', label: 'Vegetarian', emoji: '🥗' },
  { key: 'seafood', label: 'Seafood', emoji: '🦐' },
  { key: 'steakhouse', label: 'Steakhouse', emoji: '🥩' },
  { key: 'bbq', label: 'BBQ', emoji: '🔥' },
  { key: 'street_food', label: 'Street food', emoji: '🥟' },
  { key: 'bakery_desserts', label: 'Bakery/Desserts', emoji: '🧁' },
  { key: 'middle_eastern', label: 'Middle Eastern', emoji: '🧆' },
  { key: 'spanish_tapas', label: 'Spanish/Tapas', emoji: '🥘' },
  { key: 'american', label: 'American', emoji: '🍔' },
];

function buildMap(catalog) {
  const m = {};
  for (const o of catalog) m[o.key] = o;
  return m;
}

export const INTEREST_MAP = buildMap(INTERESTS);
export const CUISINE_MAP = buildMap(CUISINE);

// Resolve a single stored value to a display chip:
//   { key, label, emoji, isCustom }
// Known strings (by exact key, or case-insensitive key/label) map to the
// canonical catalog entry; unmatched strings become a custom chip that
// preserves the original text (backward compat — nothing is dropped).
export function resolveChip(value, catalog, map) {
  if (value == null || value === '') return null;
  const v = String(value);
  if (map[v]) return { key: map[v].key, label: map[v].label, emoji: map[v].emoji, isCustom: false };
  const lower = v.toLowerCase();
  const found = catalog.find(
    (o) => o.key.toLowerCase() === lower || o.label.toLowerCase() === lower
  );
  if (found) return { key: found.key, label: found.label, emoji: found.emoji, isCustom: false };
  return { key: v, label: v, emoji: null, isCustom: true };
}

// Split a stored value array into canonical selected keys + custom strings.
// Used by the edit picker to render existing selections as toggled catalog
// chips while preserving unmatched free-text as removable custom chips.
export function splitSelected(values, catalog, map) {
  const keys = [];
  const customs = [];
  const seenKeys = new Set();
  for (const v of values || []) {
    const chip = resolveChip(v, catalog, map);
    if (!chip) continue;
    if (chip.isCustom) {
      if (!customs.includes(chip.key)) customs.push(chip.key);
    } else if (!seenKeys.has(chip.key)) {
      seenKeys.add(chip.key);
      keys.push(chip.key);
    }
  }
  return { keys, customs };
}