import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { SignupChart } from "@/components/admin/SignupChart";
import { DayOfWeekChart } from "@/components/admin/DayOfWeekChart";
import { ExportButton } from "@/components/admin/ExportButton";
import { fetchPlatformBreakdown, fetchWaitlistStats } from "@/lib/admin/queries";

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [platform, setPlatform] = useState<{ name: string; value: number; color: string }[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });

  useEffect(() => {
    fetchPlatformBreakdown().then(setPlatform);
    fetchWaitlistStats().then(setStats);
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl tracking-wider uppercase"
            style={{ fontFamily: "'Bebas Neue', cursive", color: "#F2EDE4" }}
          >
            Analytics
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(242,237,228,0.45)" }}>
            Deeper insights into your waitlist
          </p>
        </div>
        <ExportButton />
      </div>

      {/* Date range tabs */}
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className="px-4 py-1.5 rounded text-xs font-mono tracking-wider uppercase transition-colors"
            style={{
              background: days === d ? "rgba(232,255,71,0.08)" : "transparent",
              border: `1px solid ${days === d ? "rgba(232,255,71,0.2)" : "rgba(242,237,228,0.08)"}`,
              color: days === d ? "#E8FF47" : "rgba(242,237,228,0.45)",
            }}
          >
            {d}D
          </button>
        ))}
      </div>

      {/* Signup trend */}
      <SignupChart days={days} />

      {/* Row of charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DayOfWeekChart />

        {/* Platform breakdown */}
        <div
          className="p-5 rounded-lg"
          style={{
            background: "#0d0d0d",
            border: "1px solid rgba(242,237,228,0.08)",
          }}
        >
          <h3
            className="text-xs font-mono tracking-widest uppercase mb-4"
            style={{ color: "rgba(242,237,228,0.45)" }}
          >
            Platform Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={platform}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                strokeWidth={0}
              >
                {platform.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#1a1a1a",
                  border: "1px solid rgba(242,237,228,0.1)",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#F2EDE4",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "rgba(242,237,228,0.5)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Conversion funnel placeholder */}
      <div
        className="p-5 rounded-lg"
        style={{
          background: "#0d0d0d",
          border: "1px solid rgba(242,237,228,0.08)",
        }}
      >
        <h3
          className="text-xs font-mono tracking-widest uppercase mb-4"
          style={{ color: "rgba(242,237,228,0.45)" }}
        >
          Conversion Funnel
        </h3>
        <div className="flex items-center gap-4 flex-wrap">
          {[
            { label: "Signups", value: stats.total, color: "#E8FF47" },
            { label: "Approved", value: stats.approved, color: "#4ade80" },
            { label: "Invited", value: "—", color: "rgba(242,237,228,0.3)" },
            { label: "Signed Up", value: "—", color: "rgba(242,237,228,0.3)" },
            { label: "Paid", value: "—", color: "rgba(242,237,228,0.3)" },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ fontFamily: "'Bebas Neue', cursive", color: step.color }}
                >
                  {step.value}
                </div>
                <div
                  className="text-xs font-mono tracking-wider uppercase"
                  style={{ color: "rgba(242,237,228,0.4)" }}
                >
                  {step.label}
                </div>
              </div>
              {i < 4 && (
                <span style={{ color: "rgba(242,237,228,0.15)", fontSize: 20 }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
