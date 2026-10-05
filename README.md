# StateRush plugins for Claude Code

```
claude plugin marketplace add newaxislabs/staterush-plugins
claude plugin install staterush@staterush
```

Then run `/mcp` in Claude Code, choose **staterush**, and sign in with your StateRush account.
The plugin connects to the hosted StateRush board tools at https://app.staterush.com/mcp; it holds no keys.

The plugin's skills, which Claude uses when they apply:

- `staterush-doctor`: sign-in (including over SSH), workspace selection, refusal codes, fleet prerequisites.
- `staterush-line`: what a line is, the fleet tools that run one, and why a station isn't moving.
- `staterush-coordinator`: supervising a line: answering workers, selecting work, approvals, filing cards.

`plugins/staterush/client-guide.md` is the short guide the StateRush server gives Claude on connecting; the skills carry the detail.
Since 0.3.0 the plugin also carries the fleet tools that run a line, as built bundles under `plugins/staterush/dist/` (no source).
