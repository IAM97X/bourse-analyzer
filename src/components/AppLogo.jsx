// Vertical standing rings — like Sonic hoops, BourseNext colors
// Each ring: back half (left, dark) + front half (right, lit) + specular highlight
const RINGS = [
  { r: 11,  sw: 3.0, back: "#0D1F3C", front: "#1D4ED8", hl: "#60A5FA", delay: "0s"    },
  { r: 7.5, sw: 2.5, back: "#132E56", front: "#2563EB", hl: "#93C5FD", delay: "0.28s" },
  { r: 4.5, sw: 2.0, back: "#1E3A6E", front: "#3B82F6", hl: "#BAE6FD", delay: "0.56s" },
];

export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes ring-spin-${id} {
      0%, 100% { transform: scaleX(1);    opacity: 1;   }
      48%, 52%  { transform: scaleX(0.06); opacity: 0.7; }
    }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {RINGS.map(({ r, sw, back, front, hl, delay }, i) => {
          const ty = 16 - r; // top of ring
          const by = 16 + r; // bottom of ring
          // Highlight: upper-right 60° arc  (from top → 60° clockwise)
          const hlEx = 16 + r * 0.866;
          const hlEy = 16 - r * 0.5;
          return (
            <g key={i}
              style={animated ? {
                transformOrigin: "16px 16px",
                animation: `ring-spin-${id} 1.8s ease-in-out infinite`,
                animationDelay: delay,
              } : undefined}>
              {/* Back (left) half — darker */}
              <path
                d={`M 16 ${ty} A ${r} ${r} 0 0 0 16 ${by}`}
                stroke={back} strokeWidth={sw} strokeLinecap="round" fill="none"/>
              {/* Front (right) half — lit */}
              <path
                d={`M 16 ${ty} A ${r} ${r} 0 0 1 16 ${by}`}
                stroke={front} strokeWidth={sw} strokeLinecap="round" fill="none"/>
              {/* Specular highlight — top-right 60° */}
              <path
                d={`M 16 ${ty} A ${r} ${r} 0 0 1 ${hlEx} ${hlEy}`}
                stroke={hl} strokeWidth={sw * 0.45} strokeLinecap="round" fill="none"
                opacity="0.9"/>
            </g>
          );
        })}
      </svg>
    </>
  );
}
