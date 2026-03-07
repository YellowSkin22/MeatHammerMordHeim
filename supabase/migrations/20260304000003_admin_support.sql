-- Add is_admin column to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Set initial admin
UPDATE public.user_profiles SET is_admin = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'bruce.sirau.verweij@gmail.com');

-- Admins can read ALL user profiles
CREATE POLICY "Admins can read all profiles"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles ap
      WHERE ap.user_id = auth.uid() AND ap.is_admin = true
    )
  );

-- Admins can update any user's tier
CREATE POLICY "Admins can update tiers"
  ON public.user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles ap
      WHERE ap.user_id = auth.uid() AND ap.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles ap
      WHERE ap.user_id = auth.uid() AND ap.is_admin = true
    )
  );

-- Function to list all users (admin-only, SECURITY DEFINER to access auth.users)
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  signup_date TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  tier TEXT,
  is_admin BOOLEAN
) AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_profiles.user_id = auth.uid() AND user_profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    u.last_sign_in_at,
    p.tier,
    p.is_admin
  FROM auth.users u
  JOIN public.user_profiles p ON u.id = p.user_id
  ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
