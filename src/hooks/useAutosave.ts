import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TimelineData } from "@/types";

/**
 * Debounced autosave for timeline_data.
 * Calls update on projects table after 2s of inactivity.
 */
export function useAutosave(projectId: string | undefined, timelineData: TimelineData | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(timelineData);
  latestRef.current = timelineData;

  const save = useCallback(async () => {
    if (!projectId || !latestRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase
      .from("projects")
      .update({ timeline_data: JSON.parse(JSON.stringify(latestRef.current)) })
      .eq("id", projectId);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !timelineData) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timelineData, save, projectId]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        save();
      }
    };
  }, [save]);
}
