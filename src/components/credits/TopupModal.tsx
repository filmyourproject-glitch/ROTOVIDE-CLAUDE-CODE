import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Check } from "lucide-react";
import { STRIPE_TOPUPS } from "@/lib/stripeConfig";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TopupModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleBuy = async (priceId: string) => {
    setLoading(priceId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, mode: "payment" },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch {
      toast.error("Failed to start checkout.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ background: '#111111', border: '1px solid rgba(242,237,228,0.1)' }} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Buy Credits
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Top-up credits never expire. Use them anytime.</p>
        <div className="space-y-3 pt-2">
          {STRIPE_TOPUPS.map((pack) => (
            <button
              key={pack.price_id}
              onClick={() => handleBuy(pack.price_id)}
              disabled={loading === pack.price_id}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded border transition-all",
                "hover:border-primary/30 hover:bg-primary/[0.03]",
                pack.popular ? "border-primary/20 bg-primary/[0.02]" : "border-border bg-background",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">{pack.credits} Credits</p>
                  <p className="text-xs text-muted-foreground">Never expire</p>
                </div>
                {pack.popular && (
                  <span className="text-[9px] font-mono tracking-widest uppercase bg-primary/10 text-primary px-2 py-0.5 rounded">
                    Popular
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-display text-primary">{pack.price}</p>
                {loading === pack.price_id && <p className="text-xs text-muted-foreground">Loading…</p>}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
