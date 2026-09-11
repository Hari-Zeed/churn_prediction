#!/usr/bin/env bash
# scripts/check-secrets.sh
# ─────────────────────────────────────────────────────────────────────────────
# Pre-commit hook: scans staged files for common secret patterns.
# Install: cp scripts/check-secrets.sh .husky/pre-commit && chmod +x .husky/pre-commit
# Or run manually: bash scripts/check-secrets.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # no color

echo "🔍 Scanning staged files for secrets..."

# Patterns that indicate a real secret (not a placeholder)
SECRET_PATTERNS=(
  "GOCSPX-[A-Za-z0-9_-]"          # Google OAuth client secret
  "eyJhbGciOiJFZERTQSI"            # Turso / EdDSA JWT (base64 header)
  "eyJhbGciOiJIUzI1NiI"            # HS256 JWT (base64 header)
  "sk-[a-zA-Z0-9]{32,}"            # OpenAI API key
  "NEXTAUTH_SECRET=[A-Za-z0-9+/=]{20,}"  # Filled-in NEXTAUTH_SECRET
  "authToken.*eyJ"                 # Any authToken with JWT value
  "-----BEGIN.*PRIVATE KEY-----"   # PEM private key
)

# Get list of staged files (excluding deleted)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

if [ -z "$STAGED_FILES" ]; then
  echo "  ✅ No staged files to scan."
  exit 0
fi

FOUND=0

for pattern in "${SECRET_PATTERNS[@]}"; do
  matches=$(echo "$STAGED_FILES" | xargs grep -El "$pattern" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo -e "${RED}❌ POTENTIAL SECRET FOUND${NC} matching pattern: ${YELLOW}${pattern}${NC}"
    echo "$matches" | while read -r f; do
      echo "   → $f"
    done
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo -e "${RED}COMMIT BLOCKED.${NC} Remove secrets before committing."
  echo "Move secrets to .env.local (never committed) and use process.env in code."
  echo "See .env.example for the safe template."
  exit 1
fi

echo "  ✅ No secrets detected in staged files."
exit 0
