-- Restrict column-level UPDATE access for public-writable tracking tables
-- and harden user_roles to prevent admin self-escalation.

-- =========================================================
-- leads: restrict UPDATE to tracking-only columns
-- =========================================================
REVOKE UPDATE ON public.leads FROM anon, authenticated;
GRANT UPDATE (
  first_opened_at,
  clicked_whatsapp,
  clicked_whatsapp_at,
  skipped_queue,
  skipped_queue_at,
  lido,
  ip_address,
  is_duplicate_ip,
  nps_score
) ON public.leads TO anon, authenticated;

-- =========================================================
-- lead_sessions: restrict UPDATE to tracking-only columns
-- (excludes Kommo/WhatsApp notify state and other server-managed fields)
-- =========================================================
REVOKE UPDATE ON public.lead_sessions FROM anon, authenticated;
GRANT UPDATE (
  current_step_id,
  last_seen_at,
  last_page,
  first_page,
  completed,
  started_quiz,
  entered_quiz_page,
  user_agent,
  device_type,
  referrer,
  ip_address,
  fbp,
  fbclid,
  gclid,
  ttclid,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  campaign_id,
  adset_id,
  ad_id,
  creative_id,
  start_button_id,
  lead_stage,
  lead_market,
  lead_name,
  lead_whatsapp,
  lead_instagram
) ON public.lead_sessions TO anon, authenticated;

-- =========================================================
-- section_views: restrict UPDATE to time-tracking columns only
-- =========================================================
REVOKE UPDATE ON public.section_views FROM anon, authenticated;
GRANT UPDATE (
  time_spent_ms,
  last_seen_at,
  section_order
) ON public.section_views TO anon, authenticated;

-- =========================================================
-- user_roles: prevent self-admin escalation
-- Split the catch-all "ALL" admin policy into per-command policies,
-- and explicitly block any INSERT where the caller assigns the 'admin'
-- role to their own user_id.
-- =========================================================
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins can select roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert roles (no self-admin)"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND NOT (user_id = auth.uid() AND role = 'admin'::app_role)
);

CREATE POLICY "Admins can update roles (no self-admin)"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND NOT (user_id = auth.uid() AND role = 'admin'::app_role)
);

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
