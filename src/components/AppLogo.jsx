// cx symétriques autour de 16 : (10.5+21.5)/2 = 16, (13.8+18.2)/2 = 16
// Chaque anneau tourne autour de son propre centre → effet éventail orbital
const RINGS = [
  { cx: 10.5, rot: -22, spread: -4,   delay: "0s",    strokeAnim: "#1E3A5F", gId: "e1", g0: "#0F1C2E", g1: "#1E3A5F" },
  { cx: 13.8, rot:  -7, spread: -1.4, delay: "0.08s", strokeAnim: "#2D5986", gId: "e2", g0: "#1E3A5F", g1: "#2D5986" },
  { cx: 18.2, rot:   7, spread:  1.4, delay: "0.16s", strokeAnim: "#4A7FB5", gId: "e3", g0: "#2D5986", g1: "#4A7FB5" },
  { cx: 21.5, rot:  22, spread:  4,   delay: "0.24s", strokeAnim: "#8EC5F0", gId: "e4", g0: "#5B9BD5", g1: "#8EC5F0" },
];

export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? RINGS.map((r, i) => `
    @keyframes bn-ring-${id}-${i} {
      0%,100% { transform: translateX(0px); }
      35%,65% { transform: translateX(${r.spread}px); }
    }
  `).join("") : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {!animated && (
          <defs>
            {RINGS.map((r) => (
              <linearGradient key={r.gId} id={`${id}${r.gId}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={r.g0} />
                <stop offset="100%" stopColor={r.g1} />
              </linearGradient>
            ))}
          </defs>
        )}
        {RINGS.map((r, i) => (
          <ellipse key={i}
            cx={r.cx} cy="16" rx="7" ry="11"
            stroke={animated ? r.strokeAnim : `url(#${id}${r.gId})`}
            strokeWidth={animated ? "3" : "4.5"}
            fill="none"
            transform={`rotate(${r.rot} ${r.cx} 16)`}
            style={animated ? {
              animation: `bn-ring-${id}-${i} 1.6s ease-in-out infinite ${r.delay}`,
            } : undefined}
          />
        ))}
      </svg>
    </>
  );
}
