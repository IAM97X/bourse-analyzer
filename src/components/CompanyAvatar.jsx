import { useState, useRef } from "react";
import { avatarColor, buildLogoSources } from "../constants/logos";

export default function CompanyAvatar({ nom, isin, size = 36 }) {
  const [tier, setTier] = useState(0);

  const keyRef = useRef(`${nom}:${isin}`);
  const key = `${nom}:${isin}`;
  if (keyRef.current !== key) { keyRef.current = key; setTier(0); }

  const sources = buildLogoSources(nom, isin);
  const initial = (nom || "?").replace(/^(amundi|lyxor|ishares|etf)\s+/i, "").charAt(0).toUpperCase();
  const bg      = avatarColor(nom || isin || "");

  if (tier >= sources.length) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#fff", fontWeight: "700", fontSize: Math.round(size * 0.42) + "px", lineHeight: 1, userSelect: "none" }}>{initial}</span>
      </div>
    );
  }

  const { url, cover } = sources[tier];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#FFFFFF", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <img src={url} alt="" style={{ width: cover, height: cover, objectFit: "contain" }} onError={() => setTier(t => t + 1)} />
    </div>
  );
}
