import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RotovideLogo } from "@/components/ui/RotovideLogo";
import { supabase } from "@/integrations/supabase/client";

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Enter a valid email"),
    instagram_url: z.string().url("Enter a valid URL").or(z.literal("")).optional(),
    tiktok_url: z.string().url("Enter a valid URL").or(z.literal("")).optional(),
    mission: z.string().min(20, "Tell us more (at least 20 characters)"),
    agreed_to_terms: z.literal(true, {
      errorMap: () => ({ message: "You must agree to the terms" }),
    }),
  })
  .refine(
    (d) => (d.instagram_url && d.instagram_url.length > 0) || (d.tiktok_url && d.tiktok_url.length > 0),
    { message: "At least one social profile is required", path: ["instagram_url"] }
  );

type FormData = z.infer<typeof schema>;

export default function WaitlistFormPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      instagram_url: "",
      tiktok_url: "",
      mission: "",
      agreed_to_terms: undefined as unknown as true,
    },
  });

  const agreedValue = watch("agreed_to_terms");

  const onSubmit = async (data: FormData) => {
    setServerError("");
    const { error } = await supabase.from("waitlist").insert({
      name: data.name,
      email: data.email,
      instagram_url: data.instagram_url || null,
      tiktok_url: data.tiktok_url || null,
      mission: data.mission,
      agreed_to_terms: true,
      source: "waitlist_form",
    });

    if (error) {
      if (error.code === "23505") {
        setSubmitted(true);
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    } else {
      setSubmitted(true);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "#080808" }}
    >
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/">
            <RotovideLogo size="nav" />
          </Link>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <CheckCircle className="w-12 h-12 mx-auto" style={{ color: "#4ade80" }} />
            <h2
              className="text-2xl tracking-wider uppercase"
              style={{ fontFamily: "'Bebas Neue', cursive", color: "#F2EDE4" }}
            >
              You're on the list!
            </h2>
            <p className="text-sm" style={{ color: "rgba(242,237,228,0.6)" }}>
              We'll review your application and be in touch soon.
            </p>
            <Link
              to="/"
              className="inline-block mt-4 text-sm"
              style={{ color: "#E8FF47" }}
            >
              &larr; Back to home
            </Link>
          </div>
        ) : (
          <>
            <h2
              className="text-3xl text-center tracking-wider uppercase mb-2"
              style={{ fontFamily: "'Bebas Neue', cursive", color: "#F2EDE4" }}
            >
              Join the Waitlist
            </h2>
            <p
              className="text-center text-sm mb-8"
              style={{ color: "rgba(242,237,228,0.5)" }}
            >
              Tell us about your music and your mission.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Name */}
              <FieldWrapper label="Name" error={errors.name?.message}>
                <Input
                  {...register("name")}
                  placeholder="Your name"
                  style={inputStyle}
                />
              </FieldWrapper>

              {/* Email */}
              <FieldWrapper label="Email" error={errors.email?.message}>
                <Input
                  type="email"
                  {...register("email")}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </FieldWrapper>

              {/* Instagram */}
              <FieldWrapper
                label="Instagram URL"
                error={errors.instagram_url?.message}
                optional
              >
                <Input
                  {...register("instagram_url")}
                  placeholder="https://instagram.com/yourhandle"
                  style={inputStyle}
                />
              </FieldWrapper>

              {/* TikTok */}
              <FieldWrapper
                label="TikTok URL"
                error={errors.tiktok_url?.message}
                optional
              >
                <Input
                  {...register("tiktok_url")}
                  placeholder="https://tiktok.com/@yourhandle"
                  style={inputStyle}
                />
              </FieldWrapper>

              {/* Mission */}
              <FieldWrapper
                label="What's your mission with your music?"
                error={errors.mission?.message}
              >
                <Textarea
                  {...register("mission")}
                  placeholder="Tell us why you make music and who you're trying to reach..."
                  className="min-h-[100px]"
                  style={inputStyle}
                />
              </FieldWrapper>

              {/* Terms */}
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={agreedValue === true}
                  onCheckedChange={(checked) =>
                    setValue("agreed_to_terms", checked === true ? true : (undefined as unknown as true), {
                      shouldValidate: true,
                    })
                  }
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm" style={{ color: "rgba(242,237,228,0.7)" }}>
                    I agree to use ROTOVIDE to further the Kingdom
                  </span>
                  {errors.agreed_to_terms && (
                    <p className="text-xs mt-1" style={{ color: "#FF4747" }}>
                      {errors.agreed_to_terms.message}
                    </p>
                  )}
                </div>
              </div>

              {serverError && (
                <p className="text-sm text-center" style={{ color: "#FF4747" }}>
                  {serverError}
                </p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 text-base tracking-wider uppercase"
                style={{
                  fontFamily: "'Bebas Neue', cursive",
                  background: "#E8FF47",
                  color: "#080808",
                  letterSpacing: 2,
                }}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "JOIN THE WAITLIST"
                )}
              </Button>

              <p className="text-center text-xs" style={{ color: "rgba(242,237,228,0.3)" }}>
                At least one social profile (Instagram or TikTok) is required.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#0d0d0d",
  border: "1px solid rgba(242,237,228,0.08)",
  color: "#F2EDE4",
};

function FieldWrapper({
  label,
  error,
  optional,
  children,
}: {
  label: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="text-xs font-mono tracking-wider uppercase block mb-1.5"
        style={{ color: "rgba(242,237,228,0.45)" }}
      >
        {label}
        {optional && (
          <span style={{ color: "rgba(242,237,228,0.25)" }}> (optional)</span>
        )}
      </label>
      {children}
      {error && (
        <p className="text-xs mt-1" style={{ color: "#FF4747" }}>
          {error}
        </p>
      )}
    </div>
  );
}
