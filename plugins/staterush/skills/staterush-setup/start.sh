#!/bin/sh
# Start bundled guided setup, or install user launchers after a successful setup.
set -eu
home=${HOME:?HOME is required}
plugin=${CLAUDE_PLUGIN_ROOT:-}
if [ "${1:-}" != "--install-only" ]; then
  if ! command -v node >/dev/null 2>&1; then
    case "$(uname -s)" in
      Darwin) echo 'Node 20 or newer is required. Install Node with Homebrew: brew install node' >&2 ;;
      *) echo 'Node 20 or newer is required on Linux. Install Node 20 or newer from your distribution or nodejs.org.' >&2 ;;
    esac
    exit 2
  fi
  version=$(node --version 2>/dev/null || true)
  major=$(printf '%s' "$version" | sed -n 's/^v\([0-9][0-9]*\).*/\1/p')
  if [ -z "$major" ] || [ "$major" -lt 20 ]; then
    case "$(uname -s)" in
      Darwin) echo 'Node 20 or newer is required. Install Node with Homebrew: brew install node' >&2 ;;
      *) echo 'Node 20 or newer is required on Linux. Install Node 20 or newer from your distribution or nodejs.org.' >&2 ;;
    esac
    exit 2
  fi
  plugin=${plugin:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}
  node "$plugin/dist/staterush-setup.mjs" "$@"
  # The bundled command normally installs these. This also supports older bundles.
fi
bindir=$home/.local/bin
data=$home/.local/share/staterush
for location in "$home/.local" "$home/.local/bin" "$home/.local/share" "$data" "$data/launcher.mjs" "$data/npm-root"; do
  if [ -L "$location" ]; then echo "StateRush: refusing symlink $location" >&2; exit 2; fi
done
mkdir -p "$bindir" "$data"
chmod 700 "$data"
cat > "$data/launcher.mjs" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const tool = path.basename(process.argv[2]);
const home = process.env.HOME;
const registryPath = path.join(home, '.claude/plugins/installed_plugins.json');
let target;
try {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const installs = Object.entries(registry.plugins ?? {})
    .filter(([key]) => key.startsWith('staterush@'))
    .flatMap(([, entries]) => Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.scope === 'user' && path.isAbsolute(entry.installPath ?? ''));
  if (installs.length !== 1) throw new Error(`expected one user StateRush plugin installation, found ${installs.length}`);
  const root = installs[0].installPath;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  if (manifest.name !== 'staterush') throw new Error('installed plugin is not StateRush');
  target = path.join(root, 'dist', `${tool}.mjs`);
} catch (error) {
  // npm installations supply a separate stable target, if no plugin is installed.
  const fallback = path.join(home, '.local/share/staterush/npm-root');
  try { target = path.join(fs.readFileSync(fallback, 'utf8').trim(), 'bin', `${tool}.js`); }
  catch { console.error(`StateRush launcher: ${error.message}`); process.exit(2); }
}
if (!fs.existsSync(target)) { console.error(`StateRush launcher: missing ${target}`); process.exit(2); }
const result = spawnSync(process.execPath, [target, ...process.argv.slice(3)], { stdio: 'inherit', env: process.env });
if (result.error) { console.error(`StateRush launcher: ${result.error.message}`); process.exit(2); }
process.exit(result.status ?? 2);
JS
if [ -n "${STATERUSH_SOURCE_BIN:-}" ]; then
  printf '%s\n' "$(CDPATH= cd -- "$STATERUSH_SOURCE_BIN/.." && pwd)" > "$data/npm-root"
fi
for name in staterush-setup staterush-login staterush-station staterush-board staterush-dispatch staterush-run-scripts staterush-relay staterush-watch staterush-wait staterush-wake staterush-mcp staterush-owner staterush-verify staterush-spy staterush-harness-adapter; do
  target=$bindir/$name
  if [ -L "$target" ]; then echo "StateRush: refusing symlink $target" >&2; continue; fi
  if [ -e "$target" ] && ! grep -q '^# StateRush managed launcher$' "$target" 2>/dev/null; then
    echo "StateRush: preserving existing $target" >&2
    continue
  fi
  cat > "$target" <<'LAUNCH'
#!/bin/sh
# StateRush managed launcher
exec node "$HOME/.local/share/staterush/launcher.mjs" "$0" "$@"
LAUNCH
  chmod 755 "$target"
done
case "${SHELL:-}" in
  */zsh) profile=$home/.zprofile ;;
  */bash)
    if [ -e "$home/.bash_profile" ] || [ -L "$home/.bash_profile" ]; then profile=$home/.bash_profile
    elif [ -e "$home/.bash_login" ] || [ -L "$home/.bash_login" ]; then profile=$home/.bash_login
    else profile=$home/.profile
    fi ;;
  *) profile=$home/.profile ;;
esac
line='export PATH="$HOME/.local/bin:$PATH"'
if [ -L "$profile" ] || { [ -e "$profile" ] && [ ! -f "$profile" ]; } || { [ -e "$profile" ] && [ ! -w "$profile" ]; }; then
  echo "StateRush: add $line to $profile (profile is unsafe or unwritable)" >&2
elif ! grep -Fxq "$line" "$profile" 2>/dev/null; then
  printf '\n%s\n' "$line" >> "$profile" 2>/dev/null || echo "StateRush: add $line to $profile" >&2
fi
echo "StateRush launchers installed in $bindir. Open a fresh shell and run: command -v staterush-setup"
