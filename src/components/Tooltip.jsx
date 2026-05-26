import { useState, useRef, useEffect, useCallback } from "react";
import { GLOSSARY } from "../constants/glossary";
import { TABS } from "../constants/tabs";

export default function Tooltip({ term, children, text }) {
  const [visible, setVisible]   = useState(false);
  const [above, setAbove]       = useState(true);
  const [coords, setCoords]     = useState({});
  const triggerRef = useRef(null);
  const hideTimer  = useRef(null);

  const definition = text || GLOSSARY[term] || "";

  const show = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const TIP_H = 110;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    // Préférer au-dessus, sauf si vraiment pas assez de place ET plus d'espace en dessous
    setAbove(!(spaceAbove < TIP_H + 8 && spaceBelow > spaceAbove));
    setCoords({ top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 });
    setVisible(true);
  }, []);

  const scheduleHide = useCallback(() => {
    hideTimer.current = setTimeout(() => setVisible(false), 200);
  }, []);

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const hide = () => setVisible(false);
    document.addEventListener("scroll", hide, true);
    return () => document.removeEventListener("scroll", hide, true);
  }, [visible]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!definition) return children || <span>{term}</span>;

  const TIP_W = 240;
  const leftPos = Math.max(8, Math.min((coords.left || 0) - TIP_W / 2, window.innerWidth - TIP_W - 8));
  const tipStyle = {
    position: "fixed",
    zIndex: 99999,
    width: `${TIP_W}px`,
    background: "#0d1b2a",
    color: "rgba(255,255,255,0.88)",
    fontSize: "12px",
    fontWeight: "400",
    lineHeight: "1.6",
    letterSpacing: "normal",
    textTransform: "none",
    textAlign: "left",
    padding: "11px 14px",
    borderRadius: "12px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
    left: leftPos,
    ...(above
      ? { top: (coords.top || 0) - 6, transform: "translateY(-100%)" }
      : { top: (coords.bottom || 0) + 6 }),
  };

  const askAssistant = (e) => {
    e.stopPropagation();
    setVisible(false);
    const query = `Explique-moi ce qu'est "${term}" en termes simples et comment ça s'applique à mon portefeuille.`;
    window.dispatchEvent(new CustomEvent("openChatWithQuery", { detail: { query, tab: TABS.CHAT } }));
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        style={{ display: "inline-flex", alignItems: "center", gap: "2px", cursor: "default" }}
      >
        {children || <span style={{ borderBottom: "1px dashed currentColor", cursor: "help" }}>{term}</span>}
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "13px", height: "13px", borderRadius: "50%",
          background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)",
          fontSize: "8px", fontWeight: "800", color: "#6366F1",
          cursor: "help", flexShrink: 0, lineHeight: 1, userSelect: "none",
        }}>?</span>
      </span>

      {visible && (
        <div
          style={tipStyle}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        >
          <div style={{ marginBottom: "7px" }}>
            <span style={{ fontWeight: "700", color: "#818CF8" }}>{term} — </span>
            {definition}
          </div>
          <button onClick={askAssistant} style={{
            display: "flex", alignItems: "center", gap: "5px",
            background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
            borderRadius: "6px", padding: "4px 9px", cursor: "pointer",
            fontSize: "10px", fontWeight: "700", color: "#818CF8",
            fontFamily: "Inter, sans-serif",
          }}>
            <span>💬</span> En savoir plus avec l'assistant
          </button>
        </div>
      )}
    </>
  );
}
