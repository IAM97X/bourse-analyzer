import { useState, useEffect, useContext, createContext } from "react";

export const MobileCtx = createContext(false);
export const TabletCtx = createContext(false);
export const useIsMobile = () => useContext(MobileCtx);
export const useIsTablet = () => useContext(TabletCtx);

export function MobileProvider({ children }) {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  const [tablet, setTablet] = useState(() => window.innerWidth >= 768 && window.innerWidth < 1200);
  useEffect(() => {
    const handler = () => {
      setMobile(window.innerWidth < 768);
      setTablet(window.innerWidth >= 768 && window.innerWidth < 1200);
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
