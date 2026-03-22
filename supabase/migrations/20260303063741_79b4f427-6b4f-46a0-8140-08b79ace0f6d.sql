
-- 1) Unique constraint for idempotency on credit_transactions
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_user_export_unique
ON public.credit_transactions(user_id, export_id)
WHERE export_id IS NOT NULL;

-- 2) Replace deduct_credit: use auth.uid(), COALESCE, RETURNING, proper idempotency
CREATE OR REPLACE FUNCTION public.deduct_credit(p_export_id uuid, p_amount integer DEFAULT 1)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_credits public.user_credits%ROWTYPE;
  v_from_subscription INT := 0;
  v_from_topup INT := 0;
  v_from_trial INT := 0;
  v_total_available INT;
  v_new_sub INT;
  v_new_topup INT;
  v_new_trial INT;
  v_inserted BOOLEAN;
BEGIN
  -- Security: must be authenticated
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Idempotency: if this export already deducted, return success without re-deducting
  IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE user_id = v_user_id AND export_id = p_export_id) THEN
    SELECT
      COALESCE(subscription_credits, 0) + COALESCE(topup_credits, 0) +
      CASE WHEN trial_expires_at IS NOT NULL AND trial_expires_at > now() THEN COALESCE(trial_credits, 0) ELSE 0 END
    INTO v_total_available
    FROM public.user_credits WHERE user_id = v_user_id;

    RETURN json_build_object('success', true, 'deducted', 0, 'remaining', COALESCE(v_total_available, 0), 'idempotent', true);
  END IF;

  -- Lock the row
  SELECT * INTO v_credits FROM public.user_credits WHERE user_id = v_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'no_credit_record');
  END IF;

  -- Free tier: always allowed (watermarked), log but don't deduct
  IF v_credits.plan = 'free' THEN
    INSERT INTO public.credit_transactions (user_id, amount, type, description, export_id)
    VALUES (v_user_id, 0, 'export', 'Free tier export (watermarked)', p_export_id)
    ON CONFLICT (user_id, export_id) WHERE export_id IS NOT NULL DO NOTHING;

    v_total_available := COALESCE(v_credits.subscription_credits, 0) + COALESCE(v_credits.topup_credits, 0) +
      CASE WHEN v_credits.trial_expires_at IS NOT NULL AND v_credits.trial_expires_at > now() THEN COALESCE(v_credits.trial_credits, 0) ELSE 0 END;

    RETURN json_build_object('success', true, 'deducted', 0, 'remaining', v_total_available, 'watermarked', true);
  END IF;

  -- Calculate available from each pool with COALESCE
  IF v_credits.trial_expires_at IS NOT NULL AND v_credits.trial_expires_at > now() THEN
    v_from_trial := LEAST(COALESCE(v_credits.trial_credits, 0), p_amount);
  END IF;
  v_from_subscription := LEAST(COALESCE(v_credits.subscription_credits, 0), p_amount - v_from_trial);
  v_from_topup := LEAST(COALESCE(v_credits.topup_credits, 0), p_amount - v_from_trial - v_from_subscription);

  v_total_available := v_from_trial + v_from_subscription + v_from_topup;

  IF v_total_available < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  -- Deduct with COALESCE and RETURNING for accurate balances
  UPDATE public.user_credits SET
    trial_credits = COALESCE(trial_credits, 0) - v_from_trial,
    subscription_credits = COALESCE(subscription_credits, 0) - v_from_subscription,
    topup_credits = COALESCE(topup_credits, 0) - v_from_topup,
    updated_at = now()
  WHERE user_id = v_user_id
  RETURNING subscription_credits, topup_credits, trial_credits INTO v_new_sub, v_new_topup, v_new_trial;

  -- Insert transaction with ON CONFLICT for idempotency safety
  INSERT INTO public.credit_transactions (user_id, amount, type, description, export_id)
  VALUES (v_user_id, -p_amount, 'export', 'Video export', p_export_id)
  ON CONFLICT (user_id, export_id) WHERE export_id IS NOT NULL DO NOTHING;

  v_total_available := COALESCE(v_new_sub, 0) + COALESCE(v_new_topup, 0) +
    CASE WHEN v_credits.trial_expires_at IS NOT NULL AND v_credits.trial_expires_at > now() THEN COALESCE(v_new_trial, 0) ELSE 0 END;

  RETURN json_build_object('success', true, 'deducted', p_amount, 'remaining', v_total_available);
END;
$function$;

-- 3) Strict permissions
REVOKE ALL ON FUNCTION public.deduct_credit(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credit(uuid, integer) TO authenticated;
