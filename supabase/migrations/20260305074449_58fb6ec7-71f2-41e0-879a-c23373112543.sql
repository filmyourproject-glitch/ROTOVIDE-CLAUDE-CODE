
-- Drop existing policy if any, then create
DROP POLICY IF EXISTS "Allow public waitlist signups" ON public.waitlist;
CREATE POLICY "Allow public waitlist signups"
  ON public.waitlist
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Also allow anon to select for invite code validation on signup
DROP POLICY IF EXISTS "Allow anon to check invite codes" ON public.waitlist;
CREATE POLICY "Allow anon to check invite codes"
  ON public.waitlist
  FOR SELECT
  TO anon
  USING (true);

-- Allow anon to update redeemed status (for signup flow)
DROP POLICY IF EXISTS "Allow anon to redeem codes" ON public.waitlist;
CREATE POLICY "Allow anon to redeem codes"
  ON public.waitlist
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
