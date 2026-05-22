export default function MiniSparkline({ data, posId, width = 48, height = 14 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || max * 0.01 || 1;
  const pad = 1;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * w,
    pad + h - ((v - min) / range) * h,
  ]);

  const polyline = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const area =
    `M ${pts[0][0]},${height} ` +
    pts.map(([x, y]) => `L ${x},${y}`).join(" ") +
    ` L ${pts[pts.length - 1][0]},${height} Z`;

  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? "#059669" : "#DC2626";
  const gid = `spk-${posId || "x"}-${isUp ? "u" : "d"}`;

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
