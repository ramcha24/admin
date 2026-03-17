#!/usr/bin/env bash
# release.sh — bump version, package, and install Admin.app to ~/Applications/
# Run after merging a PR to main:
#   git checkout main && git pull && bash release.sh
set -e
cd "$(dirname "$0")"

# ── Guard: must be on main ────────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "❌  Must be on main to release (currently on '$BRANCH')"
  echo "    git checkout main && git pull && bash release.sh"
  exit 1
fi

# ── Guard: working tree must be clean (auto-generated files excluded) ─────────
# dev-status.json and README.md are auto-updated by the post-commit hook;
# commit them silently rather than blocking the release.
git add -f dev-status.json README.md 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -m "chore: update auto-generated files" --no-verify 2>/dev/null || true
fi
if ! git diff --quiet; then
  echo "❌  Uncommitted changes present. Commit or stash before releasing."
  exit 1
fi

# ── Bump patch version in package.json ───────────────────────────────────────
BUMP=${1:-patch}   # pass 'minor' or 'major' as first arg to override
OLD_VERSION=$(node -e "process.stdout.write(require('./package.json').version)")

node -e "
  const fs = require('fs')
  const pkg = require('./package.json')
  const [major, minor, patch] = pkg.version.split('.').map(Number)
  if ('$BUMP' === 'major') pkg.version = (major+1) + '.0.0'
  else if ('$BUMP' === 'minor') pkg.version = major + '.' + (minor+1) + '.0'
  else pkg.version = major + '.' + minor + '.' + (patch+1)
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
  process.stdout.write(pkg.version)
" > /tmp/admin-new-version.txt

VERSION=$(cat /tmp/admin-new-version.txt)
echo "🔖  Bumping $OLD_VERSION → $VERSION"

# ── Commit + tag version bump ────────────────────────────────────────────────
git add package.json
git commit --no-verify -m "chore: release v${VERSION}"
git tag "v${VERSION}"
echo "    Tagged v${VERSION}"

# ── Write ADMIN_PARENT path so the packaged app can find tools ────────────────
# The packaged .app's __dirname is inside the bundle; this file tells it where
# the real tools directory lives on this machine.
PARENT_DIR=$(cd .. && pwd)
echo "{\"adminParent\": \"$PARENT_DIR\"}" > electron/admin-parent.json
echo "    Baked ADMIN_PARENT: $PARENT_DIR"

# ── Build ────────────────────────────────────────────────────────────────────
echo "📦  Building Admin v${VERSION}..."
npm run package

# ── Find the .app in release/ ────────────────────────────────────────────────
APP_PATH=$(find release -name "*.app" -maxdepth 3 | head -1)
if [ -z "$APP_PATH" ]; then
  echo "❌  No .app found in release/ — packaging may have failed"
  exit 1
fi
APP_NAME=$(basename "$APP_PATH")

# ── Install to ~/Applications ─────────────────────────────────────────────────
mkdir -p "$HOME/Applications"
DEST="$HOME/Applications/$APP_NAME"
rm -rf "$DEST"
cp -r "$APP_PATH" "$DEST"

# ── Update tool.json with new launch.app path ─────────────────────────────────
node -e "
  const fs = require('fs')
  const p = './tool.json'
  const t = JSON.parse(fs.readFileSync(p, 'utf8'))
  t.launch = { ...(t.launch || {}), app: '$DEST' }
  t.version = '$VERSION'
  fs.writeFileSync(p, JSON.stringify(t, null, 2) + '\n')
"
git add tool.json
git commit --amend --no-edit --no-verify   # fold tool.json into the version bump commit

# ── Push to remote ───────────────────────────────────────────────────────────
echo "🚀  Pushing v${VERSION} to origin..."
git push --no-verify origin main --tags

echo ""
echo "✅  Admin v${VERSION} installed to ~/Applications/$APP_NAME"
echo "    Spotlight: search 'Admin' to launch the stable app"
echo "    Dev mode:  bash dev.sh (runs as 'Admin-dev', coexists with stable)"
