import { useCallback, useRef, useState } from "react";
import type { TimelineData } from "@/types";

const MAX_HISTORY = 50;

export function useTimelineHistory() {
  const historyRef = useRef<TimelineData[]>([]);
  const indexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(indexRef.current > 0);
    setCanRedo(indexRef.current < historyRef.current.length - 1);
  }, []);

  const initHistory = useCallback((data: TimelineData) => {
    historyRef.current = [JSON.parse(JSON.stringify(data))];
    indexRef.current = 0;
    updateFlags();
  }, [updateFlags]);

  const pushHistory = useCallback((data: TimelineData) => {
    // Truncate redo states
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(data)));
    // Enforce limit
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
    indexRef.current = historyRef.current.length - 1;
    updateFlags();
  }, [updateFlags]);

  const undo = useCallback((): TimelineData | null => {
    if (indexRef.current <= 0) return null;
    indexRef.current--;
    updateFlags();
    return JSON.parse(JSON.stringify(historyRef.current[indexRef.current]));
  }, [updateFlags]);

  const redo = useCallback((): TimelineData | null => {
    if (indexRef.current >= historyRef.current.length - 1) return null;
    indexRef.current++;
    updateFlags();
    return JSON.parse(JSON.stringify(historyRef.current[indexRef.current]));
  }, [updateFlags]);

  return { initHistory, pushHistory, undo, redo, canUndo, canRedo };
}
