import { useCallback, useEffect, useRef } from "react";

const API = process.env.REACT_APP_API_URL || "/api";

export function useFocusTracker({ studentId, lessonId, onFocusUpdate }) {
  const sessionStart = useRef(Date.now());
  const focusedMs = useRef(0);
  const tabSwitches = useRef(0);
  const lastTick = useRef(Date.now());
  const lastActivity = useRef(Date.now());
  const isFocused = useRef(true);

  const getFocusPercent = useCallback(() => {
    const totalMs = Date.now() - sessionStart.current;
    return totalMs <= 0 ? 100 : Math.max(0, Math.min(100, Math.round(focusedMs.current / totalMs * 100)));
  }, []);

  useEffect(() => {
    if (!studentId || !lessonId) return undefined;
    sessionStart.current = Date.now();
    focusedMs.current = 0;
    tabSwitches.current = 0;
    lastTick.current = Date.now();
    lastActivity.current = Date.now();
    isFocused.current = !document.hidden;
    onFocusUpdate?.(100);

    const persist = () => fetch(`${API}/attention-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("skilltank_token")}` },
      body: JSON.stringify({
        lesson_id: lessonId,
        focus_percent: getFocusPercent(),
        tab_switch_count: tabSwitches.current,
        session_start: new Date(sessionStart.current).toISOString(),
        session_end: new Date().toISOString(),
        session_duration_seconds: Math.round((Date.now() - sessionStart.current) / 1000),
      }),
    }).catch(() => {});

    // ONLY use Page Visibility API — window.blur fires on same-page iframe clicks
    // which causes false-positive focus-lost events. document.hidden is the
    // correct signal for real tab/window switches.
    const markFocusLost = () => {
      if (!document.hidden) return; // guard: only act on real tab switches
      if (isFocused.current) {
        isFocused.current = false;
        tabSwitches.current += 1;
        window.dispatchEvent(new CustomEvent("skilltank:focus-lost", { detail: { tabSwitches: tabSwitches.current } }));
      }
    };
    const markFocusReturned = () => {
      if (document.hidden) return; // still hidden, ignore
      isFocused.current = true;
      lastActivity.current = Date.now();
      const focusPercent = getFocusPercent();
      onFocusUpdate?.(focusPercent);
      window.dispatchEvent(new CustomEvent("skilltank:focus-returned", { detail: { focusPercent } }));
    };
    const handleVisibilityChange = () => {
      if (document.hidden) markFocusLost();
      else markFocusReturned();
    };
    const markActivity = () => {
      lastActivity.current = Date.now();
    };
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTick.current;
      lastTick.current = now;
      const recentlyActive = now - lastActivity.current < 15000;
      if (!document.hidden && isFocused.current && recentlyActive) focusedMs.current += elapsed;
      onFocusUpdate?.(getFocusPercent());
    }, 1000);
    const checkpoint = window.setInterval(persist, 30000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("mousemove", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("click", markActivity);
    window.addEventListener("scroll", markActivity, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mousemove", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("click", markActivity);
      window.removeEventListener("scroll", markActivity);
      window.clearInterval(interval);
      window.clearInterval(checkpoint);
      persist();
    };
  }, [studentId, lessonId, getFocusPercent, onFocusUpdate]);

  return { getFocusPercent };
}
