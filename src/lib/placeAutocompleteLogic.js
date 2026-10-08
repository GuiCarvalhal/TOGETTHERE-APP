// Pure, testable helpers shared by PlaceAutocomplete and HomePlaceField.
// The interaction logic (when to search, what a selection produces) lives
// here so the "don't reopen after selection" rule and the home-address
// mapping can be unit-tested without a DOM.

// Decide whether the debounced search should fire for the current text.
// `justSelected` is true after the user picks a prediction and stays true
// until they deliberately type again — it suppresses the search for every
// cascading text change that follows a selection (choose sets the text, the
// parent echoes a new controlled value back, resolvePlace resolves the full
// name…). Without this, each of those text changes re-fires the 300 ms
// search and reopens the dropdown after the user picks a place.
export function shouldSearch(text, justSelected) {
  if (justSelected) return false;
  return (text || '').trim().length >= 2;
}

// Map a resolved Google Place (from resolvePlace) to the home-address form
// state { text, place }. Returns null when `selected` is null — meaning
// "no change": the user is editing free text or the resolve failed, and
// onText already set the typed text and cleared the place. The caller must
// NOT override the text with a stale controlled value in that case.
export function homePlaceOnSelect(selected) {
  if (!selected) return null;
  return {
    text: selected.address || selected.name,
    place: {
      place_id: selected.place_id,
      lat: selected.lat,
      lng: selected.lng,
      country: selected.country,
    },
  };
}