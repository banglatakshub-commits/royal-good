ALTER TABLE public.app_settings ADD COLUMN daily_typing integer NOT NULL DEFAULT 5, ADD COLUMN daily_quiz integer NOT NULL DEFAULT 5;
CREATE TABLE public.job_views (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tg_id text NOT NULL, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.job_views TO service_role;
ALTER TABLE public.job_views ENABLE ROW LEVEL SECURITY;
CREATE INDEX job_views_tg_kind ON public.job_views (tg_id, kind);