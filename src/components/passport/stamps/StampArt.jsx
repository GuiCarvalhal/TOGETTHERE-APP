import React from 'react';
import { LANDMARKS } from '@/components/passport/stamps/landmarks';
import { flagEmoji } from '@/lib/passport';

// Renders one passport stamp as pure SVG: a country landmark inside one of three
// frame designs. Colour comes from currentColor, so the caller decides the ink
// (terracotta for stamped, muted for a wish). Countries without art yet still
// render inside the same frame with their flag, so the wall never looks broken.
const FONT = { fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" };

function labelFor(code, name) {
  const upper = String(name || code || '').toUpperCase();
  return upper.length > 14 ? String(code || '').toUpperCase() : upper;
}

function Art({ code }) {
  if (!LANDMARKS[code]) return null;
  return (
    <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      {LANDMARKS[code]}
    </g>
  );
}

function Flag({ code }) {
  return (
    <text x="50" y="64" textAnchor="middle" fontSize="32" fill="currentColor" style={FONT}>
      {flagEmoji(code)}
    </text>
  );
}

function InkFrame({ code, label, caption }) {
  return (
    <>
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="50" cy="50" r="41.5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.75" />
      <path d="M14 74h72" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
      <text x="50" y="20" textAnchor="middle" fontSize="9" fontWeight="800" letterSpacing="1" fill="currentColor" style={FONT}>
        {label}
      </text>
      {LANDMARKS[code] ? (
        <g transform="translate(25,24) scale(0.5)"><Art code={code} /></g>
      ) : <Flag code={code} />}
      <text x="50" y="88" textAnchor="middle" fontSize="7" fontWeight="700" letterSpacing="1.2" fill="currentColor" style={FONT}>
        {caption}
      </text>
    </>
  );
}

function PostmarkFrame({ code, label, caption }) {
  return (
    <>
      <rect x="3" y="6" width="94" height="88" rx="9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="5 3" />
      {LANDMARKS[code] ? (
        <g transform="translate(25,15) scale(0.5)"><Art code={code} /></g>
      ) : <Flag code={code} />}
      <text x="50" y="74" textAnchor="middle" fontSize="8.5" fontWeight="800" letterSpacing="0.8" fill="currentColor" style={FONT}>
        {label}
      </text>
      <path d="M10 90q6-4 12 0t12 0 12 0 12 0 12 0" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
      <text x="50" y="82" textAnchor="middle" fontSize="6" fontWeight="700" letterSpacing="1" fill="currentColor" opacity="0.85" style={FONT}>
        {caption}
      </text>
    </>
  );
}

function VisaFrame({ code, label, caption }) {
  return (
    <>
      <rect x="3" y="3" width="94" height="94" rx="17" fill="currentColor" opacity="0.09" />
      <rect x="3" y="3" width="94" height="94" rx="17" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.85" />
      {LANDMARKS[code] ? (
        <g transform="translate(25,9) scale(0.5)"><Art code={code} /></g>
      ) : <Flag code={code} />}
      <path d="M3 66h94v14a17 17 0 0 1-17 17H20A17 17 0 0 1 3 80z" fill="currentColor" />
      <text x="50" y="79" textAnchor="middle" fontSize="8" fontWeight="800" letterSpacing="0.9" style={{ ...FONT, fill: 'hsl(var(--card))' }}>
        {label}
      </text>
      <text x="50" y="89" textAnchor="middle" fontSize="5.6" fontWeight="700" letterSpacing="1" opacity="0.8" style={{ ...FONT, fill: 'hsl(var(--card))' }}>
        {caption}
      </text>
    </>
  );
}

const FRAMES = { ink: InkFrame, postmark: PostmarkFrame, visa: VisaFrame };

export default function StampArt({ code, name, caption = '', style = 'ink', className = '' }) {
  const upper = String(code || '').toUpperCase();
  const Frame = FRAMES[style] || InkFrame;
  return (
    <svg
      viewBox="0 0 100 100"
      className={`w-full h-auto block overflow-visible ${className}`}
      role="img"
      aria-label={[name || upper, caption].filter(Boolean).join(' · ')}
    >
      <Frame code={upper} label={labelFor(upper, name)} caption={String(caption || '').toUpperCase()} />
    </svg>
  );
}