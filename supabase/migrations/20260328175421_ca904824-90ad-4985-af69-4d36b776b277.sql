
CREATE OR REPLACE FUNCTION public.recover_attribution_from_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_session RECORD;
BEGIN
  -- Only run if lead has no meaningful UTM data
  IF (NEW.utm_source IS NOT NULL AND NEW.utm_source != '' AND NEW.utm_source != 'direct') THEN
    -- Already has attribution, mark as direct_ad
    NEW.attribution_source := 'direct_ad';
    RETURN NEW;
  END IF;

  -- Skip if no IP to match on
  IF (NEW.ip_address IS NULL OR NEW.ip_address = '' OR NEW.ip_address = 'unknown') THEN
    NEW.attribution_source := 'organic';
    RETURN NEW;
  END IF;

  -- Look for a recent session from the same IP that had UTM data (within 3 days)
  SELECT 
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, campaign_id, adset_id, ad_id, creative_id
  INTO matched_session
  FROM public.lead_sessions
  WHERE ip_address = NEW.ip_address
    AND created_at >= (now() - interval '3 days')
    AND (utm_source IS NOT NULL AND utm_source != '' AND utm_source != 'direct')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Copy attribution from the matched session
    NEW.utm_source := matched_session.utm_source;
    NEW.utm_medium := matched_session.utm_medium;
    NEW.utm_campaign := matched_session.utm_campaign;
    NEW.utm_content := COALESCE(matched_session.utm_content, NEW.utm_content);
    NEW.utm_term := COALESCE(matched_session.utm_term, NEW.utm_term);
    NEW.fbclid := COALESCE(matched_session.fbclid, NEW.fbclid);
    NEW.gclid := COALESCE(matched_session.gclid, NEW.gclid);
    NEW.campaign_id := COALESCE(matched_session.campaign_id, NEW.campaign_id);
    NEW.adset_id := COALESCE(matched_session.adset_id, NEW.adset_id);
    NEW.ad_id := COALESCE(matched_session.ad_id, NEW.ad_id);
    NEW.attribution_source := 'bio_recovery';
    
    RAISE NOTICE 'Bio recovery: matched lead % to session IP %', NEW.whatsapp, NEW.ip_address;
  ELSE
    NEW.attribution_source := 'organic';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recover_attribution
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.recover_attribution_from_session();
