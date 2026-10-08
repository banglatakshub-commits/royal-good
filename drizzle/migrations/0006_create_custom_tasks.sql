CREATE TABLE public.custom_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT '⭐',
  link text,
  reward integer NOT NULL DEFAULT 5,
  wait_seconds integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custom_tasks TO anon, authenticated;
GRANT ALL ON public.custom_tasks TO service_role;
ALTER TABLE public.custom_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read tasks" ON public.custom_tasks FOR SELECT TO anon, authenticated USING (true);