#!/bin/bash
# CC Hubber Release Script
# Usage: ./release.sh [patch|minor|major]
# Default: patch (0.5.4 → 0.5.5)

set -e

BUMP=${1:-patch}
cd "$(dirname "$0")"

echo "=== CC Hubber Release ==="
echo ""

# 1. Run smoke tests
echo "1. Running smoke tests..."
node test/smoke.js
echo ""

# 2. Bump version
echo "2. Bumping version ($BUMP)..."
npm version "$BUMP" --no-git-tag-version
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "   New version: v$VERSION"
echo ""

# 3. Commit + tag + push
echo "3. Committing and pushing..."
git add package.json
git commit -m "bump to v$VERSION"
git tag "v$VERSION"
git push
git push origin "v$VERSION"
echo ""

# 4. Publish to npm
echo "4. Publishing to npm..."
npm publish
echo ""

# 5. Create GitHub release
echo "5. Creating GitHub release..."
gh release create "v$VERSION" --title "v$VERSION" --generate-notes
echo ""

echo "=== Done! v$VERSION released ==="
echo "npm: https://www.npmjs.com/package/cchubber"
echo "GitHub: https://github.com/azkhh/cchubber/releases/tag/v$VERSION"
