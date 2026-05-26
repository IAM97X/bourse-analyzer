import { useState, useRef, useEffect } from "react";
import { GLOSSARY } from "../constants/glossary";
import { TABS } from "../constants/tabs";

export default function Tooltip({ term, children, text, position = "top" }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords]   = useState({});
  const triggerRef = useRef(null);

  const definition = text || GLOSSARY[term] || "";

  const show = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({ top: rect.top, left: rect.left + rect.width / 2, bottom: rect.bottom });
    setVisible(true);
  };

  useEffect(() => {
    if (!visible) return;
    const hide = () => setVisible(false);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("click", hide, true);
    return () => {
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("click", hide, true);
    };
  }, [visible]);

  if (!definition) return children || <span>{term}</span>;

  const TIP_W = 250;
  const leftPos = Math.max(8, Math.min((coords.left || 0) - TIP_W / 2, window.innerWidth - TIP_W - 8));
  const tipStyle = {
    position: "fixed",
    zIndex: 99999,
    width: `${TIP_W}px`,
    background: "#0d1b2a",
    color: "rgba(255,255,255,0.92)",
    fontSize: "11px",
    lineHeight: "1.5",
    padding: "10px 12px",
    borderRadius: "10px",
    boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
    left: leftPos,
    ...(position === "bottom"
      ? { top: (coords.bottom || 0) + 6 }
      : { top: coords.top || 0, transform: "translateY(-100%) translateY(-6px)" }),
  };

  const askAssistant = (e) => {
    e.stopPropagation();
    setVisible(false);
    const query = `Explique-moi ce qu'est ${term} en termes simples et comment ça s'applique à mon portefeuille.`;
    window.dispatchEvent(new CustomEvent("openChatWithQuery", { detail: { query, tab: TABS.CHAT } }));
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        style={{ display: "inline-flex", alignItems: "center", gap: "2px", cursor: "default" }}
      >
        {children || <span style={{ borderBottom: "1px dashed currentColor", cursor: "help" }}>{term}</span>}
        <span
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "13px", height: "13px", borderRadius: "50%",
            background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)",
            fontSize: "8px", fontWeight: "800", color: "#6366F1",
            cursor: "help", flexShrink: 0, lineHeight: 1, userSelect: "none",
          }}
        >?</span>
      </span>

      {visible && (
        <div style={tipStyle} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
          <div style={{ marginBottom: "6px" }}>
            <span style={{ fontWeight: "700", color: "#818CF8" }}>{term} — </span>
            {definition}
          </div>
          <button
            onClick={askAssistant}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
              borderRadius: "6px", padding: "4px 9px", cursor: "pointer",
              fontSize: "10px", fontWeight: "700", color: "#818CF8",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <span>💬</span> En savoir plus avec l'assistant
          </button>
        </div>
      )}
    </>
  );
}
