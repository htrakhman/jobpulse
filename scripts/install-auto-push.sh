#!/bin/sh
# Installs a post-commit hook that auto-pushes to GitHub after every manual commit.
# Run this after cloning: ./scripts/install-auto-push.sh
#
# For auto-commit on file save, run: npm run auto:push (or npm run dev:all for dev + auto-push)

HOOK=".git/hooks/post-commit"
cat > "$HOOK" << 'EOF'
#!/bin/sh
# Auto-push to GitHub after every commit (Railway deploys from GitHub)
git push origin HEAD
EOF
chmod +x "$HOOK"
echo "✓ Auto-push hook installed."
echo "  - Manual commits will auto-push to GitHub."
echo "  - For auto-commit on save: npm run auto:push (or npm run dev:all)"
