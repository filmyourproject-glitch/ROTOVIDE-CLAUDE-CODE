import { useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type AlertLevel = "ok" | "low" | "critical" | "empty";

export function useCreditSystem() {
  const { user, credits, isPro, refreshCredits, profile } = useAuth();

  const totalAvailable = credits?.total ?? 0;

  const plan = useMemo(() => {
    if (isPro) return "pro";
    const isOnTrial = profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();
    if (isOnTrial) return "trial";
    return "free";
  }, [isPro, profile]);

  const planTotal = plan === "free" ? 20 : 150;
  const pct = planTotal > 0 ? Math.round((totalAvailable / planTotal) * 100) : 0;

  const alertLevel: AlertLevel =
    totalAvailable === 0 ? "empty" :
    pct <= 10 ? "critical" :
    pct <= 25 ? "low" : "ok";

  const canExport = useCallback((cost = 1): { allowed: boolean; watermarked: boolean } => {
    if (plan === "free") return { allowed: true, watermarked: true };
    if (totalAvailable >= cost) return { allowed: true, watermarked: false };
    return { allowed: false, watermarked: false };
  }, [plan, totalAvailable]);

  const deductCredit = useCallback(async (exportId: string, cost = 1) => {
    if (!user) return null;
    const { data } = await supabase.rpc("deduct_credit", {
      p_export_id: exportId,
      p_amount: cost,
    }) as { data: { success: boolean; deducted?: number; remaining?: number; error?: string; watermarked?: boolean; idempotent?: boolean } | null };
    if (data?.success) await refreshCredits();
    return data;
  }, [user, refreshCredits]);

  return {
    credits,
    loading: !credits,
    totalAvailable,
    plan,
    planTotal,
    pct,
    alertLevel,
    canExport,
    deductCredit,
    refetch: refreshCredits,
  };
}
