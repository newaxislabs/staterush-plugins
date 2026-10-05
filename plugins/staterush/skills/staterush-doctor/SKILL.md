---
name: staterush-doctor
description: Doctor for the StateRush plugin. Use when the person asks whether StateRush is set up or signed in, which workspace or boards Claude can see, or when a StateRush board tool fails, is missing, or refuses with workspace-required.
---

# StateRush doctor

The plugin declares one MCP server, `staterush`, at `https://app.staterush.com/mcp`. It
holds no keys. The person signs in with their own StateRush account through Claude
Code's browser sign-in, and the board records what they do under their own name.

Work through the steps in order and stop at the first one that explains the problem.
Tell the person what you found in plain words, and say what they need to do next.

1. **Is the server connected and signed in?** Call the `workspaces` tool of the
   `staterush` server.
   - **No `staterush` tools are listed at all:** the person is not signed in yet. They
     run `/mcp` in Claude Code, choose `staterush`, then Authenticate. A browser
     opens on the StateRush sign-in page. After they sign in, check again.
   - **Sign-in keeps coming back, or the browser shows an error page:** say what the
     page said. If it names an unknown resource or audience, or `/mcp` shows the
     server as failed, the problem is on StateRush's side, not theirs. Ask them to
     send the exact message to whoever runs their StateRush.
   - **No browser on this machine (SSH, a container, a server):** browser sign-in
     cannot finish here. Use StateRush from a machine with a browser instead. The
     `staterush-login` command line tool has a device sign-in for headless use;
     offer to explain it.
   - **Board tools are listed but `workspaces` is not:** the StateRush server is
     older than this skill. Skip to step 3 and try `board` with a board name the
     person gives you.
2. **Which workspace does this connection serve?** Read the `workspaces` result.
   - **`selected` is present:** this connection serves that workspace. `boards` lists
     its board names, which is everything the board tools need as `board`. If
     `boards` is missing, the person has no permission to read boards in that
     workspace, and a workspace owner can grant it.
   - **No `selected`, and several workspaces with access `member`:** one address
     serves only one workspace, and this person belongs to several. Every board tool
     will refuse with `workspace-required` until they choose. Show them the list,
     then offer to add one server per workspace they want, each using that
     workspace's `url` from the result:

         claude mcp add --scope user --transport http staterush-<slug> <url>

     Each new server signs in once, the same way as step 1. Calls go to whichever
     server's tools you use, so name the workspace when you act.
   - **Only access `invited`:** the person has been invited but hasn't joined yet.
     They accept the invitation by signing in at https://app.staterush.com, then run
     `/mcp`, choose `staterush` and Reconnect.
   - **An empty list:** they belong to no workspace yet. They create one at
     https://app.staterush.com, or ask a workspace owner to invite them.
3. **Can it read a board?** Call `board` with one of the board names and
   `view: "columns"`. If that answers, everything works. For a refusal, read its
   `code` and tell the person what it means:
   - `workspace-required`: go back to step 2.
   - `PERMISSION_DENIED`: their role in this workspace doesn't allow this, and a
     workspace owner can change it.
   - `no-board` or `no-item`: the board or card name is wrong. Check it against `boards` from step 2.

## Things that look like faults but are not

- Some tools are missing from the list. Each tool appears only when the person's role
  allows it. A viewer sees reads and `workspaces`, a worker also sees the card writes,
  and `retire` needs permission to shape boards.
- The hosted `retire` tool retires a whole **board** and asks for the board's name to
  confirm. It never retires a card. To take a single card off the line, `finish` it with
  the verdict its column offers for that.
- The hosted `select` tool only lists the cards waiting at a station. To take one, use
  `claim` with that station and the card.
- To file a card, use `add` (title, column, and optionally `ref`, `class` and `fields`). To move it to another lane,
  use `reclassify` with a `class` and a `why`. To label it, use `set_theme` with a theme
  the board declares. Leave `theme` out to clear it.
- The hosted server has no transcript, watch or supervisor tools. Those stay in
  StateRush's own fleet tooling.

Never ask the person to paste a token, key or password into the chat, and never write
one into a file.
