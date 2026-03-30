import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

interface StatusData {
  name: string;
  value: number;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "rgba(242,237,228,0.4)",
  approved: "#4ade80",
  rejected: "#FF4747",
};

export function StatusPieChart({
  stats,
}: {
  stats: { pending: number; approved: number; rejected: number };
}) {
  const data: StatusData[] = [
    { name: "Pending", value: stats.pending, color: STATUS_COLORS.pending },
    { name: "Approved", value: stats.approved, color: STATUS_COLORS.approved },
    { name: "Rejected", value: stats.rejected, color: STATUS_COLORS.rejected },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div
        className="p-5 rounded-lg flex items-center justify-center"
        style={{
          background: "#0d0d0d",
          border: "1px solid rgba(242,237,228,0.08)",
          minHeight: 280,
        }}
      >
        <span className="text-sm" style={{ color: "rgba(242,237,228,0.3)" }}>
          No data yet
        </span>
      </div>
    );
  }

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
        Status Distribution
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            strokeWidth={0}
          >
            {data.map((entry, i) => (
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
  );
}
