
-- User credit balances
CREATE TABLE public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  subscription_credits INT NOT NULL DEFAULT 20,
  topup_credits INT NOT NULL DEFAULT 0,
  trial_credits INT NOT NULL DEFAULT 0,
  trial_expires_at TIMESTAMPTZ,
  subscription_resets_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  primary_use TEXT,
  email_trial_expiry BOOLEAN NOT NULL DEFAULT true,
  email_low_credits BOOLEAN NOT NULL DEFAULT true,
  email_export_ready BOOLEAN NOT NULL DEFAULT true,
  email_monthly_reset BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own credits"
  ON public.user_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own credits"
  ON public.user_credits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Credit transaction log (audit trail)
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  export_id UUID,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own transactions"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add credit fields to existing exports table
ALTER TABLE public.exports
  ADD COLUMN IF NOT EXISTS watermarked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS credits_used INT DEFAULT 1;

-- Atomic credit deduction RPC
CREATE OR REPLACE FUNCTION public.deduct_credit(
  p_user_id UUID,
  p_export_id UUID,
  p_amount INT DEFAULT 1
)
RETURNS JSON AS $$
DECLARE
  v_credits public.user_credits%ROWTYPE;
  v_from_subscription INT := 0;
  v_from_topup INT := 0;
  v_from_trial INT := 0;
  v_total_available INT;
BEGIN
  SELECT * INTO v_credits FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'no_credit_record');
  END IF;

  -- Calculate trial credits (only if not expired)
  IF v_credits.trial_expires_at IS NOT NULL AND v_credits.trial_expires_at > now() THEN
    v_from_trial := LEAST(v_credits.trial_credits, p_amount);
  END IF;

  -- Use subscription credits next, then topup
  v_from_subscription := LEAST(v_credits.subscription_credits, p_amount - v_from_trial);
  v_from_topup := LEAST(v_credits.topup_credits, p_amount - v_from_trial - v_from_subscription);

  v_total_available := v_from_trial + v_from_subscription + v_from_topup;

  -- Free tier users can always export (watermarked) without credit check
  IF v_total_available < p_amount AND v_credits.plan != 'free' THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  -- Deduct
  UPDATE public.user_credits SET
    trial_credits = trial_credits - v_from_trial,
    subscription_credits = subscription_credits - v_from_subscription,
    topup_credits = topup_credits - v_from_topup,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, description, export_id)
  VALUES (p_user_id, -p_amount, 'export', 'Video export', p_export_id);

  RETURN json_build_object(
    'success', true,
    'deducted', p_amount,
    'remaining', v_credits.subscription_credits - v_from_subscription + v_credits.topup_credits - v_from_topup + 
      CASE WHEN v_credits.trial_expires_at > now() THEN v_credits.trial_credits - v_from_trial ELSE 0 END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Auto-seed credits on new user signup (extend existing handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');

  INSERT INTO public.user_credits (user_id, plan, subscription_credits, trial_credits, trial_expires_at)
  VALUES (
    new.id,
    'trial',
    0,
    15,
    now() + interval '3 days'
  );

  RETURN new;
END;
$function$;
