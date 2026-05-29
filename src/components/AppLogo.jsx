export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes bn-seq-${id} {
      0%,  15% { stroke: #85CFEF; }
      30%, 100% { stroke: #1A4A8A; }
    }
  ` : "";

  const seqStyle = (delay) => animated ? {
    stroke: "#1A4A8A",
    animation: `bn-seq-${id} 2.1s ease-in-out infinite`,
    animationDelay: `${delay}s`,
  } : undefined;

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {!animated && (
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
        )}

        <ellipse cx="14" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#1A4A8A" : `url(#${id}e1)`}
          strokeWidth="4.5" fill="none"
          transform="rotate(-28 14 16)"
          style={seqStyle(0)}/>

        <ellipse cx="16" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#1A4A8A" : `url(#${id}e2)`}
          strokeWidth="4.5" fill="none"
          style={seqStyle(0.7)}/>

        <ellipse cx="18" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#1A4A8A" : `url(#${id}e3)`}
          strokeWidth="4.5" fill="none"
          transform="rotate(28 18 16)"
          style={seqStyle(1.4)}/>
      </svg>
    </>
  );
}
