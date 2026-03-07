-- Custom access token hook to inject user_tier into JWT claims
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  user_tier TEXT;
  claims JSONB;
BEGIN
  SELECT tier INTO user_tier FROM public.user_profiles
  WHERE user_id = (event->>'user_id')::UUID;

  claims := coalesce(event->'claims', '{}'::JSONB);
  claims := jsonb_set(claims, '{user_tier}', to_jsonb(coalesce(user_tier, 'free')));
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON TABLE public.user_profiles TO supabase_auth_admin;
