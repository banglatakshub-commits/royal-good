-- Ads network change: GigaPub script site ID 8416 -> 8594
-- (<script src="https://ad.gigapub.tech/script?id=8594"></script>).
-- The app_settings row already exists in Railway, so changing only the column default would leave
-- the stored value untouched; update the row as well, but only while it still holds the previous
-- ID so an admin who later picks another ID in /admin keeps their choice on the next deploy.
-- Idempotent and data-safe.
ALTER TABLE public.app_settings ALTER COLUMN ads_script_id SET DEFAULT '8594';
--> statement-breakpoint
UPDATE public.app_settings SET ads_script_id = '8594' WHERE id = 1 AND ads_script_id = '8416';
