export default function AppLogo({ size = 28, animated = false }) {
  const id = `lg${size}`;
  const ellipseStyle = animated
    ? (delay, dur, from, to) => ({
        transformOrigin: "16px 16px",
        animation: `orivo-orbit-${id} ${dur}s linear infinite`,
        animationDelay: `${delay}s`,
      })
    : null;

  return (
    <>
      {animated && (
        <style>{`
          @keyframes orivo-e1-${id} { from { transform: rotate(${-28}deg); } to { transform: rotate(${332}deg); } }
          @keyframes orivo-e2-${id} { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes orivo-e3-${id} { from { transform: rotate(${28}deg); } to { transform: rotate(${388}deg); } }
        `}</style>
      )}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#040E1C"/>
            <stop offset="100%" stopColor="#0D2540"/>
          </linearGradient>
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

        <rect width="32" height="32" rx="8" fill={`url(#${id}bg)`}/>

        <ellipse cx="14" cy="16" rx="5.8" ry="9.5"
          stroke={`url(#${id}e1)`} strokeWidth="2"
          fill="none"
          style={animated ? { transformOrigin: "16px 16px", animation: `orivo-e1-${id} 1.8s linear infinite` } : undefined}
          transform={animated ? undefined : "rotate(-28 14 16)"}/>

        <ellipse cx="16" cy="16" rx="5.8" ry="9.5"
          stroke={`url(#${id}e2)`} strokeWidth="2"
          fill="none"
          style={animated ? { transformOrigin: "16px 16px", animation: `orivo-e2-${id} 2.4s linear infinite` } : undefined}/>

        <ellipse cx="18" cy="16" rx="5.8" ry="9.5"
          stroke={`url(#${id}e3)`} strokeWidth="2"
          fill="none"
          style={animated ? { transformOrigin: "16px 16px", animation: `orivo-e3-${id} 3.2s linear infinite` } : undefined}
          transform={animated ? undefined : "rotate(28 18 16)"}/>
      </svg>
    </>
  );
}
