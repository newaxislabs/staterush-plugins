---
name: staterush-setup
description: Start guided local StateRush setup from a Claude plugin without requiring a command line launcher.
---

# Set up a local StateRush station

Ask the person for the StateRush engine URL if it is not already configured as `PULLBOARD_ENGINE`. The plugin carries the setup bundle. Run its bootstrap from Claude Code:

```sh
PULLBOARD_ENGINE="<the person's StateRush HTTPS endpoint>" /bin/sh "$CLAUDE_PLUGIN_ROOT/skills/staterush-setup/start.sh"
```

The bootstrap checks Node 20 or newer and starts guided setup. Answer its workspace, board, and consent prompts with the person; do not infer consent. It installs user launchers for the local tools and adds the user's bin directory to the shell login profile when safe. If the profile is unsafe or unwritable, show the exact repair line and target file printed by setup.

Open a fresh terminal after setup. Verify with `command -v staterush-setup`, `command -v staterush-login`, and `command -v staterush-station`.
