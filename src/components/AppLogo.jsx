export default function AppLogo({ size = 28 }) {
  const id = `lg${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0C1829"/>
          <stop offset="100%" stopColor="#1A3558"/>
        </linearGradient>
        <linearGradient id={`${id}line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4A9EDB"/>
          <stop offset="100%" stopColor="#90D4F5"/>
        </linearGradient>
        <linearGradient id={`${id}area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5BB8F5" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#5BB8F5" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}bg)`}/>
      <path d="M5 22 L10 17 L14 19.5 L20 11 L27 8.5 L27 25 L5 25 Z" fill={`url(#${id}area)`}/>
      <polyline points="5,22 10,17 14,19.5 20,11 27,8.5"
        stroke={`url(#${id}line)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="27" cy="8.5" r="2.2" fill="#90D4F5"/>
      <circle cx="27" cy="8.5" r="1" fill="white"/>
      <line x1="5" y1="25" x2="27" y2="25" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8"/>
    </svg>
  );
}
