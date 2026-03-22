import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export interface Profile {
  full_name: string | null;
  plan: string | null;
  trial_ends_at: string | null;
  trial_used: boolean | null;
  storage_used_bytes: number | null;
}

export interface SubscriptionInfo {
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
}

export interface CreditBalance {
  subscription_credits: number;
  topup_credits: number;
  trial_credits: number;
  trial_expires_at: string | null;
  total: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  displayName: string;
  initials: string;
  planLabel: string;
  // Subscription & credits
  subscription: SubscriptionInfo | null;
  credits: CreditBalance | null;
  isPro: boolean;
  refreshSubscription: () => Promise<void>;
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  displayName: "",
  initials: "",
  planLabel: "Free Plan",
  subscription: null,
  credits: null,
  isPro: false,
  refreshSubscription: async () => {},
  refreshCredits: async () => {},
});

function getDisplayName(profile: Profile | null, user: User | null): string {
  if (profile?.full_name) return profile.full_name;
  if (user?.email) return user.email.split("@")[0];
  return "there";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getPlanLabel(profile: Profile | null, subscription: SubscriptionInfo | null): string {
  if (subscription?.subscribed) return "Pro Plan";
  if (!profile) return "Free Plan";
  const isOnTrial = profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date();
  if (isOnTrial) return "Pro Trial";
  if (profile.plan === "pro") return "Pro Plan";
  return "Free Plan";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, plan, trial_ends_at, trial_used, storage_used_bytes")
      .eq("id", userId)
      .maybeSingle();
    if (data) setProfile(data);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshSubscription = useCallback(async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (!error && data) {
        setSubscription({
          subscribed: data.subscribed,
          product_id: data.product_id,
          subscription_end: data.subscription_end,
        });
      }
    } catch (err) {
      console.error("check-subscription error:", err);
    }
  }, [session]);

  const refreshCredits = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_credits")
      .select("subscription_credits, topup_credits, trial_credits, trial_expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const trialActive = data.trial_expires_at && new Date(data.trial_expires_at) > new Date();
      setCredits({
        subscription_credits: data.subscription_credits,
        topup_credits: data.topup_credits,
        trial_credits: data.trial_credits,
        trial_expires_at: data.trial_expires_at,
        total: data.subscription_credits + data.topup_credits + (trialActive ? data.trial_credits : 0),
      });
    }
  }, [user]);

  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setSubscription(null);
          setCredits(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) fetchProfile(session.user.id);
    });

    return () => authSub.unsubscribe();
  }, [fetchProfile]);

  // Fetch subscription & credits after session is available
  useEffect(() => {
    if (session && user) {
      refreshSubscription();
      refreshCredits();
    }
  }, [session, user, refreshSubscription, refreshCredits]);

  // Periodic refresh every 60s
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      refreshSubscription();
      refreshCredits();
    }, 60_000);
    return () => clearInterval(interval);
  }, [session, refreshSubscription, refreshCredits]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSubscription(null);
    setCredits(null);
  };

  const displayName = getDisplayName(profile, user);
  const initials = getInitials(displayName);
  const isPro = subscription?.subscribed === true || (profile?.plan === "pro");
  const planLabel = getPlanLabel(profile, subscription);

  return (
    <AuthContext.Provider value={{
      user, session, profile, loading, signOut, refreshProfile,
      displayName, initials, planLabel,
      subscription, credits, isPro,
      refreshSubscription, refreshCredits,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
