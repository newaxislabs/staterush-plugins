---
name: staterush-line
description: Running a StateRush line, where agents and scripts work a board unattended on the person's own machines. Use when the person asks what a line, station, lane or staffing is; wants to start, stop, restart or inspect a lane (dispatcher, script runner, relay, spy, watcher, keepalive) or find which version is running; asks how lane credentials work; or when a station looks staffed but its cards don't move, workers start and achieve nothing, or a column fills and never drains.
---

# Running a StateRush line

**Read the client guide first.** The plugin ships StateRush's client guide at
`../../client-guide.md` (relative to this skill's folder). Read it once per session before working with StateRush: it says what the board
tools do and how to use them well, and it may be the only copy you get, because the
hosted server's own instructions don't always reach Claude Code.

## The fleet tools ship as built bundles

The plugin carries each fleet tool as a self-contained bundle. For shell commands,
install the StateRush client launchers on `PATH` and invoke them as `staterush-*`.
Use `staterush-dispatch --help` to check the installation before starting a lane.
The Claude plugin alone does not put launchers on a session shell's `PATH`.
Never improvise a dispatcher, a polling loop, a cron job that claims cards,
or a script that drives the board API in their place. Reading the line through the
board tools (`board`, `card`, `line_health`, `questions`) needs no fleet tools at all.

## What a line is

A **board** is a pull line of columns. A column where work is done is a **station**.
The board's **staffing** says who works each station:

- **agent station:** the dispatcher starts an agent worker (Claude Code or another
  provider CLI) for each card the station should take. The worker claims the card,
  follows the station's runbook, and finishes it with a verdict.
- **script station:** the script runner runs a command for each card (checks, merge,
  deploy). The script's exit code is the verdict.
- **person station:** nothing is automatic. A person claims the card and finishes it.
  An unstaffed column that carries verdicts is a person station by definition.

A station can be staffed by **several machines**. Each staffing rule names a `driver`
(the hostname whose dispatcher serves it, or `any` for every machine) and may carry
`matches` over card fields, `class`, `theme` or `labourOwnerPrincipalId`. The last
matching rule wins a card, so "the Mac takes priya's cards" is rule 0 `driver: <the workstation's hostname>`
with no predicate, then rule 1 `driver: <the Mac's hostname>` matching field
`requester` equal to `priya`. A dispatcher serves only its own and `any` rules, and the
engine hands each rule only its own cards. When one machine's share starves,
`line_health` and the watcher name the rule index and its `driver`.

Work is pulled, never pushed: a finished card waits with its verdict until the next
station that accepts that verdict has room. Column and section limits (WIP) count
cards standing in the column, claimed or not.

A **lane** is one long-running fleet tool serving one board on one host, run by a
service supervisor (systemd, launchd, a SysV service, or cron plus a keepalive).

## The fleet tools

| tool | executable | its job |
|---|---|---|
| dispatcher | `staterush-dispatch <board> loop` | starts an agent worker per card an agent station should take; renews leases and records each worker's result |
| script runner | `staterush-run-scripts <board>` | runs the board's script stations; exit code is the verdict |
| relay | `staterush-relay start` | optional: receives workers' telemetry on loopback, redacts it, buffers to disk, forwards to StateRush. Without it workers run unobserved ("RELAY DOWN") but still work |
| spy | `staterush-spy` | streams a running worker's transcript to the web app when someone opens it |
| watcher | `staterush-watch run` | wakes a supervising Claude session when a person is needed (see `staterush-coordinator`) |
| keepalive | the person's supervisor or cron job | restarts a lane that has died; not a StateRush binary |

All require Node 20 or newer. The client tools also include `staterush-login`,
`staterush-board`, `staterush-wait`, `staterush-wake`, `staterush-owner`,
`staterush-verify`, `staterush-mcp` and `staterush-harness-adapter`. Each answers
`--help` with its usage or a one-line refusal naming what it needs. Configure the
supervisor with an absolute path to the installed launcher from
`command -v staterush-dispatch` (or the corresponding tool). Keep service
configuration outside the plugin directory so plugin updates don't erase it.

## Credentials

A lane authenticates with a **workspace API key** that a workspace owner issues in the
web app, plus the workspace id. Never use the person's own sign-in for a lane: lanes
run unattended, and their actions should be recorded as the lane, not as the person.

- `staterush-login` stores a key without it touching shell history: it reads exactly
  one key line from stdin, with `PULLBOARD_ENGINE` (e.g.
  `https://app.staterush.com/graphql`) set, and writes a mode-0600 credentials file.
  Leave `PULLBOARD_TENANT` unset: login asks StateRush which workspace the key belongs
  to. Only if it says StateRush could not tell, set `PULLBOARD_TENANT` to the workspace
  id, which a workspace owner can give the person. `PULLBOARD_API_KEY` and `PULLBOARD_TENANT`
  in a lane's environment override it.
- The relay uses its own ingest credential, `PULLBOARD_INGEST_API_KEY`.
- Never print a key, never put one on a command line or in the plugin directory, and
  never ask the person to paste one into the chat. Check that a credential exists by
  file mode and key *names*, not values.

## Where a board's scripts and runbooks live

The board owner's repository holds the script stations' commands and the station
runbooks (the instructions each agent station's workers follow). The live board's
staffing names those commands, so a script lane runs from a checkout of that
repository. Read the staffing and the runbook for a station before reasoning about
what its workers do. Never guess a board name, engine address, credential, actor or
station command.

## Start a lane

1. Read the lane's service configuration and check whether it is already running. Never
   launch a second copy: a dispatcher refuses to share a board, but other tools may not.
2. Verify the tool's installed launcher is on `PATH` and responds to `--help`.
   Point the service at its absolute launcher path if it names another installation.
3. Start it through its supervisor. Confirm a live main PID and read the log for
   startup refusals (a missing credential, an unknown board, a station preflight).

## Stop or restart a lane

- Stop through the supervisor so the tool gets **SIGTERM** and can settle. Never kill by
  a name match (it can hit the shell running it), and never remove its state files.
- **A dispatcher's SIGTERM is a handover, not a drain.** It records its running workers
  and exits without killing them; the next dispatcher for that board adopts them. Start
  the replacement at once: a handed-over worker has no one renewing its lease or
  recording its result until it is adopted. Check the new log for the adoption.
- To stop a board for good, run the dispatcher with `PULLBOARD_DISPATCH_STOP_MODE=drain`:
  SIGTERM then stops new work and waits for every worker to finish.
- A second SIGTERM escalates: it stops the recorded workers and releases their claims.
- Roll out a new version one lane at a time, confirming each lane's new PID and version
  before the next.

## Inspect a lane, and the version actually running

Read the service's state, main PID, command line and recent log. From the live PID's
command line (`ps -p <pid> -o args=`), identify the executable path and resolve any
symlink. A bundled tool
under `dist/` belongs to the plugin root one directory above; read its
`.claude-plugin/plugin.json` version. An npm launcher under `bin/` belongs to the
package root one directory above; read its `package.json` version. Report the
**running** version with the tool, PID and executable path. The current launcher on
`PATH` may point to a newer installation. If the live path can't be established,
say the running version is unknown.

## A station looks staffed but nothing moves

Ask the board first; don't infer. Call `line_health` and read every field:

- `awaitingAnswer`: open questions. A station whose cards are asking is waiting on a
  person, not starved. List them with `questions` and hand them to
  `staterush-coordinator`.
- `needsPerson`: how many cards the engine can prove are owed a person's decision. The
  watcher's `needs-person` wake names each card and its reason.
- `starvedStations`: stations with eligible work nobody is taking.
- `capacityCycles`: a loop of columns (say Check → Fix → Check) all full of finished
  cards, each waiting for the next. No worker is at fault. The board owner fixes it by
  capping the loop with a section limit below the sum of its column limits.
- `deliveryOrderWaits`: cards held behind predecessors that haven't finished.
- `blockedWork`, `capacityBlocked`: cards that can't advance, and cards held only by a
  full column or section downstream.

Then check the lane:

1. **Is the lane process running, and which version?** (above)
2. **Is spawning producing anything?** A fleet starting workers into a wall (provider
   usage limit, expired provider login, a broken runbook) looks exactly like a quiet
   line. Several workers in a row that exited at once with empty or near-empty output
   is the alarm. Read the newest worker's output and let the provider say why.
3. **A finished card that never left its column** (`DELIVERY_OVERDUE`, verdict set, no
   claim, downstream has room): delivery re-runs when the card is written to. A harmless
   `set_fields` on the unheld card usually moves it within seconds.
4. **Nobody serves the column at all:** an unstaffed column with work waiting needs a
   person (`BY_HAND_VERDICT`), or the staffing is missing a rule. Say which; don't guess.
5. **One machine's share is starved:** on a station several machines staff, a starved
   rule's `driver` says whose dispatcher isn't taking its cards. Check that machine's
   lane, and that its hostname is exactly the rule's `driver`.

Rules that cost real nights to learn:

- **Liveness is not progress.** A running process, CPU and growing logs prove a worker is
  alive, not that it is getting anywhere. Silence alone proves nothing either: a worker
  thinking hard looks like a dead one.
- **Act only on a broken promise:** a lapsed lease, a dead process, or the absence of
  all activity. Never act on a stall you inferred. A health check has authority over
  processes, never over cards.
- **Stopping a lane the wrong way strands claims.** A killed worker can't release its
  card; the claim stands until its lease lapses or a dispatcher releases it.
- **Read every command's result.** A refusal is the answer, not a cue to try another route.
