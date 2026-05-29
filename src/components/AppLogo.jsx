export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  const kf = animated ? `
    @keyframes bn-col-${id} {
      0%   { stroke: #1A4A8A; }
      33%  { stroke: #4B9DD8; }
      66%  { stroke: #85CFEF; }
      100% { stroke: #1A4A8A; }
    }
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

        <ellipse cx="14" cy="16" rx="6.8" ry="10.5"
          stroke={animated ? undefined : `url(#${id}e1)`} strokeWidth="3.2" fill="none"
          transform="rotate(-28 14 16)"
          style={animated ? { animation:`bn-col-${id} 3s ease-in-out infinite`, animationDelay:"0s" } : undefined}/>

        <ellipse cx="16" cy="16" rx="6.8" ry="10.5"
          stroke={animated ? undefined : `url(#${id}e2)`} strokeWidth="3.2" fill="none"
          style={animated ? { animation:`bn-col-${id} 3s ease-in-out infinite`, animationDelay:"-1s" } : undefined}/>

        <ellipse cx="18" cy="16" rx="6.8" ry="10.5"
          stroke={animated ? undefined : `url(#${id}e3)`} strokeWidth="3.2" fill="none"
          transform="rotate(28 18 16)"
          style={animated ? { animation:`bn-col-${id} 3s ease-in-out infinite`, animationDelay:"-2s" } : undefined}/>
      </svg>
    </>
  );
}
