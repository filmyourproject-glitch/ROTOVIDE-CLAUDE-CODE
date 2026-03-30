import { Badge } from "@/components/ui/badge";

const variants: Record<string, { bg: string; text: string; border: string }> = {
  pending: {
    bg: "rgba(242,237,228,0.06)",
    text: "rgba(242,237,228,0.5)",
    border: "rgba(242,237,228,0.1)",
  },
  approved: {
    bg: "rgba(74,222,128,0.1)",
    text: "#4ade80",
    border: "rgba(74,222,128,0.2)",
  },
  rejected: {
    bg: "rgba(255,71,71,0.1)",
    text: "#FF4747",
    border: "rgba(255,71,71,0.2)",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const v = variants[status] ?? variants.pending;
  return (
    <Badge
      variant="outline"
      className="text-xs font-mono tracking-wider uppercase"
      style={{
        background: v.bg,
        color: v.text,
        borderColor: v.border,
      }}
    >
      {status}
    </Badge>
  );
}
