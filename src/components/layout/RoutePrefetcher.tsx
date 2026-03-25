import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Background-prefetches likely next route chunks based on current location.
 * Uses requestIdleCallback to avoid blocking the main thread.
 */
const prefetchRoutes: Record<string, () => Promise<unknown>[]> = {
  "/app/dashboard": () => [
    import("@/pages/app/ProjectsPage"),
    import("@/pages/app/NewProjectPage"),
  ],
  "/app/projects": () => [
    import("@/pages/app/EditorPage"),
    import("@/pages/app/ProjectDetailPage"),
  ],
};

// Match /app/projects/:id (but not /app/projects/:id/editor)
const projectDetailPattern = /^\/app\/projects\/[^/]+$/;

export function RoutePrefetcher() {
  const { pathname } = useLocation();

  useEffect(() => {
    const schedule =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 200);

    const cancel =
      typeof cancelIdleCallback === "function"
        ? cancelIdleCallback
        : clearTimeout;

    const id = schedule(() => {
      // Direct route match
      const factory = prefetchRoutes[pathname];
      if (factory) {
        factory().forEach((p) => p.catch(() => {}));
        return;
      }

      // Pattern match: /app/projects/:id → prefetch editor
      if (projectDetailPattern.test(pathname)) {
        import("@/pages/app/EditorPage").catch(() => {});
      }
    });

    return () => cancel(id as number);
  }, [pathname]);

  return null;
}
