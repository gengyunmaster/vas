import { useEffect, useState } from "react";

// Keeps a closing element mounted until its exit animation has played.
export function usePresence(open: boolean, duration = 180): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [open, duration, mounted]);
  return { mounted, closing };
}
