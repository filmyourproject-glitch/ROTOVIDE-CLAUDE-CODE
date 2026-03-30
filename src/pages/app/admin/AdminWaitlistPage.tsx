import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { WaitlistDetailPanel } from "@/components/admin/WaitlistDetailPanel";
import { ExportButton } from "@/components/admin/ExportButton";
import {
  fetchWaitlistRows,
  updateWaitlistStatus,
  bulkUpdateStatus,
  type WaitlistRow,
} from "@/lib/admin/queries";
import { toast } from "sonner";

const PAGE_SIZE = 25;

export default function AdminWaitlistPage() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailRow, setDetailRow] = useState<WaitlistRow | null>(null);

  const load = useCallback(async () => {
    const { data, count } = await fetchWaitlistRows({
      status,
      search,
      sortColumn,
      sortAsc,
      page,
      pageSize: PAGE_SIZE,
    });
    setRows(data);
    setTotalCount(count);
  }, [status, search, sortColumn, sortAsc, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleSort = (col: string) => {
    if (col === sortColumn) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(col);
      setSortAsc(true);
    }
    setPage(0);
  };

  const handleApprove = async (id: string) => {
    await updateWaitlistStatus(id, "approved");
    toast.success("Approved");
    load();
  };

  const handleReject = async (id: string) => {
    await updateWaitlistStatus(id, "rejected");
    toast.success("Rejected");
    load();
  };

  const handleBulkAction = async (newStatus: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await bulkUpdateStatus(ids, newStatus);
    toast.success(`${ids.length} entries ${newStatus}`);
    setSelectedIds(new Set());
    load();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (rows.every((r) => selectedIds.has(r.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl tracking-wider uppercase"
            style={{ fontFamily: "'Bebas Neue', cursive", color: "#F2EDE4" }}
          >
            Waitlist
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(242,237,228,0.45)" }}>
            {totalCount} total entries
          </p>
        </div>
        <ExportButton statusFilter={status} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "rgba(242,237,228,0.3)" }}
          />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9"
            style={{
              background: "#0d0d0d",
              border: "1px solid rgba(242,237,228,0.08)",
              color: "#F2EDE4",
            }}
          />
        </div>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger
            className="w-[140px]"
            style={{
              background: "#0d0d0d",
              border: "1px solid rgba(242,237,228,0.08)",
              color: "#F2EDE4",
            }}
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent style={{ background: "#1a1a1a", border: "1px solid rgba(242,237,228,0.08)" }}>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <div className="flex gap-2 ml-auto">
            <span className="text-xs text-foreground/50 self-center">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              style={{ color: "#4ade80", borderColor: "rgba(74,222,128,0.2)" }}
              onClick={() => handleBulkAction("approved")}
            >
              Approve All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              style={{ color: "#FF4747", borderColor: "rgba(255,71,71,0.2)" }}
              onClick={() => handleBulkAction("rejected")}
            >
              Reject All
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <WaitlistTable
        rows={rows}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        onSort={handleSort}
        sortColumn={sortColumn}
        sortAsc={sortAsc}
        onApprove={handleApprove}
        onReject={handleReject}
        onView={setDetailRow}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/40">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      <WaitlistDetailPanel
        row={detailRow}
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        onUpdate={load}
      />
    </div>
  );
}
