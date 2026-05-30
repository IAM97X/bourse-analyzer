export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;
  const circ = 58;

  const kf = animated ? `
    @keyframes bn-dash-${id} {
      from { stroke-dashoffset: ${circ}; }
      to   { stroke-dashoffset: 0; }
    }
  ` : "";

  const dashStyle = (delay) => animated ? {
    strokeDasharray: "0.01 5",
    strokeLinecap: "round",
    strokeDashoffset: circ,
    animation: `bn-dash-${id} 2s linear infinite ${delay}s`,
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
              <stop offset="0%" stopColor="#1E3A5F"/>
              <stop offset="100%" stopColor="#2D5986"/>
            </linearGradient>
            <linearGradient id={`${id}e3`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2D5986"/>
              <stop offset="100%" stopColor="#4A7FB5"/>
            </linearGradient>
            <linearGradient id={`${id}e4`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5B9BD5"/>
              <stop offset="100%" stopColor="#8EC5F0"/>
            </linearGradient>
          </defs>
        )}

        <ellipse cx="13" cy="16" rx="6.8" ry="10.5"
          stroke={animated ? "#1E3A5F" : `url(#${id}e1)`}
          strokeWidth={animated ? "2.5" : "4"} fill="none"
          transform="rotate(-28 13 16)"
          style={dashStyle(-1.5)}/>

        <ellipse cx="15" cy="16" rx="6.8" ry="10.5"
          stroke={animated ? "#2D5986" : `url(#${id}e2)`}
          strokeWidth={animated ? "2.5" : "4"} fill="none"
          transform="rotate(-9 15 16)"
          style={dashStyle(-1.0)}/>

        <ellipse cx="17" cy="16" rx="6.8" ry="10.5"
          stroke={animated ? "#4A7FB5" : `url(#${id}e3)`}
          strokeWidth={animated ? "2.5" : "4"} fill="none"
          transform="rotate(9 17 16)"
          style={dashStyle(-0.5)}/>

        <ellipse cx="19" cy="16" rx="6.8" ry="10.5"
          stroke={animated ? "#8EC5F0" : `url(#${id}e4)`}
          strokeWidth={animated ? "2.5" : "4"} fill="none"
          transform="rotate(28 19 16)"
          style={dashStyle(0)}/>
      </svg>
    </>
  );
}
