export default function AppLogo({ size = 28, animated = false }) {
  const id = `bn${size}`;

  // 3 atomes décalés qui font l'aller-retour B → N
  const atoms = [
    { delay: "0s" },
    { delay: "0.65s" },
    { delay: "1.3s" },
  ];

  const kf = animated ? `
    @keyframes bn-atom-${id} {
      0%,100% { transform: translateX(0px) translateY(0px); opacity: 0; }
      6%      { opacity: 1; }
      42%     { transform: translateX(14px) translateY(2px); opacity: 1; }
      58%     { transform: translateX(14px) translateY(2px); opacity: 1; }
      94%     { transform: translateX(0px) translateY(0px); opacity: 1; }
      99%     { opacity: 0; }
    }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Gradient identique au "Next" de la topbar */}
          <linearGradient id={`${id}ng`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#1A4A8A" />
            <stop offset="35%"  stopColor="#4B9DD8" />
            <stop offset="65%"  stopColor="#85CFEF" />
            <stop offset="100%" stopColor="#2D6CB5" />
          </linearGradient>
        </defs>

        {/* B — Inter 300, noir comme "Bourse" */}
        <text
          x="1" y="23"
          fontFamily="Inter, sans-serif"
          fontWeight="300"
          fontSize="21"
          fill="#1C1C1E"
        >B</text>

        {/* N — Inter 900, gradient comme "Next" */}
        <text
          x="13" y="23"
          fontFamily="Inter, sans-serif"
          fontWeight="900"
          fontSize="21"
          letterSpacing="-1"
          fill={`url(#${id}ng)`}
        >N</text>

        {/* Atomes animés B → N */}
        {animated && atoms.map((a, i) => (
          <circle key={i}
            cx="8" cy="17" r="1.4"
            fill="#4B9DD8"
            style={{
              animation: `bn-atom-${id} 2.4s ease-in-out infinite ${a.delay}`,
            }}
          />
        ))}
      </svg>
    </>
  );
}
