<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Admin panel is public route /admin (ssr:false); admin identity comes from verified Telegram Mini App initData and must match ADMIN_TELEGRAM_IDS or the admin_telegram_ids PostgreSQL allowlist (currently seeded with 'shanto_as'); all admin reads/writes go through authenticated server functions in src/lib/admin.functions.ts.
- App-wide tunables (rewards, min withdraw, spins) come from app_settings row id=1 via src/lib/settings.ts — so admin can change them without code.
- App-wide presentation colors and gradients live in semantic tokens in src/styles.css; transparent page backgrounds expose the shared canvas so all routes stay visually consistent.
- The app-opening intro is a lightweight root-mounted overlay that never delays route rendering or data loading; dismiss it automatically, support skipping, and respect reduced motion.
- Cache read-only queries briefly and preload routes on navigation intent; earning mutations always validate fresh server state so caching never authorizes rewards.
- Daily status queries filter by the current noon-to-noon window and run cleanup/count/settings concurrently; reward settings share the status read to reduce network round trips without relying on cleanup order.
- The home sculpture is a lazy-loaded client-only R3F scene with local lightformers and CSS palette tokens; pause offscreen/hidden and honor reduced motion to protect mobile performance.
- Scroll reveals use a reusable IntersectionObserver wrapper with visible-by-default content and reduced-motion support; animation must never gate earning actions or data loading.
