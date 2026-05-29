// Sonic-style rings : cercles plats vus de 3/4, animation en cascade synchronisée
const RINGS = [
  { rx: 4.4,  ry: 2.75, color: "#1E4D8C", sw: 1.4, delay: "0s"    },
  { rx: 7.4,  ry: 4.60, color: "#2563EB", sw: 1.3, delay: "0.18s" },
  { rx: 10.8, ry: 6.70, color: "#60A5FA", sw: 1.2, delay: "0.36s" },
];

export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes sonic-${id} {
      0%,100% { transform: scaleY(0.12); opacity: 0.45; }
      48%,52% { transform: scaleY(1);    opacity: 1;    }
    }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {RINGS.map(({ rx, ry, color, sw, delay }, i) => (
          <ellipse key={i}
            cx="16" cy="16"
            rx={rx} ry={ry}
            stroke={color}
            strokeWidth={sw}
            fill="none"
            style={animated ? {
              transformOrigin: "16px 16px",
              animation: `sonic-${id} 1.6s ease-in-out infinite`,
              animationDelay: delay,
            } : undefined}
          />
        ))}
      </svg>
    </>
  );
}
