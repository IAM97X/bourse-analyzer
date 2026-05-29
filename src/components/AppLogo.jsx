// Ellipse circumference ≈ 2π√((rx²+ry²)/2) → rx=5.8 ry=9.5 → C≈49.4
export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes bn-rot1-${id} { from{transform:rotate(-28deg)}  to{transform:rotate(332deg)}  }
    @keyframes bn-rot2-${id} { from{transform:rotate(0deg)}    to{transform:rotate(360deg)}  }
    @keyframes bn-rot3-${id} { from{transform:rotate(28deg)}   to{transform:rotate(388deg)}  }
    @keyframes bn-arc1-${id} { 0%,100%{stroke-dasharray:5,45;stroke-dashoffset:0}  50%{stroke-dasharray:40,10;stroke-dashoffset:-22} }
    @keyframes bn-arc2-${id} { 0%,100%{stroke-dasharray:5,45;stroke-dashoffset:0}  50%{stroke-dasharray:40,10;stroke-dashoffset:-22} }
    @keyframes bn-arc3-${id} { 0%,100%{stroke-dasharray:5,45;stroke-dashoffset:0}  50%{stroke-dasharray:40,10;stroke-dashoffset:-22} }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`${id}e1`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1A4A8A"/>
            <stop offset="100%" stopColor="#2D6CB5"/>
          </linearGradient>
          <linearGradient id={`${id}e2`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2E72BE"/>
            <stop offset="100%" stopColor="#4B9DD8"/>
          </linearGradient>
          <linearGradient id={`${id}e3`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4BA8E0"/>
            <stop offset="100%" stopColor="#85CFEF"/>
          </linearGradient>
        </defs>

        <ellipse cx="14" cy="16" rx="5.8" ry="9.5"
          stroke={`url(#${id}e1)`} strokeWidth="2.2" fill="none"
          style={animated ? { transformOrigin:"16px 16px", animation:`bn-rot1-${id} 6s linear infinite, bn-arc1-${id} 3s ease-in-out infinite` } : undefined}
          transform={animated ? undefined : "rotate(-28 14 16)"}/>

        <ellipse cx="16" cy="16" rx="5.8" ry="9.5"
          stroke={`url(#${id}e2)`} strokeWidth="2.2" fill="none"
          style={animated ? { transformOrigin:"16px 16px", animation:`bn-rot2-${id} 8s linear infinite, bn-arc2-${id} 4s ease-in-out infinite` } : undefined}/>

        <ellipse cx="18" cy="16" rx="5.8" ry="9.5"
          stroke={`url(#${id}e3)`} strokeWidth="2.2" fill="none"
          style={animated ? { transformOrigin:"16px 16px", animation:`bn-rot3-${id} 10s linear infinite, bn-arc3-${id} 5s ease-in-out infinite` } : undefined}
          transform={animated ? undefined : "rotate(28 18 16)"}/>
      </svg>
    </>
  );
}
