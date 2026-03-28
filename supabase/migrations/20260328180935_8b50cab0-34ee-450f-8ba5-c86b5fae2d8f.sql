CREATE OR REPLACE FUNCTION public.recover_attribution_from_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_session RECORD;
  has_valid_utm BOOLEAN;
BEGIN
  -- Check if lead has valid (non-placeholder) UTM data
  has_valid_utm := (
    NEW.utm_source IS NOT NULL 
    AND NEW.utm_source != '' 
    AND NEW.utm_source != 'direct'
    AND NEW.utm_source NOT LIKE '%{{%'
  );

  IF has_valid_utm THEN
    NEW.attribution_source := 'direct_ad';
    RETURN NEW;
  END IF;

  -- Clear any placeholder UTM values on the lead itself
  IF NEW.utm_source IS NOT NULL AND NEW.utm_source LIKE '%{{%' THEN
    NEW.utm_source := NULL;
  END IF;
  IF NEW.utm_medium IS NOT NULL AND NEW.utm_medium LIKE '%{{%' THEN
    NEW.utm_medium := NULL;
  END IF;
  IF NEW.utm_campaign IS NOT NULL AND NEW.utm_campaign LIKE '%{{%' THEN
    NEW.utm_campaign := NULL;
  END IF;
  IF NEW.utm_content IS NOT NULL AND NEW.utm_content LIKE '%{{%' THEN
    NEW.utm_content := NULL;
  END IF;
  IF NEW.utm_term IS NOT NULL AND NEW.utm_term LIKE '%{{%' THEN
    NEW.utm_term := NULL;
  END IF;
  IF NEW.site_source_name IS NOT NULL AND NEW.site_source_name LIKE '%{{%' THEN
    NEW.site_source_name := NULL;
  END IF;
  IF NEW.placement IS NOT NULL AND NEW.placement LIKE '%{{%' THEN
    NEW.placement := NULL;
  END IF;

  -- Skip if no IP to match on
  IF (NEW.ip_address IS NULL OR NEW.ip_address = '' OR NEW.ip_address = 'unknown') THEN
    NEW.attribution_source := 'organic';
    RETURN NEW;
  END IF;

  -- Look for a recent session from the same IP that had VALID UTM data (within 3 days)
  SELECT 
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, campaign_id, adset_id, ad_id, creative_id
  INTO matched_session
  FROM public.lead_sessions
  WHERE ip_address = NEW.ip_address
    AND created_at >= (now() - interval '3 days')
    AND utm_source IS NOT NULL 
    AND utm_source != '' 
    AND utm_source != 'direct'
    AND utm_source NOT LIKE '%{{%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
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