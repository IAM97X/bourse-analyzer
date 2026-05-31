const CELL = 2.5;
const GAP  = 0.35;
const STEP = CELL + GAP;

const B_MAP = [
  [1,1,1,0,0],
  [1,0,0,1,0],
  [1,0,0,1,0],
  [1,1,1,0,0],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,1,1,1,0],
];

const N_MAP = [
  [1,0,0,0,1],
  [1,1,0,0,1],
  [1,0,1,0,1],
  [1,0,1,0,1],
  [1,0,0,1,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
];

export default function AppLogo({ size = 28, animated = false }) {
  const COLS = 5, ROWS = 7;
  const LETTER_GAP = STEP * 0.7;
  const letW = COLS * STEP - GAP;
  const letH = ROWS * STEP - GAP;
  const totalW = letW * 2 + LETTER_GAP;

  const xB = (32 - totalW) / 2;
  const xN = xB + letW + LETTER_GAP;
  const yS = (32 - letH) / 2;

  const bRects = [], nRects = [];
  B_MAP.forEach((row, r) => row.forEach((on, c) => {
    if (on) bRects.push({ x: xB + c * STEP, y: yS + r * STEP });
  }));
  N_MAP.forEach((row, r) => row.forEach((on, c) => {
    if (on) nRects.push({ x: xN + c * STEP, y: yS + r * STEP });
  }));

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {bRects.map((d, i) => (
        <rect key={`b${i}`} x={d.x.toFixed(2)} y={d.y.toFixed(2)} width={CELL} height={CELL} rx="0.4" fill="#1A2840" />
      ))}
      {nRects.map((d, i) => (
        <rect key={`n${i}`} x={d.x.toFixed(2)} y={d.y.toFixed(2)} width={CELL} height={CELL} rx="0.4" fill="#2D6CB5" />
      ))}
    </svg>
  );
}
