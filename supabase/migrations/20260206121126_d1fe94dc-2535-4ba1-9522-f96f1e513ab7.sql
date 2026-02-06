
-- Create push_subscriptions table for Web Push (VAPID)
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anyone with anon key to subscribe (admin will use this)
CREATE POLICY "Allow insert push subscriptions"
  ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to read their own subscription by endpoint
CREATE POLICY "Allow read push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  USING (true);

-- Allow delete by endpoint
CREATE POLICY "Allow delete push subscriptions"
  ON public.push_subscriptions
  FOR DELETE
  USING (true);
