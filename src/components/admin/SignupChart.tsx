import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fetchSignupsOverTime } from "@/lib/admin/queries";

export function SignupChart({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<{ label: string; count: number }[]>([]);

  useEffect(() => {
    fetchSignupsOverTime(days).then(setData);
  }, [days]);

  return (
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
        Signups — Last {days} Days
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(242,237,228,0.04)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "rgba(242,237,228,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "rgba(242,237,228,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "#1a1a1a",
              border: "1px solid rgba(242,237,228,0.1)",
              borderRadius: 6,
              fontSize: 12,
              color: "#F2EDE4",
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#E8FF47"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#E8FF47" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
