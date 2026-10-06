import React from 'react';

// Original, license-free SVG phone-screen illustrations for the
// "Add to Home screen" help page. Each variant renders a simplified phone
// frame with the relevant UI element highlighted in terracotta. No external
// images are used. Colors are concrete (theme-independent) so the figures
// read clearly on both the light and dark canvas.

const FRAME = '#1C2530';
const SCREEN = '#F8F6F1';
const SURFACE = '#FFFFFF';
const BORDER = '#E5E7EB';
const MUTED = '#94A3B8';
const INK = '#3B4452';
const TERRA = '#E05C48';

function PhoneFrame({ children }) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 200 360" className="w-full h-auto block" role="img" aria-hidden="true">
      <defs>
        <clipPath id={`clip-${id}`}>
          <rect x="16" y="12" width="168" height="336" rx="30" />
        </clipPath>
      </defs>
      <rect x="10" y="6" width="180" height="348" rx="36" fill={FRAME} />
      <rect x="16" y="12" width="168" height="336" rx="30" fill={SCREEN} />
      <rect x="84" y="18" width="32" height="6" rx="3" fill={FRAME} opacity="0.22" />
      <g clipPath={`url(#clip-${id})`}>{children}</g>
    </svg>
  );
}

function Dots({ x, y, color = INK }) {
  return (
    <>
      <circle cx={x} cy={y - 5} r="1.7" fill={color} />
      <circle cx={x} cy={y} r="1.7" fill={color} />
      <circle cx={x} cy={y + 5} r="1.7" fill={color} />
    </>
  );
}

function AndroidBrowser({ highlightMenu }) {
  return (
    <PhoneFrame>
      <rect x="28" y="46" width="144" height="28" rx="14" fill={SURFACE} stroke={BORDER} />
      <circle cx="44" cy="60" r="3.5" fill={MUTED} />
      <rect x="52" y="56" width="84" height="8" rx="4" fill={MUTED} opacity="0.45" />
      {highlightMenu && <circle cx="160" cy="60" r="13" fill="none" stroke={TERRA} strokeWidth="2.5" />}
      <Dots x={160} y={60} />
      <rect x="28" y="90" width="144" height="12" rx="6" fill={TERRA} opacity="0.85" />
      <rect x="28" y="112" width="120" height="6" rx="3" fill={MUTED} opacity="0.4" />
      <rect x="28" y="126" width="100" height="6" rx="3" fill={MUTED} opacity="0.3" />
      <rect x="28" y="150" width="68" height="68" rx="12" fill={SURFACE} stroke={BORDER} />
      <rect x="104" y="150" width="68" height="68" rx="12" fill={SURFACE} stroke={BORDER} />
      <rect x="40" y="166" width="44" height="6" rx="3" fill={MUTED} opacity="0.4" />
      <rect x="116" y="166" width="44" height="6" rx="3" fill={MUTED} opacity="0.4" />
    </PhoneFrame>
  );
}

function AndroidMenu() {
  return (
    <PhoneFrame>
      <rect x="28" y="46" width="144" height="28" rx="14" fill={SURFACE} stroke={BORDER} />
      <rect x="52" y="56" width="84" height="8" rx="4" fill={MUTED} opacity="0.45" />
      <Dots x={160} y={60} />
      <rect x="44" y="86" width="120" height="132" rx="14" fill={SURFACE} stroke={BORDER} />
      <rect x="54" y="96" width="100" height="8" rx="4" fill={MUTED} opacity="0.4" />
      <rect x="54" y="112" width="76" height="8" rx="4" fill={MUTED} opacity="0.3" />
      <rect x="50" y="126" width="108" height="26" rx="9" fill={TERRA} opacity="0.14" />
      <rect x="60" y="133" width="12" height="12" rx="3" fill={TERRA} />
      <rect x="78" y="136" width="74" height="7" rx="3.5" fill={TERRA} />
      <rect x="54" y="164" width="90" height="8" rx="4" fill={MUTED} opacity="0.3" />
      <rect x="54" y="180" width="70" height="8" rx="4" fill={MUTED} opacity="0.3" />
      <rect x="54" y="196" width="82" height="8" rx="4" fill={MUTED} opacity="0.3" />
    </PhoneFrame>
  );
}

