// One-shot marker for the Journey list: which segment it should land on.
//
// Set when a segment detail is left toward the journey page (Back from a
// segment opened in the list, or the "Open gathering" action on any segment),
// and read once when the journey page mounts. Module memory only — it lives for
// a single navigation, never survives a reload, and is cleared as soon as it is
// read, so a later visit through normal navigation still lands on today.
let pendingItemId = null;

// Navigation state stamped on a segment detail opened FROM the journey list, so
// Back can tell "returning to the list" from "returning to Home/another page".
// A shared constant (stable identity) keeps it safe as an effect dependency.
export const FROM_JOURNEY_STATE = { fromJourney: true };

export function markJourneyReturn(itemId) {
  pendingItemId = itemId || null;
}

export function consumeJourneyReturn() {
  const id = pendingItemId;
  pendingItemId = null;
  return id;
}