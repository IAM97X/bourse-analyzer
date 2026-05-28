export default function AppLogo({ size = 28 }) {
  const id = `lg${size}`;
  return (
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

      {/* Fond arrondi */}
      <rect width="32" height="32" rx="8" fill={`url(#${id}bg)`}/>

      {/* 3 ellipses croisées — style Euronext */}
      {/* Ellipse gauche — foncée */}
      <ellipse cx="14" cy="16" rx="5.8" ry="9.5"
        stroke={`url(#${id}e1)`} strokeWidth="2"
        fill="none"
        transform="rotate(-28 14 16)"/>

      {/* Ellipse centrale — medium */}
      <ellipse cx="16" cy="16" rx="5.8" ry="9.5"
        stroke={`url(#${id}e2)`} strokeWidth="2"
        fill="none"/>

      {/* Ellipse droite — claire */}
      <ellipse cx="18" cy="16" rx="5.8" ry="9.5"
        stroke={`url(#${id}e3)`} strokeWidth="2"
        fill="none"
        transform="rotate(28 18 16)"/>
    </svg>
  );
}
