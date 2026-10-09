# Roadmap

## Current request

- [x] Add a lightweight home 3D object and scroll reveals; desktop/mobile rendering, rotation, scroll reveals, reduced motion, and job navigation verified with no runtime errors or horizontal overflow.
- [x] Replace the home 3D object with a faceted blue-pink gem (crown, girdle, pavilion, orbiting rings and orbs); mobile rendering, rotation, no edge clipping, and reduced motion verified with no runtime errors.
- [x] Add a short Royal Good cinematic app-opening intro matching the current palette; automatic dismissal, skip, reduced motion, and mobile/desktop rendering verified with no runtime errors.
- [x] Apply the supplied blue–pink palette throughout the app; shared colors and floating navigation updated, existing functions preserved, ten pages checked with no runtime errors or horizontal overflow.
- [x] Improve navigation speed and reduce redundant network waits; route/cache tests pass, user/admin pages open without runtime errors, and existing typing daily limit remains enforced. Live typing completion was not exercised because the preview user's daily limit was exhausted.

## Done

- Telegram earning mini app: home, Typing Job, Quiz Job, Ads Video, Daily Spin, Refer & Earn, Withdraw, Leaderboard
- Royal Green professional design (v1), Bengali UI
- Real Telegram user name/photo and per-user referral link
- Referral bonus credited exactly once per user (DB-backed)
- Balance restored from database on open; job reward credited the moment a job ends
- Admin panel at `/admin`: users, withdraws, refs, settings, broadcast — login verified in browser
- Admin account exists (first signed-up account is admin)

## Open — waiting on user

- [ ] Publish the app. Until then the bot's Telegram menu button points at the private preview address and will not open. After publishing, tell the AI "পাবলিশ করেছ" so the menu button URL is updated.
- [ ] Admin login email is a placeholder (`soikot@lifegood.app`). Waiting on the user's real email to swap it.
- [ ] Admin password change: no in-app screen yet — AI can change it on request.

## Offered, not accepted

- [ ] Lock down `players.balance` — the update policy lets any user set their own balance. Needs closing before real payouts.
- [ ] Move the daily-spin limit from the phone's stored data into the database so it cannot be bypassed by clearing app data.
- [ ] Replace the Ads Video placeholder timer with a real ad video source.
- [ ] Withdraw history shown in the panel only covers requests made after the withdrawals table existed.
