-- Required: PostgreSQL applies SELECT USING as implicit WITH CHECK on UPDATE new rows.
-- OR-logic across permissive policies lets admins bypass the is_active = true constraint,
-- allowing admins to deactivate notifications (set is_active = false) without RLS errors.
CREATE POLICY "Admins can read all notifications"
  ON public.notifications FOR SELECT
  USING (public.is_admin(auth.uid()));
