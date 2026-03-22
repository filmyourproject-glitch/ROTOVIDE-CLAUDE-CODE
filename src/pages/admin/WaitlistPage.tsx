import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RotovideLogo } from "@/components/ui/RotovideLogo";
import { Download, Send, Loader2, Check, Clock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface WaitlistRow {
  id: string;
  email: string;
  invite_code: string | null;
  created_at: string | null;
  code_sent: boolean | null;
  code_sent_at: string | null;
  redeemed: boolean | null;
  redeemed_at: string | null;
  source: string | null;
}

export default function WaitlistPage() {
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    const { data } = await supabase
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as any as WaitlistRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const totalCount = rows.length;
  const sentCount = rows.filter(r => r.code_sent).length;
  const redeemedCount = rows.filter(r => r.redeemed).length;
  const pendingCount = rows.filter(r => !r.code_sent).length;

  const handleSendAll = async () => {
    setSendingAll(true);
    await supabase.functions.invoke("send-waitlist-codes", { body: { send_all: true } });
    toast.success("All codes marked as sent.");
    await fetchList();
    setSendingAll(false);
  };

  const handleSendOne = async (id: string) => {
    setSendingId(id);
    await supabase.functions.invoke("send-waitlist-codes", { body: { waitlist_id: id } });
    toast.success("Code sent.");
    await fetchList();
    setSendingId(null);
  };

  const handleExportCSV = () => {
    const header = "email,invite_code,created_at,code_sent,redeemed";
    const csv = rows.map(r =>
      `${r.email},${r.invite_code ?? ""},${r.created_at ?? ""},${r.code_sent ?? false},${r.redeemed ?? false}`
    ).join("\n");
    const blob = new Blob([header + "\n" + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rotovide-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-6" style={{ background: '#080808' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <RotovideLogo size="nav" />
            <h1 className="font-display text-foreground" style={{ fontSize: 28, letterSpacing: 2 }}>WAITLIST</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={pendingCount === 0 || sendingAll}>
                  {sendingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Send All Codes
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send all invite codes?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will trigger invite code emails to all {pendingCount} waitlist members who haven't received their code yet. This cannot be undone. Proceed?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSendAll}>Send All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total", value: totalCount, color: 'rgba(242,237,228,0.7)' },
            { label: "Codes Sent", value: sentCount, color: '#E8FF47' },
            { label: "Redeemed", value: redeemedCount, color: '#4ade80' },
            { label: "Pending", value: pendingCount, color: 'rgba(242,237,228,0.4)' },
          ].map(s => (
            <div key={s.label} className="p-5 rounded text-center" style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.08)' }}>
              <p className="font-display text-3xl" style={{ color: s.color }}>{s.value}</p>
              <p className="font-mono text-[10px] tracking-[2px] mt-1" style={{ color: 'rgba(242,237,228,0.4)' }}>{s.label.toUpperCase()}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded overflow-hidden" style={{ border: '1px solid rgba(242,237,228,0.08)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#0d0d0d' }}>
                  <th className="text-left px-4 py-3 font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.4)' }}>EMAIL</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.4)' }}>INVITE CODE</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.4)' }}>JOINED</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.4)' }}>CODE SENT</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.4)' }}>REDEEMED</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12" style={{ color: 'rgba(242,237,228,0.3)' }}>Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12" style={{ color: 'rgba(242,237,228,0.3)' }}>No entries yet.</td></tr>
                ) : rows.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? '#080808' : '#0d0d0d', borderTop: '1px solid rgba(242,237,228,0.04)' }}>
                    <td className="px-4 py-3 text-foreground">{row.email}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#E8FF47' }}>{row.invite_code ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: 'rgba(242,237,228,0.4)' }}>
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.code_sent ? (
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#4ade80' }}><Check className="w-3.5 h-3.5" /> Sent</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(242,237,228,0.3)' }}><Clock className="w-3.5 h-3.5" /> Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.redeemed ? (
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#4ade80' }}><Check className="w-3.5 h-3.5" /> Used</span>
                      ) : (
                        <span className="text-xs" style={{ color: 'rgba(242,237,228,0.3)' }}>Waiting</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!row.code_sent && (
                        <Button variant="outline" size="sm" disabled={sendingId === row.id} onClick={() => handleSendOne(row.id)}>
                          {sendingId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send Code"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
