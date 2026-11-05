// Device-experience resolution for layouts that need more than CSS breakpoints.
//
// The rule (agreed for the Journey page, reusable elsewhere):
//  - phone                        -> 'phone'   (unchanged experience)
//  - tablet in PORTRAIT           -> 'phone'   (same experience as phone)
//  - tablet in LANDSCAPE          -> 'desktop' (two-column experience)
//  - desktop / laptop             -> 'desktop'
//
// A tablet in portrait is 768-1023 CSS px wide, which is exactly the phone
// experience band. Anything >= 1024 px wide that is also wider than it is tall
// (landscape tablet, laptop, desktop monitor) gets the desktop experience.
// Pure function (no window access) so it can be unit-tested directly.
export function resolveLayout(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w < 1024) return 'phone';   // phones + portrait tablets
  if (h > w) return 'phone';      // a tall window/tablet held vertically
  return 'desktop';
}

export const isDesktopLayout = (layout) => layout === 'desktop';