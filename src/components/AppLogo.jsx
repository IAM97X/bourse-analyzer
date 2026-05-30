export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes bn-logo-wave-${id} {
      0%, 100% { stroke: #1E3A5F; }
      50%      { stroke: #7AB3E0; }
    }
  ` : "";

  const waveStyle = animated ? {
    stroke: "#1E3A5F",
    animation: `bn-logo-wave-${id} 1.8s ease-in-out infinite`,
  } : undefined;

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {!animated && (
          <defs>
            <linearGradient id={`${id}e1`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0F1C2E"/>
              <stop offset="100%" stopColor="#1E3A5F"/>
            </linearGradient>
            <linearGradient id={`${id}e2`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2D5986"/>
              <stop offset="100%" stopColor="#4A7FB5"/>
            </linearGradient>
            <linearGradient id={`${id}e3`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5B9BD5"/>
              <stop offset="100%" stopColor="#8EC5F0"/>
            </linearGradient>
          </defs>
        )}

        <ellipse cx="14" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#1A4A8A" : `url(#${id}e1)`}
          strokeWidth="4.5" fill="none"
          transform="rotate(-28 14 16)"
          style={waveStyle}/>

        <ellipse cx="16" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#1A4A8A" : `url(#${id}e2)`}
          strokeWidth="4.5" fill="none"
          style={waveStyle}/>

        <ellipse cx="18" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#1A4A8A" : `url(#${id}e3)`}
          strokeWidth="4.5" fill="none"
          transform="rotate(28 18 16)"
          style={waveStyle}/>
      </svg>
    </>
  );
}
