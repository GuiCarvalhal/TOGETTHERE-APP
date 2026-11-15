import React, { useId } from 'react';
import { LANDMARKS } from '@/components/passport/stamps/landmarks';
import { paletteFor } from '@/components/passport/stamps/palettes';
import { flagEmoji } from '@/lib/passport';

// Renders one passport stamp as pure SVG: a country's landmark inside a
// collectible travel badge. Three frame families share the same country palette
// and the same landmark art from landmarks.jsx, so a stamp reads as a small
// illustrated card (sky gradient, sun, horizon, label plate, rim detail) rather
// than a single-colour ink outline.
//
// Countries without art yet still render inside a fully coloured frame with
// their flag, so the wall never looks broken.
const FONT = { fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" };

function labelFor(code, name) {
  const upper = String(name || code || '').toUpperCase();
  return upper.length > 14 ? String(code || '').toUpperCase() : upper;
}

function Art({ code, ink }) {
  if (!LANDMARKS[code]) return null;
  return (
    <g
      style={{ color: ink }}
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {LANDMARKS[code]}
    </g>
  );
}

function Flag({ code, ink, y = 58, size = 30 }) {
  return (
    <text x="50" y={y} textAnchor="middle" fontSize={size} style={{ ...FONT, fill: ink }}>
      {flagEmoji(code)}
    </text>
  );
}

// Small texture flecks: a few pale dots give the flat fills a printed feel
// without adding weight at stamp size.
function Flecks({ color }) {
  return (
    <g fill={color} opacity="0.22">
      <circle cx="20" cy="34" r="1.1" />
      <circle cx="28" cy="27" r="0.8" />
      <circle cx="82" cy="46" r="1" />
      <circle cx="74" cy="39" r="0.7" />
      <circle cx="38" cy="47" r="0.8" />
    </g>
  );
}

function CoinFrame({ code, label, caption, p, uid }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={p.top} />
          <stop offset="1" stopColor={p.bottom} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.62" cy="0.28" r="0.75">
          <stop offset="0" stopColor={p.sun} stopOpacity="0.45" />
          <stop offset="1" stopColor={p.sun} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-disc`}><circle cx="50" cy="50" r="43" /></clipPath>
      </defs>

      {/* collectible rim */}
      <circle cx="50" cy="50" r="49" fill={p.rim} />
      <circle cx="50" cy="50" r="49" fill="none" stroke={p.plate} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="1.6 2.6" />

      <g clipPath={`url(#${uid}-disc)`}>
        <circle cx="50" cy="50" r="43" fill={`url(#${uid}-sky)`} />
        <circle cx="50" cy="50" r="43" fill={`url(#${uid}-glow)`} />
        <circle cx="74" cy="28" r="8.5" fill={p.sun} opacity="0.92" />
        {/* horizon band */}
        <path d="M4 66q23 -7 46 0t46 0v30H4z" fill={p.ground} />
        <path d="M4 72q23 -6 46 0t46 0v24H4z" fill={p.ground} opacity="0.65" />
        <Flecks color={p.plate} />
      </g>

      {LANDMARKS[code] ? (
        <g transform="translate(25,9) scale(0.5)"><Art code={code} ink={p.ink} /></g>
      ) : <Flag code={code} ink={p.ink} y={50} />}

      {/* name plate sits on the colour band, under the illustration */}
      <rect x="12" y="63" width="76" height="13" rx="6.5" fill={p.plate} opacity="0.96" />
      <text x="50" y="72" textAnchor="middle" fontSize="8" fontWeight="800" letterSpacing="0.6" style={{ ...FONT, fill: p.ink }}>
        {label}
      </text>
      <text x="50" y="88" textAnchor="middle" fontSize="6" fontWeight="800" letterSpacing="1.1" style={{ ...FONT, fill: p.plate }}>
        {caption}
      </text>
    </>
  );
}

function PostmarkFrame({ code, label, caption, p, uid }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor={p.top} />
          <stop offset="1" stopColor={p.bottom} />
        </linearGradient>
        <clipPath id={`${uid}-card`}><rect x="3" y="3" width="94" height="94" rx="12" /></clipPath>
      </defs>

      <rect x="2" y="2" width="96" height="96" rx="13" fill={p.rim} />
      <g clipPath={`url(#${uid}-card)`}>
        <rect x="3" y="3" width="94" height="94" fill={`url(#${uid}-sky)`} />
        <circle cx="27" cy="26" r="9.5" fill={p.sun} opacity="0.9" />
        <path d="M3 70q23 -8 47 -8t47 8v25H3z" fill={p.ground} />
        <path d="M3 78q23 -6 47 -6t47 6v18H3z" fill={p.accent} opacity="0.55" />
        <Flecks color={p.plate} />
        {LANDMARKS[code] ? (
          <g transform="translate(24,8) scale(0.52)"><Art code={code} ink={p.ink} /></g>
        ) : <Flag code={code} ink={p.ink} y={58} />}
      </g>
      {/* perforated edge + inner keyline */}
      <rect x="3" y="3" width="94" height="94" rx="12" fill="none" stroke={p.plate} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="4 3" />
      <rect x="8" y="8" width="84" height="84" rx="9" fill="none" stroke={p.rim} strokeOpacity="0.22" strokeWidth="0.8" />

      <rect x="13" y="68" width="74" height="14" rx="7" fill={p.plate} />
      <text x="50" y="77.5" textAnchor="middle" fontSize="8.4" fontWeight="800" letterSpacing="0.6" style={{ ...FONT, fill: p.ink }}>
        {label}
      </text>
      <text x="50" y="90" textAnchor="middle" fontSize="5.4" fontWeight="800" letterSpacing="1.1" style={{ ...FONT, fill: p.plate, opacity: 0.92 }}>
        {caption}
      </text>
    </>
  );
}

