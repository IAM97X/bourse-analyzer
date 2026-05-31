import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY } from "../constants/glossary";

export default function Tooltip({ term, children, text, iconOnly }) {
  const [visible, setVisible]   = useState(false);
  const [above, setAbove]       = useState(true);
  const [coords, setCoords]     = useState({});
  const triggerRef = useRef(null);
  const hideTimer  = useRef(null);

  const definition = text || GLOSSARY[term] || "";

  const show = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (!triggerRef.current) return;
    // Use viewport-relative rect — walk up the DOM to undo any CSS transforms
    const rect = triggerRef.current.getBoundingClientRect();
    const TIP_H = 130;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
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

  const TIP_W = 300;
  const leftPos = Math.max(8, Math.min((coords.left || 0) - TIP_W / 2, window.innerWidth - TIP_W - 8));
  const viewH = window.innerHeight;
  const spaceBelow = viewH - (coords.bottom || 0) - 6;
  const tipStyle = {
    position: "fixed",
    zIndex: 99999,
    width: `${TIP_W}px`,
    maxHeight: `${Math.min(320, spaceBelow > 80 ? spaceBelow - 12 : (coords.top || 200) - 12)}px`,
    overflowY: "auto",
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
    window.dispatchEvent(new CustomEvent("openAssistantWithQuery", { detail: { query } }));
  };

  const tooltip = visible ? (
    <div
      style={tipStyle}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <div>
        <span style={{ fontWeight: "700", color: "#818CF8" }}>{term} — </span>
        {definition}
      </div>
    </div>
  ) : null;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        style={{ display: "inline-flex", alignItems: "center", gap: "2px", cursor: "default" }}
      >
        {!iconOnly && (children || <span style={{ borderBottom: "1px dashed currentColor", cursor: "help" }}>{term}</span>)}
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "13px", height: "13px", borderRadius: "50%",
          background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)",
          fontSize: "8px", fontWeight: "800", color: "#6366F1",
          cursor: "help", flexShrink: 0, lineHeight: 1, userSelect: "none",
        }}>?</span>
      </span>

      {createPortal(tooltip, document.body)}
    </>
  );
}
