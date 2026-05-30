export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes bn-spread-${id} {
      0%   { transform: translateX(0px); }
      35%  { transform: translateX(var(--spread)); }
      65%  { transform: translateX(var(--spread)); }
      100% { transform: translateX(0px); }
    }
  ` : "";

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

        <ellipse cx="13" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#1E3A5F" : `url(#${id}e1)`}
          strokeWidth={animated ? "3" : "4.5"} fill="none"
          transform="rotate(-28 13 16)"
          style={animated ? { "--spread": "-4px", animation: `bn-spread-${id} 1.6s ease-in-out infinite 0s` } : undefined}/>

        <ellipse cx="15.3" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#2D5986" : `url(#${id}e2)`}
          strokeWidth={animated ? "3" : "4.5"} fill="none"
          transform="rotate(-9 15.3 16)"
          style={animated ? { "--spread": "-1.4px", animation: `bn-spread-${id} 1.6s ease-in-out infinite 0.08s` } : undefined}/>

        <ellipse cx="17.7" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#4A7FB5" : `url(#${id}e3)`}
          strokeWidth={animated ? "3" : "4.5"} fill="none"
          transform="rotate(9 17.7 16)"
          style={animated ? { "--spread": "1.4px", animation: `bn-spread-${id} 1.6s ease-in-out infinite 0.16s` } : undefined}/>

        <ellipse cx="20" cy="16" rx="7.2" ry="11"
          stroke={animated ? "#8EC5F0" : `url(#${id}e4)`}
          strokeWidth={animated ? "3" : "4.5"} fill="none"
          transform="rotate(28 20 16)"
          style={animated ? { "--spread": "4px", animation: `bn-spread-${id} 1.6s ease-in-out infinite 0.24s` } : undefined}/>
      </svg>
    </>
  );
}
