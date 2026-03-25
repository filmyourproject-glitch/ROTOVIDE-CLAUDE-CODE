import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, Loader2 } from "lucide-react";

interface EmailPrefs {
  email_trial_expiry: boolean;
  email_low_credits: boolean;
  email_export_ready: boolean;
  email_monthly_reset: boolean;
}

export default function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [prefs, setPrefs] = useState<EmailPrefs>({
    email_trial_expiry: true,
    email_low_credits: true,
    email_export_ready: true,
    email_monthly_reset: true,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_credits")
      .select("email_trial_expiry, email_low_credits, email_export_ready, email_monthly_reset")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setPrefs(data);
      });
  }, [user]);

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to update name.");
    } else {
      toast.success("Name updated!");
    }
  };

  const togglePref = async (key: keyof EmailPrefs) => {
    if (!user) return;
    const newVal = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: newVal }));
    const { error } = await supabase
      .from("user_credits")
      .update({ [key]: newVal })
      .eq("user_id", user.id);
    if (error) {
      setPrefs((p) => ({ ...p, [key]: !newVal }));
      toast.error("Failed to update preference.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
    toast("You've been signed out.");
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("delete-account");
      if (fnError) {
        toast.error("Failed to delete account. Please try again.");
        setDeleting(false);
        return;
      }
      toast.success("Account deleted successfully.");
      setDeleteDialogOpen(false);
      await signOut();
      navigate("/", { replace: true });
    } catch {
      toast.error("Network error. Please try again.");
      setDeleting(false);
    }
  };

  const notificationItems = [
    { key: "email_trial_expiry" as const, title: "Trial expiring soon", desc: "Email me before my trial expires" },
    { key: "email_low_credits" as const, title: "Credits running low", desc: "Email me when credits drop below 30" },
    { key: "email_export_ready" as const, title: "Export complete", desc: "Email me when exports finish processing" },
    { key: "email_monthly_reset" as const, title: "Monthly credit reset", desc: "Email me when subscription credits refresh" },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      {/* Profile */}
      <div className="surface-card shadow-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Profile</h2>
        <div className="space-y-2">
          <Label>Full Name</Label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="bg-background"
            placeholder="Your name"
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={user?.email ?? ""} className="bg-background" disabled />
          <p className="text-xs text-muted-foreground">Email cannot be changed</p>
        </div>
        <Button onClick={handleSaveName} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      {/* Notifications */}
      <div className="surface-card shadow-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
        {notificationItems.map((item, i) => (
          <div key={item.key}>
            {i > 0 && <Separator className="my-3" />}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={prefs[item.key]}
                onCheckedChange={() => togglePref(item.key)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Sign Out */}
      <Button
        variant="ghost"
        className="w-full border border-destructive/30 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={handleSignOut}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>

      {/* Danger Zone */}
      <div className="border border-destructive/30 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all data. This cannot be undone.
        </p>
        <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
          Delete Account
        </Button>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Account</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will permanently delete your account, all projects, media files,
                exports, and cancel any active subscription. This action cannot be undone.
              </span>
              <span className="block text-sm font-medium text-foreground">
                Type <strong className="text-destructive">DELETE</strong> to confirm:
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="bg-background font-mono"
            disabled={deleting}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "DELETE" || deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete My Account"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
