import { ExternalLink, ChevronUp, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "./StatusBadge";
import { type WaitlistRow } from "@/lib/admin/queries";
import { formatDistanceToNow } from "date-fns";

interface Props {
  rows: WaitlistRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onSort: (column: string) => void;
  sortColumn: string;
  sortAsc: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onView: (row: WaitlistRow) => void;
}

function SortIcon({ column, active, asc }: { column: string; active: string; asc: boolean }) {
  if (column !== active) return null;
  return asc ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
}

export function WaitlistTable({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onSort,
  sortColumn,
  sortAsc,
  onApprove,
  onReject,
  onView,
}: Props) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid rgba(242,237,228,0.08)" }}
    >
      <Table>
        <TableHeader>
          <TableRow style={{ background: "#0a0a0a" }}>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => onSort("name")}
            >
              Name <SortIcon column="name" active={sortColumn} asc={sortAsc} />
            </TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => onSort("email")}
            >
              Email <SortIcon column="email" active={sortColumn} asc={sortAsc} />
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Socials</TableHead>
            <TableHead
              className="cursor-pointer select-none"
              onClick={() => onSort("created_at")}
            >
              Joined <SortIcon column="created_at" active={sortColumn} asc={sortAsc} />
            </TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-foreground/30">
                No entries found
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer hover:bg-foreground/[0.02]"
              onClick={() => onView(row)}
              style={{ borderColor: "rgba(242,237,228,0.04)" }}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(row.id)}
                  onCheckedChange={() => onToggleSelect(row.id)}
                />
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {row.name || "—"}
              </TableCell>
              <TableCell className="text-foreground/60 text-sm">
                {row.email}
              </TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {row.instagram_url && (
                    <a
                      href={row.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-foreground/40 hover:text-foreground/70 transition-colors"
                      title="Instagram"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {row.tiktok_url && (
                    <a
                      href={row.tiktok_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-foreground/40 hover:text-foreground/70 transition-colors"
                      title="TikTok"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {!row.instagram_url && !row.tiktok_url && (
                    <span className="text-foreground/20 text-xs">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-foreground/40 text-sm">
                {row.created_at
                  ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true })
                  : "—"}
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    style={{ color: "#4ade80" }}
                    onClick={() => onApprove(row.id)}
                    disabled={row.status === "approved"}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    style={{ color: "#FF4747" }}
                    onClick={() => onReject(row.id)}
                    disabled={row.status === "rejected"}
                  >
                    Reject
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
