---
name: staterush-doctor
description: Doctor for the StateRush plugin. Use when the person asks whether StateRush is set up or signed in, which workspace or boards Claude can see, when sign-in fails or lands on a localhost page that won't load (often over SSH), when a StateRush board tool is missing or refuses with a code (workspace-required, PERMISSION_DENIED, not-owner, wip-full and the like), or before running fleet tools to check this machine meets their prerequisites.
---

# StateRush doctor

The plugin declares one MCP server, `staterush`, at `https://app.staterush.com/mcp`. It
holds no keys. The person signs in with their own StateRush account through Claude
Code's browser sign-in, and the board records what they do under their own name.

Work through the steps in order and stop at the first one that explains the problem.
Tell the person what you found in plain words, and say what they need to do next.

## 1. Is the server connected and signed in?

Call the `workspaces` tool of the `staterush` server.

- **No `staterush` tools are listed at all:** the person is not signed in yet. They run
  `/mcp` in Claude Code, choose `staterush`, then Authenticate. A browser opens on the
  StateRush sign-in page. After they sign in, check again.
- **The browser ends on `http://localhost:<port>/...` and the page won't load:** Claude
  Code is running on another machine (SSH, a VM, a container). Claude Code waits for the
  sign-in on that machine's `localhost:<port>`, but the browser went to the person's own
  machine. Either:
  - from a new terminal on their own machine, forward the port and reload the failed page:
    `ssh -L <port>:localhost:<port> <user>@<remote-host>` (use the port number in the
    failed address, and the same host they ssh to), or
  - open the sign-in link in a browser running on the remote machine itself.
  If the page was closed, start again from `/mcp` → Authenticate; the port can change
  each time, so forward the new one.
- **No browser anywhere (a headless server):** browser sign-in cannot finish there. Use
  StateRush from a machine with a browser instead. The `staterush-login` command line
  tool has a device sign-in for headless use; offer to explain it.
- **Sign-in keeps coming back, or the browser shows an error page:** say what the page
  said. If it names an unknown resource or audience, or `/mcp` shows the server as
  failed, the problem is on StateRush's side, not theirs. Ask them to send the exact
  message to whoever runs their StateRush.
- **A tool refuses with `AUTHENTICATION_REQUIRED`:** the sign-in has expired or was
  revoked. `/mcp` → `staterush` → Reconnect (or Authenticate).
- **Board tools are listed but `workspaces` is not:** the StateRush server is older than
  this skill. Skip to step 3 and try `board` with a board name the person gives you.

## 2. Which workspace does this connection serve?

Read the `workspaces` result.

- **`selected` is present:** this connection serves that workspace. `boards` lists its
  board names, which is everything the board tools need as `board`. If `boards` is
  missing, the person has no permission to read boards in that workspace, and a
  workspace owner can grant it.
- **No `selected`, and several workspaces with access `member`:** one address serves only
  one workspace, and this person belongs to several. Every board tool will refuse with
  `workspace-required` until they choose. Show them the list, then offer to add one
  server per workspace they want, each using that workspace's `url` from the result:

      claude mcp add --scope user --transport http staterush-<slug> <url>

  Each new server signs in once, the same way as step 1. Calls go to whichever server's
  tools you use, so name the workspace when you act.
- **Only access `invited`:** the person has been invited but hasn't joined yet. They
  accept the invitation by signing in at https://app.staterush.com, then run `/mcp`,
  choose `staterush` and Reconnect.
- **An empty list:** they belong to no workspace yet. They create one at
  https://app.staterush.com, or ask a workspace owner to invite them.

## 3. Can it read a board?

Call `board` with one of the board names and `view: "columns"`. If that answers,
everything works. A refusal carries a `code`; read the whole message too, because it
usually names the card, column or holder involved.

| code | what it means | what to do |
|---|---|---|
| `workspace-required` | this connection has no workspace selected | step 2 |
| `AUTHENTICATION_REQUIRED` | sign-in expired or missing | step 1 |
| `PERMISSION_DENIED` | their role here doesn't allow this | a workspace owner can change the role |
| `no-board`, `board-retired` | wrong board name, or the board is retired (history only) | check `boards` from step 2 |
| `no-item`, `no-column` | wrong card ref or column name | read the board and use its exact names |
| `unclaimed` | only the card's holder can do that, and nobody holds it | `claim` it first |
| `not-owner` | someone else holds the card; the message names them | leave it, or ask the holder |
| `claimed`, `claim-changed` | the card changed hands while you acted | read the card again before retrying |
| `lease-expired` | your claim lapsed | claim again if the work is still yours |
| `wip-full`, `section-full` | the column or section is at its limit | wait for it to drain; don't force it |
| `not-accepted`, `wrong-column` | that station never takes this card | it belongs to another station |
| `not-here` | the station will get this card, but it hasn't been delivered yet | wait |
| `no-queue-jumping` | another card is ahead in that column's order | take the one the board offers, or ask |
| `waiting-on-predecessor` | the card's `delivery_order` names unfinished cards | see the coordinator skill |
| `duplicate-ref` | that ref is already used on this board | pick another ref |
| `UNDECLARED_THEME` | the board doesn't declare that theme | use one the board declares |
| `BOARD_WRITE_RETRYABLE` | a transient write conflict | retry once |
| `result-too-large` | the read was too big | use `limit` and `cursor`, or a narrower `section` |

## 4. Before running a line: fleet prerequisites

Only when the person wants to run agents unattended on their own machine (see the
`staterush-line` skill). Check each and report what is missing:

- **Node 20 or newer:** `node --version`.
- **The fleet tools are present** in the installed plugin: `ls "$CLAUDE_PLUGIN_ROOT/bin"`
  should list `staterush-dispatch.js`, `staterush-run-scripts.js`, `staterush-relay.js`,
  `staterush-spy.js` and `staterush-watch.js`. This plugin release does not include them
  yet; if they are absent, say so plainly and stop. Do not substitute other tools.
- **A lane credential:** a workspace API key issued by a workspace owner in the web app,
  stored on this machine for the lane (never the person's own sign-in, never pasted into
  chat). Check that a credential is configured without printing it.
- **The board's own station scripts and runbooks** are checked out from the board
  owner's repository, if the board has script stations.

## Things that look like faults but are not

- Some tools are missing from the list. Each tool appears only when the person's role
  allows it. A viewer sees reads and `workspaces`, a worker also sees the card writes,
  and `retire` needs permission to shape boards.
- The hosted `retire` tool retires a whole **board** and asks for the board's name to
  confirm. It never retires a card. To take a single card off the line, claim it and
  `finish` it with the verdict its column offers for that (often `abandoned`).
- The hosted `select` tool only lists the cards waiting at a station. To take one, use
  `claim` with that station and the card.
- To file a card, use `add` (title, column, and optionally `ref`, `class` and `fields`).
  To move it to another lane, use `reclassify` with a `class` and a `why`. To label it,
  use `set_theme` with a theme the board declares. Leave `theme` out to clear it.
- A board can't be created from here yet: use https://app.staterush.com, "New board".
- The hosted server has no transcript, watch or supervisor tools. Those belong to the
  fleet tooling that runs a line (see `staterush-line`).

Never ask the person to paste a token, key or password into the chat, and never write
one into a file or a command line.
