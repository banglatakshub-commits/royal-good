CREATE TABLE public.players (
  tg_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  photo_url TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.players TO anon;
GRANT SELECT, INSERT, UPDATE ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read players"
  ON public.players FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can insert player"
  ON public.players FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can update player"
  ON public.players FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);