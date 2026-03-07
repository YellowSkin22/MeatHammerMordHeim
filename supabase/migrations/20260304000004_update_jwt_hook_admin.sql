-- Update custom access token hook to also inject is_admin into JWT claims
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  user_tier TEXT;
  user_is_admin BOOLEAN;
  claims JSONB;
BEGIN
  SELECT tier, is_admin INTO user_tier, user_is_admin FROM public.user_profiles
  WHERE user_id = (event->>'user_id')::UUID;

  claims := coalesce(event->'claims', '{}'::JSONB);
  claims := jsonb_set(claims, '{user_tier}', to_jsonb(coalesce(user_tier, 'free')));
  claims := jsonb_set(claims, '{is_admin}', to_jsonb(coalesce(user_is_admin, false)));
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
