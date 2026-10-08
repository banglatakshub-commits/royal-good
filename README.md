# Life Good - Telegram Mini App

একটি আধুনিক Telegram Mini App যেখানে ইউজাররা বিভিন্ন টাস্ক করে আয় করতে পারেন।

## ✨ Features

- 🎯 **Typing Job** - টাইপিং করে আয়
- 🧠 **Quiz Job** - প্রশ্ন উত্তর করে আয়  
- 📺 **Ads Video** - ভিডিও দেখে আয়
- 🎰 **Daily Spin** - দৈনিক স্পিন করে রিওয়ার্ড
- 👥 **Refer & Earn** - বন্ধুদের রেফার করে বোনাস
- 💰 **Withdraw System** - সহজে টাকা তুলে নিন
- 🏆 **Leaderboard** - র‍্যাঙ্কিং সিস্টেম
- 👨‍💼 **Admin Panel** - সম্পূর্ণ ম্যানেজমেন্ট

## 🚀 Tech Stack

- **Frontend:** React 19 + TypeScript + TanStack Router
- **Styling:** Tailwind CSS 4.x + Radix UI
- **3D Graphics:** React Three Fiber
- **Database:** PostgreSQL (Railway/Supabase)
- **ORM:** Drizzle ORM
- **Build:** Vite + Bun

## 🎨 Design Highlights

- 💎 রাজকীয় নীল-গোলাপী থিম
- 🦁 Interactive 3D Lion Gem 
- 🎬 Cinematic intro animation
- 📱 Mobile-first responsive design
- 🌍 Bengali language support

## 🔧 Development

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

## 🚢 Deployment

### Railway

1. Connect your GitHub repo to Railway
2. Add PostgreSQL database
3. Set environment variables
4. Deploy!

### Environment Variables

```env
DATABASE_URL=postgresql://username:password@host:port/dbname
NODE_ENV=production
```

## 📱 Telegram Bot Setup

1. Create a Telegram bot via @BotFather
2. Set the web app URL in bot settings
3. Configure webhook (optional)

## 🗄️ Database

Uses Drizzle ORM with PostgreSQL. Migrations are in `/drizzle/migrations/`

```bash
# Generate migration
bun run db:generate

# Run migration  
bun run db:migrate

# Open Drizzle Studio
bun run db:studio
```

## 👤 Admin Panel

Access admin panel at `/admin` route. First registered user becomes admin automatically.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

This project is private and proprietary.

---

Built with ❤️ using modern web technologies
