export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  // C = 2πr  →  r13≈81.7  r9≈56.5  r5.5≈34.6
  const kf = animated ? `
    @keyframes bn-rot1-${id} { from{transform:rotate(-120deg)} to{transform:rotate(240deg)} }
    @keyframes bn-rot2-${id} { from{transform:rotate(30deg)}   to{transform:rotate(390deg)} }
    @keyframes bn-rot3-${id} { from{transform:rotate(150deg)}  to{transform:rotate(-210deg)} }
    @keyframes bn-arc1-${id} {
      0%,100% { stroke-dasharray:8,74;  stroke-dashoffset:0;   }
      50%     { stroke-dasharray:65,17; stroke-dashoffset:-28; }
    }
    @keyframes bn-arc2-${id} {
      0%,100% { stroke-dasharray:6,51;  stroke-dashoffset:0;   }
      50%     { stroke-dasharray:44,13; stroke-dashoffset:-18; }
    }
    @keyframes bn-arc3-${id} {
      0%,100% { stroke-dasharray:4,31;  stroke-dashoffset:0;   }
      50%     { stroke-dasharray:27,8;  stroke-dashoffset:-11; }
    }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`${id}g1`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1A3A6B"/>
            <stop offset="100%" stopColor="#2563EB"/>
          </linearGradient>
          <linearGradient id={`${id}g2`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563EB"/>
            <stop offset="100%" stopColor="#38BDF8"/>
          </linearGradient>
          <linearGradient id={`${id}g3`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38BDF8"/>
            <stop offset="100%" stopColor="#7DD3FC"/>
          </linearGradient>
        </defs>

        {/* Outer arc */}
        <circle cx="16" cy="16" r="13"
          stroke={`url(#${id}g1)`} strokeWidth="2.4" strokeLinecap="round" fill="none"
          style={animated ? {
            transformOrigin: "16px 16px",
            animation: `bn-rot1-${id} 2.8s linear infinite, bn-arc1-${id} 1.4s ease-in-out infinite`,
          } : undefined}
          strokeDasharray={animated ? undefined : "68.1 13.6"}
          transform={animated ? undefined : "rotate(-120 16 16)"}
        />

        {/* Middle arc */}
        <circle cx="16" cy="16" r="9"
          stroke={`url(#${id}g2)`} strokeWidth="2" strokeLinecap="round" fill="none"
          style={animated ? {
            transformOrigin: "16px 16px",
            animation: `bn-rot2-${id} 2.1s linear infinite, bn-arc2-${id} 1.05s ease-in-out infinite`,
          } : undefined}
          strokeDasharray={animated ? undefined : "42.4 14.1"}
          transform={animated ? undefined : "rotate(30 16 16)"}
        />

        {/* Inner arc */}
        <circle cx="16" cy="16" r="5.5"
          stroke={`url(#${id}g3)`} strokeWidth="1.6" strokeLinecap="round" fill="none"
          style={animated ? {
            transformOrigin: "16px 16px",
            animation: `bn-rot3-${id} 1.6s linear infinite, bn-arc3-${id} 0.8s ease-in-out infinite`,
          } : undefined}
          strokeDasharray={animated ? undefined : "23.1 11.5"}
          transform={animated ? undefined : "rotate(150 16 16)"}
        />

        {/* Center dot */}
        <circle cx="16" cy="16" r="2" fill="#38BDF8" opacity="0.9"/>
      </svg>
    </>
  );
}
