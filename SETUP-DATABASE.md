# Database Setup for Gmail Connect

When you click "Connect Gmail" without a database, you'll be redirected back with setup instructions. Run these commands:

## Step 1: Get a free database

1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project
3. Copy the connection string (looks like `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`)

## Step 2: Add to .env.local

Open `.env.local` in the project root and add (or uncomment):

```
DATABASE_URL=postgresql://YOUR_CONNECTION_STRING_HERE
```

## Step 3: Create tables

```bash
cd /Users/haroldtrakhman/Desktop/cursor\ projects/jobpulse
npx prisma db push
```

## Step 4: Restart the dev server

Stop the current server (Ctrl+C) and run:

```bash
npm run dev
```

Then try "Connect Gmail" again.
