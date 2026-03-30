import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fetchDayOfWeekDistribution } from "@/lib/admin/queries";

export function DayOfWeekChart() {
  const [data, setData] = useState<{ day: string; count: number }[]>([]);

  useEffect(() => {
    fetchDayOfWeekDistribution().then(setData);
  }, []);

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
        Signups by Day of Week
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(242,237,228,0.04)" />
          <XAxis
            dataKey="day"
            tick={{ fill: "rgba(242,237,228,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
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
          <Bar dataKey="count" fill="#E8FF47" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
