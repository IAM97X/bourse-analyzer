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
      42%     { transform: translateX(13px) translateY(2px); opacity: 1; }
      58%     { transform: translateX(13px) translateY(2px); opacity: 1; }
      94%     { transform: translateX(0px) translateY(0px); opacity: 1; }
      99%     { opacity: 0; }
    }
  ` : "";

  return (
    <>
      {animated && <style>{kf}</style>}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`${id}ng`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2D6CB5" />
            <stop offset="100%" stopColor="#5BAEE0" />
          </linearGradient>
        </defs>

        {/* B — noir */}
        <text
          x="1" y="23"
          fontFamily="system-ui, -apple-system, 'Helvetica Neue', sans-serif"
          fontWeight="800"
          fontSize="21"
          fill="#1C1C1E"
        >B</text>

        {/* N — bleu */}
        <text
          x="16" y="23"
          fontFamily="system-ui, -apple-system, 'Helvetica Neue', sans-serif"
          fontWeight="800"
          fontSize="21"
          fill={`url(#${id}ng)`}
        >N</text>

        {/* Atomes animés B → N */}
        {animated && atoms.map((a, i) => (
          <circle key={i}
            cx="9" cy="17" r="1.4"
            fill="#3D7CC4"
            style={{
              animation: `bn-atom-${id} 2.4s ease-in-out infinite ${a.delay}`,
            }}
          />
        ))}
      </svg>
    </>
  );
}