function VisaFrame({ code, label, caption, p, uid }) {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-head`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.top} />
          <stop offset="1" stopColor={p.accent} />
        </linearGradient>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={p.bottom} stopOpacity="0.28" />
          <stop offset="1" stopColor={p.plate} stopOpacity="0.1" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="96" height="96" rx="17" fill={p.plate} />
      <rect x="2" y="2" width="96" height="96" rx="17" fill={`url(#${uid}-sky)`} />
      <rect x="2" y="2" width="96" height="96" rx="17" fill="none" stroke={p.rim} strokeWidth="1.4" strokeOpacity="0.65" />

      {/* colour header + label */}
      <path d="M2 19A17 17 0 0 1 19 2h62a17 17 0 0 1 17 17v14H2z" fill={`url(#${uid}-head)`} />
      <text x="50" y="21.5" textAnchor="middle" fontSize="8.2" fontWeight="800" letterSpacing="0.7" style={{ ...FONT, fill: p.plate }}>
        {label}
      </text>

      <circle cx="76" cy="46" r="7.5" fill={p.sun} opacity="0.85" />
      {LANDMARKS[code] ? (
        <g transform="translate(28,23) scale(0.44)"><Art code={code} ink={p.ink} /></g>
      ) : <Flag code={code} ink={p.ink} y={60} size={26} />}
      <Flecks color={p.rim} />

      {/* colour footer plate */}
      <path d="M2 68h96v13a17 17 0 0 1-17 17H19A17 17 0 0 1 2 81z" fill={p.ground} />
      <text x="50" y="84" textAnchor="middle" fontSize="6" fontWeight="800" letterSpacing="1.2" style={{ ...FONT, fill: p.plate }}>
        {caption}
      </text>
    </>
  );
}

const FRAMES = { ink: CoinFrame, postmark: PostmarkFrame, visa: VisaFrame };

export default function StampArt({ code, name, caption = '', style = 'ink', className = '' }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const upper = String(code || '').toUpperCase();
  const Frame = FRAMES[style] || CoinFrame;
  const palette = paletteFor(upper);
  return (
    <svg
      viewBox="0 0 100 100"
      className={`w-full h-auto block overflow-visible ${className}`}
      role="img"
      aria-label={[name || upper, caption].filter(Boolean).join(' · ')}
    >
      <Frame
        code={upper}
        label={labelFor(upper, name)}
        caption={String(caption || '').toUpperCase()}
        p={palette}
        uid={uid}
      />
    </svg>
  );
}