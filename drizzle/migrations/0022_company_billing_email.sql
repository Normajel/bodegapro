ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS billing_email text NOT NULL DEFAULT ''
  CHECK (char_length(billing_email) <= 200);
