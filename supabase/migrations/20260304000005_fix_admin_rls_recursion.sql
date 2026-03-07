-- Fix infinite recursion: admin check must bypass RLS via SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.user_profiles WHERE user_id = check_user_id),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update tiers" ON public.user_profiles;

-- Recreate using the SECURITY DEFINER function (no recursion)
CREATE POLICY "Admins can read all profiles"
  ON public.user_profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update tiers"
  ON public.user_profiles FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
