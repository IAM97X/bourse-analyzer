import { useState, useEffect, useContext, createContext } from "react";

export const MobileCtx = createContext(false);
export const TabletCtx = createContext(false);
export const useIsMobile = () => useContext(MobileCtx);
export const useIsTablet = () => useContext(TabletCtx);

const isTouch = () =>
  window.matchMedia("(pointer: coarse)").matches ||
  window.matchMedia("(hover: none)").matches;

const detectMobile = () => window.innerWidth < 768 && isTouch();
const detectTablet = () =>
  window.innerWidth >= 768 && window.innerWidth < 1200 && isTouch();

export function MobileProvider({ children }) {
  const [mobile, setMobile] = useState(detectMobile);
  const [tablet, setTablet] = useState(detectTablet);
  useEffect(() => {
    const handler = () => {
      setMobile(detectMobile());
      setTablet(detectTablet());
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return (
    <MobileCtx.Provider value={mobile}>
      <TabletCtx.Provider value={tablet}>{children}</TabletCtx.Provider>
    </MobileCtx.Provider>
  );
}
