// 3D torus rings, Sonic-style, BourseNext colors
// Each ring: back half (shadow) + front half (lit) + top highlight
const RINGS = [
  { rx: 11,  ry: 4.2,  sw: 4.8, back: "#071828", front: "#1D4ED8", hl: "#60A5FA", delay: "0s"   },
  { rx: 7.5, ry: 2.85, sw: 4.2, back: "#0D2240", front: "#2563EB", hl: "#93C5FD", delay: "0.2s" },
  { rx: 4,   ry: 1.52, sw: 3.6, back: "#132E56", front: "#3B82F6", hl: "#BAE6FD", delay: "0.4s" },
];

export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes sonic3d-${id} {
      0%,100% { transform: scaleY(0.08); opacity:0.5; }
      45%,55% { transform: scaleY(1);    opacity:1;   }
    }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {RINGS.map(({ rx, ry, sw, back, front, hl, delay }, i) => {
          const lx = 16 - rx, rx_ = 16 + rx;
          // highlight arc: upper 60° of front half
          const hlx1 = 16 - rx * 0.5,  hlx2 = 16 + rx * 0.5;
          const hly  = 16 - ry * 0.87;
          return (
            <g key={i}
              vectorEffect="non-scaling-stroke"
              style={animated ? {
                transformOrigin: "16px 16px",
                animation: `sonic3d-${id} 1.8s ease-in-out infinite`,
                animationDelay: delay,
              } : undefined}>
              {/* Shadow side (bottom arc) */}
              <path
                d={`M ${rx_} 16 A ${rx} ${ry} 0 0 1 ${lx} 16`}
                stroke={back} strokeWidth={sw} strokeLinecap="round" fill="none"
                vectorEffect="non-scaling-stroke"/>
              {/* Lit side (top arc) */}
              <path
                d={`M ${lx} 16 A ${rx} ${ry} 0 0 1 ${rx_} 16`}
                stroke={front} strokeWidth={sw} strokeLinecap="round" fill="none"
                vectorEffect="non-scaling-stroke"/>
              {/* Specular highlight */}
              <path
                d={`M ${hlx1} ${hly} A ${rx} ${ry} 0 0 1 ${hlx2} ${hly}`}
                stroke={hl} strokeWidth={sw * 0.38} strokeLinecap="round" fill="none"
                opacity="0.85" vectorEffect="non-scaling-stroke"/>
            </g>
          );
        })}
      </svg>
    </>
  );
}
