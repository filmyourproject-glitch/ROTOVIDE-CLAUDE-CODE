import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Clock, CheckCircle, XCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/admin/StatsCard";
import { SignupChart } from "@/components/admin/SignupChart";
import { DayOfWeekChart } from "@/components/admin/DayOfWeekChart";
import { StatusPieChart } from "@/components/admin/StatusPieChart";
import { ExportButton } from "@/components/admin/ExportButton";
import { fetchWaitlistStats, type WaitlistStats } from "@/lib/admin/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<WaitlistStats>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchWaitlistStats().then(setStats);
  }, []);

  const handleSendLaunchEmails = async () => {
    if (!confirm(`Send launch emails to ${stats.approved} approved artists?`)) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-launch-emails");
      if (error) throw error;
      toast.success(`Sent ${data?.sent ?? 0} launch emails`);
      fetchWaitlistStats().then(setStats);
    } catch (e: any) {
      toast.error(e.message || "Failed to send emails");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl tracking-wider uppercase"
            style={{ fontFamily: "'Bebas Neue', cursive", color: "#F2EDE4" }}
          >
            Admin Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(242,237,228,0.45)" }}>
            Waitlist overview and management
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton statusFilter="approved" />
          <Button
            size="sm"
            onClick={handleSendLaunchEmails}
            disabled={sending || stats.approved === 0}
            className="gap-2"
            style={{ background: "#E8FF47", color: "#080808" }}
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? "Sending..." : "Send Launch Emails"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Signups" value={stats.total} icon={Users} color="#E8FF47" />
        <StatsCard label="Pending" value={stats.pending} icon={Clock} color="rgba(242,237,228,0.5)" />
        <StatsCard label="Approved" value={stats.approved} icon={CheckCircle} color="#4ade80" />
        <StatsCard label="Rejected" value={stats.rejected} icon={XCircle} color="#FF4747" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SignupChart days={30} />
        </div>
        <StatusPieChart stats={stats} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DayOfWeekChart />
        {/* Quick actions */}
        <div
          className="p-5 rounded-lg flex flex-col gap-3"
          style={{
            background: "#0d0d0d",
            border: "1px solid rgba(242,237,228,0.08)",
          }}
        >
          <h3
            className="text-xs font-mono tracking-widest uppercase mb-2"
            style={{ color: "rgba(242,237,228,0.45)" }}
          >
            Quick Actions
          </h3>
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/admin/waitlist?status=pending">
              View Pending ({stats.pending})
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/admin/waitlist">View All Waitlist</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/admin/analytics">View Analytics</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
