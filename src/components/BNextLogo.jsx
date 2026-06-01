import { C } from "../constants/theme";

const WAVE_CSS = `
@keyframes bnext-wave {
  0%   { background-position: 0%   50% }
  50%  { background-position: 100% 50% }
  100% { background-position: 0%   50% }
}
@keyframes bnext-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.85; transform: scale(0.97); }
}
`;

/**
 * Logo BNext inline — utilisé dans l'app.
 *
 * Props :
 *   size      — taille de base en px (défaut 20)
 *   animated  — active l'animation du gradient (défaut false)
 *   pulse     — ajoute un pulse lent (pour états de chargement)
 *   color     — surcharge la couleur du "B" (défaut C.inkSoft)
 */
export default function BNextLogo({ size = 20, animated = false, pulse = false, color }) {
  const fs = size;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontFamily: "'DM Sans', sans-serif",
      fontSize: `${fs}px`,
      lineHeight: 1,
      animation: pulse ? "bnext-pulse 2s ease-in-out infinite" : undefined,
    }}>
      <style>{WAVE_CSS}</style>
      <span style={{ fontWeight: "300", color: color || C.inkSoft }}>B</span>
      <span style={{
        fontWeight: "800",
        letterSpacing: "-0.04em",
        backgroundImage: "linear-gradient(270deg, #0F2D5E 0%, #2D6CB5 40%, #7BBFE8 70%, #2D6CB5 85%, #0F2D5E 100%)",
        backgroundSize: "300% 300%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        animation: animated ? "bnext-wave 3s ease infinite" : undefined,
      }}>Next</span>
    </span>
  );
}

/**
 * Version chargement — "BNext…" avec wave + ellipsis pulsé
 */
export function BNextLoading({ size = 14 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontFamily: "'DM Sans', sans-serif", fontSize: `${size}px`, lineHeight: 1 }}>
      <style>{WAVE_CSS}</style>
      <span style={{ fontWeight: "300", color: C.inkSoft }}>B</span>
      <span style={{
        fontWeight: "800", letterSpacing: "-0.04em",
        backgroundImage: "linear-gradient(270deg,#0F2D5E,#2D6CB5,#7BBFE8,#2D6CB5,#0F2D5E)",
        backgroundSize: "300% 300%", WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent", backgroundClip: "text",
        animation: "bnext-wave 3s ease infinite",
      }}>Next</span>
      <span style={{ fontWeight: "300", color: C.inkSubtle, marginLeft: "1px" }}>…</span>
    </span>
  );
}
