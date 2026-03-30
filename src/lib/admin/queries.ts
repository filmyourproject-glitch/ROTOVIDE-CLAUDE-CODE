import { supabase } from "@/integrations/supabase/client";
import { format, subDays, eachDayOfInterval, getDay } from "date-fns";

/* ─── Types ─── */
export interface WaitlistRow {
  id: string;
  email: string;
  name: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  mission: string | null;
  agreed_to_terms: boolean;
  source: string | null;
  status: string;
  notes: string | null;
  invite_code: string | null;
  code_sent: boolean;
  code_sent_at: string | null;
  redeemed: boolean;
  redeemed_at: string | null;
  invite_sent_at: string | null;
  created_at: string | null;
}

export interface WaitlistStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface FetchOptions {
  status?: string;
  search?: string;
  sortColumn?: string;
  sortAsc?: boolean;
  page?: number;
  pageSize?: number;
}

/* ─── Stats ─── */
export async function fetchWaitlistStats(): Promise<WaitlistStats> {
  const [total, pending, approved, rejected] = await Promise.all([
    supabase.from("waitlist").select("*", { count: "exact", head: true }),
    supabase.from("waitlist").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("waitlist").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("waitlist").select("*", { count: "exact", head: true }).eq("status", "rejected"),
  ]);
  return {
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
  };
}

/* ─── Paginated list ─── */
export async function fetchWaitlistRows(opts: FetchOptions = {}) {
  const {
    status,
    search,
    sortColumn = "created_at",
    sortAsc = false,
    page = 0,
    pageSize = 25,
  } = opts;

  let query = supabase
    .from("waitlist")
    .select("*", { count: "exact" });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  query = query
    .order(sortColumn, { ascending: sortAsc })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, count, error } = await query;
  return {
    data: (data ?? []) as unknown as WaitlistRow[],
    count: count ?? 0,
    error,
  };
}

/* ─── Mutations ─── */
export async function updateWaitlistStatus(id: string, status: string) {
  return supabase.from("waitlist").update({ status }).eq("id", id);
}

export async function updateWaitlistNotes(id: string, notes: string) {
  return supabase.from("waitlist").update({ notes }).eq("id", id);
}

export async function bulkUpdateStatus(ids: string[], status: string) {
  return supabase.from("waitlist").update({ status }).in("id", ids);
}

/* ─── Chart data ─── */
export async function fetchSignupsOverTime(days = 30) {
  const since = subDays(new Date(), days).toISOString();
  const { data } = await supabase
    .from("waitlist")
    .select("created_at")
    .gte("created_at", since)
    .order("created_at");

  const interval = eachDayOfInterval({
    start: subDays(new Date(), days),
    end: new Date(),
  });

  const countMap: Record<string, number> = {};
  interval.forEach((d) => (countMap[format(d, "yyyy-MM-dd")] = 0));
  (data ?? []).forEach((row) => {
    if (row.created_at) {
      const key = format(new Date(row.created_at), "yyyy-MM-dd");
      countMap[key] = (countMap[key] ?? 0) + 1;
    }
  });

  return Object.entries(countMap).map(([date, count]) => ({
    date,
    label: format(new Date(date), "MMM d"),
    count,
  }));
}

export async function fetchDayOfWeekDistribution() {
  const { data } = await supabase.from("waitlist").select("created_at");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Array(7).fill(0);
  (data ?? []).forEach((row) => {
    if (row.created_at) counts[getDay(new Date(row.created_at))]++;
  });
  return days.map((day, i) => ({ day, count: counts[i] }));
}

export async function fetchPlatformBreakdown() {
  const { data } = await supabase
    .from("waitlist")
    .select("instagram_url, tiktok_url");

  let instagramOnly = 0, tiktokOnly = 0, both = 0, neither = 0;
  (data ?? []).forEach((r: any) => {
    const hasIg = !!r.instagram_url;
    const hasTk = !!r.tiktok_url;
    if (hasIg && hasTk) both++;
    else if (hasIg) instagramOnly++;
    else if (hasTk) tiktokOnly++;
    else neither++;
  });
  return [
    { name: "Instagram Only", value: instagramOnly, color: "#E1306C" },
    { name: "TikTok Only", value: tiktokOnly, color: "#00f2ea" },
    { name: "Both", value: both, color: "#E8FF47" },
    { name: "Neither", value: neither, color: "rgba(242,237,228,0.3)" },
  ];
}

/* ─── CSV Export ─── */
export async function exportWaitlistCSV(statusFilter?: string) {
  let query = supabase.from("waitlist").select("*").order("created_at", { ascending: false });
  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  const { data } = await query;
  if (!data || data.length === 0) return;

  const rows = data as unknown as WaitlistRow[];
  const headers = ["Name", "Email", "Instagram", "TikTok", "Mission", "Status", "Signed Up"];
  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        `"${(r.name ?? "").replace(/"/g, '""')}"`,
        `"${r.email}"`,
        `"${r.instagram_url ?? ""}"`,
        `"${r.tiktok_url ?? ""}"`,
        `"${(r.mission ?? "").replace(/"/g, '""')}"`,
        r.status,
        r.created_at ? format(new Date(r.created_at), "yyyy-MM-dd") : "",
      ].join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rotovide-waitlist-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
