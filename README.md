# TheVig

A mobile-first weekly betting pool tracker for friend groups. Single admin, units-based (not real money).

## Stack

- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- Supabase (PostgreSQL)
- Deployed on Vercel

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Create a **new** Supabase project at [supabase.com](https://supabase.com) (separate from any other projects).

3. Copy `.env.example` to `.env` and fill in your Supabase connection strings and admin password:
   ```bash
   cp .env.example .env
   ```
   - `DATABASE_URL` — Transaction pooler URL from Supabase Settings > Database
   - `DIRECT_URL` — Direct connection URL from Supabase Settings > Database
   - `ADMIN_PASSWORD` — Any password you choose for admin access

4. Run Prisma migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

5. Seed the database:
   ```bash
   npx prisma db seed
   ```

6. Start the dev server:
   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000) and log in with your admin password.

## Deploy to Vercel

1. Connect the GitHub repo to Vercel.
2. Add all env vars from `.env.example` in Vercel's Environment Variables settings.
3. Deploy. Prisma generate runs automatically during build.
4. Run migrations against production: `npx prisma migrate deploy`
