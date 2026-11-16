// Shared "Back" behaviour: always return to the page the user actually came
// from. Only a deep link or a refresh (no in-app history) falls back to the
// given route, so a Back arrow never sends someone to a menu they never visited.
export function goBack(navigate, fallback = '/') {
  if (window.history.state && window.history.state.idx > 0) navigate(-1);
  else navigate(fallback, { replace: true });
}