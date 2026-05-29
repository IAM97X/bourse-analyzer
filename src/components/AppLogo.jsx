// 3 pièces debout, légèrement superposées — effet cylindrique 3D, couleurs BourseNext
// Ordre de rendu : gauche → droite → centre (centre au premier plan)
const RW = 4;    // demi-largeur de la pièce
const RH = 11;   // demi-hauteur de la pièce

// coinPath : forme "pilule" (rectangle + demi-cercles haut/bas)
const coinPath = (cx) =>
  `M ${cx - RW} ${16 - RH} A ${RW} ${RW} 0 0 1 ${cx + RW} ${16 - RH} ` +
  `L ${cx + RW} ${16 + RH} A ${RW} ${RW} 0 0 1 ${cx - RW} ${16 + RH} Z`;

// [cx, dark, mid, bright, face]  — gauche, droite, centre
const COINS = [
  { cx: 10, dark: "#040E1C", mid: "#0D2240", bright: "#1E4D8C", face: "#071828", delay: "0.3s"  },
  { cx: 22, dark: "#040E1C", mid: "#0D2240", bright: "#1E4D8C", face: "#071828", delay: "0.6s"  },
  { cx: 16, dark: "#0D2240", mid: "#1D4ED8", bright: "#60A5FA", face: "#2563EB", delay: "0s"    },
];

export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes coin-shine-${id} {
      0%, 100% { opacity: 0.85; transform: scaleX(1);    }
      50%       { opacity: 1;    transform: scaleX(1.04); }
    }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {COINS.map(({ cx, dark, mid, bright }, i) => (
            <linearGradient key={i} id={`${id}cg${i}`}
              gradientUnits="userSpaceOnUse" x1={cx - RW} y1="16" x2={cx + RW} y2="16">
              <stop offset="0%"   stopColor={dark}/>
              <stop offset="35%"  stopColor={mid}/>
              <stop offset="62%"  stopColor={bright}/>
              <stop offset="100%" stopColor={dark}/>
            </linearGradient>
          ))}
        </defs>

        {COINS.map(({ cx, bright, face, delay }, i) => (
          <g key={i} style={animated ? {
            transformOrigin: `${cx}px 16px`,
            animation: `coin-shine-${id} 1.8s ease-in-out infinite`,
            animationDelay: delay,
          } : undefined}>
            {/* Corps de la pièce — gradient cylindrique */}
            <path d={coinPath(cx)} fill={`url(#${id}cg${i})`}/>
            {/* Tranche gauche (face de la pièce visible) */}
            <ellipse cx={cx - RW} cy="16" rx="1.6" ry={RH} fill={face} opacity="0.75"/>
            {/* Calotte supérieure */}
            <ellipse cx={cx} cy={16 - RH} rx={RW} ry="1.4" fill={bright} opacity="0.45"/>
            {/* Reflet vertical sur le bord avant */}
            <rect x={cx + RW * 0.35} y={16 - RH + 2} width={RW * 0.35} height={RH * 2 - 4}
              rx="0.8" fill={bright} opacity="0.22"/>
          </g>
        ))}
      </svg>
    </>
  );
}
