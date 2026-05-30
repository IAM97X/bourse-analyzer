export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;
  // Courbe ascendante — représente la performance de marché
  const d = "M 5 25 C 10 21, 17 11, 27 6";
  const len = 34; // longueur approx. du path

  const kf = animated ? `
    @keyframes bn-line-${id} {
      0%,5%   { stroke-dashoffset: ${len}; opacity: 0; }
      25%     { opacity: 1; }
      65%     { stroke-dashoffset: 0; opacity: 1; }
      78%     { stroke-dashoffset: 0; opacity: 0; }
      100%    { stroke-dashoffset: ${len}; opacity: 0; }
    }
    @keyframes bn-dot-${id} {
      0%,64%  { opacity: 0; transform: scale(0); }
      72%     { opacity: 1; transform: scale(1); }
      78%     { opacity: 0; transform: scale(0); }
      100%    { opacity: 0; }
    }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#1A3A5C" />
            <stop offset="100%" stopColor="#5BAEE0" />
          </linearGradient>
        </defs>

        {/* Courbe principale */}
        <path
          d={d}
          stroke={`url(#${id}g)`}
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
          style={animated ? {
            strokeDasharray: len,
            strokeDashoffset: len,
            animation: `bn-line-${id} 2.2s ease-in-out infinite`,
          } : undefined}
        />

        {/* Point terminal — apparaît quand la ligne est tracée */}
        <circle
          cx="27" cy="6" r="2.2"
          fill="#5BAEE0"
          style={animated ? {
            transformOrigin: "27px 6px",
            animation: `bn-dot-${id} 2.2s ease-in-out infinite`,
          } : undefined}
        />
      </svg>
    </>
  );
}
