#!/bin/bash
# Kill any running Next.js dev server, clean cache, restart
echo "Killing any process on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
echo "Cleaning .next cache..."
rm -rf .next
echo "Starting fresh dev server..."
npm run dev