function IphoneSafari({ highlightShare }) {
  return (
    <PhoneFrame>
      <rect x="28" y="44" width="144" height="26" rx="13" fill={SURFACE} stroke={BORDER} />
      <rect x="54" y="53" width="92" height="8" rx="4" fill={MUTED} opacity="0.45" />
      <rect x="28" y="84" width="144" height="12" rx="6" fill={TERRA} opacity="0.85" />
      <rect x="28" y="106" width="120" height="6" rx="3" fill={MUTED} opacity="0.4" />
      <rect x="28" y="120" width="100" height="6" rx="3" fill={MUTED} opacity="0.3" />
      <rect x="28" y="144" width="144" height="80" rx="12" fill={SURFACE} stroke={BORDER} />
      <rect x="40" y="160" width="120" height="6" rx="3" fill={MUTED} opacity="0.35" />
      <rect x="40" y="174" width="100" height="6" rx="3" fill={MUTED} opacity="0.25" />
      <rect x="24" y="302" width="152" height="36" rx="4" fill="#F0EDE7" />
      <line x1="24" y1="302" x2="176" y2="302" stroke={BORDER} strokeWidth="1" />
      {highlightShare && <circle cx="100" cy="320" r="15" fill="none" stroke={TERRA} strokeWidth="2.5" />}
      <rect x="94" y="312" width="12" height="12" rx="2" fill="none" stroke={INK} strokeWidth="1.8" />
      <path d="M100 308 L100 318 M96 312 L100 308 L104 312" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </PhoneFrame>
  );
}

function IphoneShareSheet() {
  return (
    <PhoneFrame>
      <rect x="16" y="12" width="168" height="336" fill={FRAME} opacity="0.18" />
      <rect x="22" y="192" width="156" height="150" rx="18" fill={SURFACE} />
      <rect x="88" y="202" width="24" height="4" rx="2" fill="#D1D5DB" />
      <rect x="40" y="216" width="70" height="7" rx="3.5" fill={MUTED} opacity="0.5" />
      <circle cx="46" cy="246" r="13" fill="#EEF0F4" />
      <circle cx="78" cy="246" r="13" fill="#EEF0F4" />
      <circle cx="110" cy="246" r="13" fill="#EEF0F4" />
      <circle cx="142" cy="246" r="13" fill="#EEF0F4" />
      <rect x="38" y="264" width="16" height="4" rx="2" fill={MUTED} opacity="0.4" />
      <rect x="70" y="264" width="16" height="4" rx="2" fill={MUTED} opacity="0.4" />
      <rect x="102" y="264" width="16" height="4" rx="2" fill={MUTED} opacity="0.4" />
      <rect x="134" y="264" width="16" height="4" rx="2" fill={MUTED} opacity="0.4" />
      <rect x="38" y="280" width="124" height="1" fill={BORDER} />
      <rect x="40" y="292" width="86" height="7" rx="3.5" fill={MUTED} opacity="0.4" />
      <rect x="30" y="306" width="140" height="26" rx="9" fill={TERRA} opacity="0.14" />
      <rect x="42" y="313" width="12" height="12" rx="3" fill={TERRA} />
      <rect x="60" y="316" width="100" height="7" rx="3.5" fill={TERRA} />
    </PhoneFrame>
  );
}

const COLS = 4;
const SX = 30, SY = 70, GAP = 38, SZ = 30;
const GRID = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [0, 1], [2, 1], [3, 1],
  [0, 2], [1, 2], [2, 2], [3, 2],
];

function HomeScreen() {
  const cx = SX + 1 * GAP + SZ / 2;
  const cy = SY + 1 * GAP + SZ / 2;
  return (
    <PhoneFrame>
      <rect x="16" y="12" width="168" height="336" fill="#F0EDE7" />
      {GRID.map(([c, r]) => (
        <g key={`${c}-${r}`}>
          <rect x={SX + c * GAP} y={SY + r * GAP} width={SZ} height={SZ} rx="8" fill={SURFACE} stroke={BORDER} />
          <rect x={SX + c * GAP + 6} y={SY + r * GAP + SZ + 4} width={SZ - 12} height="4" rx="2" fill={MUTED} opacity="0.4" />
        </g>
      ))}
      <circle cx={cx} cy={cy} r="20" fill="none" stroke={TERRA} strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r="14" fill={TERRA} />
      <rect x={cx - 1} y={cy - 7} width="2" height="14" rx="1" fill={SURFACE} />
      <rect x={cx - 6} y={cy - 7} width="12" height="2" rx="1" fill={SURFACE} />
      <rect x={SX + 1 * GAP + 4} y={SY + 1 * GAP + SZ + 4} width={SZ - 8} height="5" rx="2.5" fill={TERRA} />
    </PhoneFrame>
  );
}

const VARIANTS = {
  'android-browser': () => <AndroidBrowser highlightMenu={false} />,
  'android-menu-button': () => <AndroidBrowser highlightMenu={true} />,
  'android-menu': () => <AndroidMenu />,
  'iphone-safari': () => <IphoneSafari highlightShare={false} />,
  'iphone-share-button': () => <IphoneSafari highlightShare={true} />,
  'iphone-share-sheet': () => <IphoneShareSheet />,
  'home-screen': () => <HomeScreen />,
};

export function InstallIllustration({ variant }) {
  const Comp = VARIANTS[variant] || VARIANTS['home-screen'];
  return <Comp />;
}

export default InstallIllustration;