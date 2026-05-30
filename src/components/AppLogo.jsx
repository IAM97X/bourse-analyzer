// Option C — 3 arcs concentriques, animation stroke-dashoffset
const ARCS = [
  { r: 5,  sw: 2.5, color: "#1E3A5F", delay: "0s",    dash: Math.PI * 5  },
  { r: 9,  sw: 2.5, color: "#2D6CB5", delay: "0.15s", dash: Math.PI * 9  },
  { r: 13, sw: 2.5, color: "#6AAEE8", delay: "0.3s",  dash: Math.PI * 13 },
];

export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;
  const cx = 16, cy = 21;

  const kf = animated ? ARCS.map((a, i) => `
    @keyframes bn-arc-${id}-${i} {
      0%   { stroke-dashoffset: ${a.dash.toFixed(2)}; opacity: 0.3; }
      60%  { stroke-dashoffset: 0; opacity: 1; }
      100% { stroke-dashoffset: 0; opacity: 1; }
    }
  `).join("") : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {ARCS.map((a, i) => (
          <path key={i}
            d={`M ${cx - a.r} ${cy} A ${a.r} ${a.r} 0 0 1 ${cx + a.r} ${cy}`}
            stroke={a.color}
            strokeWidth={a.sw}
            strokeLinecap="round"
            fill="none"
            style={animated ? {
              strokeDasharray: a.dash.toFixed(2),
              strokeDashoffset: 0,
              animation: `bn-arc-${id}-${i} 1.2s ease-out infinite ${a.delay}`,
            } : undefined}
          />
        ))}
      </svg>
    </>
  );
}
