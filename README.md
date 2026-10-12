# Life Good — Telegram Mini App

একটি Telegram Mini App যেখানে ইউজাররা টাস্ক করে রিওয়ার্ড পান। অ্যাপটি **Railway PostgreSQL**-এ Drizzle ORM দিয়ে ডেটা সংরক্ষণ করে।

## Features

- Typing, quiz, ads video এবং daily spin-এর রিওয়ার্ড
- Referral ও withdrawal
- Leaderboard এবং admin dashboard
- React 19, TanStack Start/Router, Tailwind CSS, Drizzle ORM ও PostgreSQL

## Local development

```bash
bun install
cp .env.example .env
# .env-এ DATABASE_URL এবং TELEGRAM_API_KEY সেট করুন
bun run db:migrate
bun run dev
```

`DATABASE_URL` অবশ্যই PostgreSQL connection URL হতে হবে। Development mode-এ Telegram ছাড়া UI preview করা যায়; deployed production-এ signed Telegram Mini App `initData` যাচাই করা হয়।

## Railway deployment

1. Railway project-এ এই GitHub repository-র app service এবং একটি PostgreSQL service রাখুন।
2. App service-এর `DATABASE_URL` variable-টি PostgreSQL service-এর URL reference-এ সেট করুন; যেমন service-এর নাম `Postgres` হলে `${{Postgres.DATABASE_URL}}`।
3. App service-এ নিচের variables দিন:
   - `TELEGRAM_API_KEY` — BotFather-এর bot token; Telegram `initData` validation এবং broadcast-এর জন্য।
   - `ADMIN_TELEGRAM_IDS` — admin-এর Telegram numeric ID/username-গুলো comma-separated list হিসেবে। `shanto_as` admin alias-টি migration-এ প্রাথমিকভাবে রাখা আছে।
   - `NODE_ENV=production`
   - ঐচ্ছিক: `DATABASE_POOL_SIZE=5`
4. Deploy করুন। Build ধাপে `bun install --frozen-lockfile` ও production build হয়। Start ধাপে `bun run db:migrate` চালিয়ে তারপর অ্যাপ চালু হয়; আলাদা managed database account বা SQL editor দরকার নেই।

Railway PostgreSQL service-কে app service-এর সঙ্গে variable reference দিয়ে link করা জরুরি—শুধু service একই project-এ থাকলেই `DATABASE_URL` app-এ আসবে এমন নয়।

## PostgreSQL ও migrations

Drizzle schema: `drizzle/schema.ts`। Versioned Railway/PostgreSQL migration: `drizzle/migrations/`। Deployment startup-এ migration স্বয়ংক্রিয়ভাবে চলে। Local/manual migration command:

```bash
bun run db:migrate
```

নতুন schema পরিবর্তনের জন্য:

```bash
bun run db:generate
```

Migration বর্তমান Railway schema-র legacy column নামগুলোও যতটা সম্ভব canonical schema-তে রূপান্তর করে। অন্য PostgreSQL database থেকে Railway-এ পুরোনো **ডেটা** স্থানান্তর এই code migration-এর অংশ নয়; পুরোনো রেকর্ড রাখতে হলে deploy-এর আগে PostgreSQL dump/restore বা উপযুক্ত data import করতে হবে।

## Security/configuration notes

- Production server `TELEGRAM_API_KEY` দিয়ে signed Mini App `initData` যাচাই করে; client পাঠানো Telegram ID-কে একা বিশ্বাস করে না।
- Admin access `ADMIN_TELEGRAM_IDS` অথবা `admin_telegram_ids` table-এর allowlist দিয়ে নিয়ন্ত্রিত। প্রথম যে user অ্যাপ খুলবে সে admin হয় না।
- Payout number public endpoints-এ ফেরত দেওয়া হয় না; এটি শুধু সংশ্লিষ্ট user-এর history ও authenticated admin panel-এ ব্যবহৃত হয়।
- Database credentials কখনো Git-এ commit করবেন না। `.env` ফাইল `.gitignore`-এ আছে।

## Useful commands

```bash
bun run dev
bun run build
bun run preview
bun run lint
bun run test
bun run db:generate
bun run db:migrate
bun run db:studio
```
