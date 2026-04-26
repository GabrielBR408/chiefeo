import { useEffect, useState } from "react";
import { MOBILE_BREAKPOINT } from "../constants/theme.js";

const detect = () =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;

export function useIsMobile() {
  const [mob, setMob] = useState(detect);
  useEffect(() => {
    const onResize = () => setMob(detect());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mob;
}
