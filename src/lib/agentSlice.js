// Slice the underlying 10+10 recommendation set to the user's Short/Long
// preference. Short = 5 Eat + 5 Do; Long = 10 Eat + 10 Do. Switching is
// instant — no re-generation or network calls, just a slice of the cached
// data. todaysPicks are NOT sliced (already capped at 4 by the backend).
//
// The agentLength preference is persisted per-gathering/device in useViewPrefs,
// independent of the Mine/Group scope used by Journey/Expenses.
export const SHORT_COUNT = 5;
export const LONG_COUNT = 10;

export function sliceAgentData(data, agentLength) {
  if (!data) return data;
  const count = agentLength === 'long' ? LONG_COUNT : SHORT_COUNT;
  return {
    ...data,
    whereToEat: (data.whereToEat || []).slice(0, count),
    whatToDo: (data.whatToDo || []).slice(0, count),
  };
}

// Show a translated reload hint when Long mode is active but the cached brief
// has fewer than 10 places in either category (e.g. an old 8-item brief from
// before the backend was upgraded to return 10). Does NOT silently invoke the
// provider — the user taps Reload in the toolbar to fetch a fresh 10+10.
export function shouldShowReloadHint(data, agentLength) {
  if (!data || agentLength !== 'long') return false;
  return (data.whereToEat || []).length < LONG_COUNT || (data.whatToDo || []).length < LONG_COUNT;
}