import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportWaitlistCSV } from "@/lib/admin/queries";

export function ExportButton({ statusFilter }: { statusFilter?: string }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      await exportWaitlistCSV(statusFilter);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={loading}
      className="gap-2"
    >
      <Download className="w-3.5 h-3.5" />
      {loading ? "Exporting..." : "Export CSV"}
    </Button>
  );
}
