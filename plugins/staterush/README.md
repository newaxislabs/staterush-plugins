# @newaxislabs/staterush-client

The StateRush client tools: everything a StateRush board operator runs on their
own machines. One install, one version, one upgrade path. Node >= 20, plain ESM,
no dependencies, no build step.

In loop mode, the dispatcher has a no engine call watchdog. Its limit in seconds
is `max(safety poll seconds + 2 × dispatch interval seconds, 3 × dispatch interval seconds)`.
With the default 60 second safety poll and 10 second dispatch interval, the
limit is 80 seconds. An engine call attempt or completion resets the limit;
ordinary idle safety polls keep the dispatcher alive. If the limit expires, the
dispatcher logs the elapsed duration, writes a durable handover for live workers,
and exits nonzero so a service supervisor can start a replacement.

`PULLBOARD_DISPATCH_VERDICTLESS_LIMIT` (default 3) caps verdict-less respawns.
A worker that exits still holding its claim, without finishing the card or
asking a question, is receipted with outcome `exited-without-verdict`, and its
receipt points at the tail of its output. After that many such exits in a row
on one card at one station, counted from the receipt files so a restart keeps
the count, the dispatcher asks a question on the card naming the station and the
count, and keeps the claim instead of starting another worker. A finish or a
question asked by a worker in between starts the count again. The parking
question itself does not, so answering it allows one more attempt: a further
verdict-less exit parks the card again at once.

One station can be staffed by several machines. The dispatcher serves every
managed runbook rule whose `driver` is its own hostname, `any`, or empty, skips
(and says so) a rule driven by another host, and names the rule's zero-based
index on every claim. Which cards a rule takes is the engine's decision, from the
rule's `selects` and `matches` (card fields, `class`, `theme`,
`labourOwnerPrincipalId`, and the claiming worker's identity; the last matching
rule wins). Holds on an `any` rule are not reported to the engine, because
several hosts share it.

A rule can also match on who is claiming. The engine compares each worker term
with the worker that asks for the card: `workerMachine` is the machine it runs
on, `workerHumanPrincipalId` is the person it works for, and
`workerPrincipalId` is the worker's own identity. Every term in `matches` must
hold. For example, Ana's laptop runs a worker for her:

```
rule 0: driver: any, no predicate
rule 1: driver: any, matches:
  - {attribute: field, key: requester, equalTo: ana}
  - {attribute: workerMachine, equalTo: ana-laptop}
  - {attribute: workerHumanPrincipalId, equalTo: ana}
```

Ana's cards are claimable only by a worker on `ana-laptop` working for Ana, and
everything else goes to whoever claims under rule 0. If Ben borrows the laptop,
his worker still matches `workerMachine`, but its `workerHumanPrincipalId` is
`ben`, so the claim on one of Ana's cards is refused: the engine names rule 1
and `failedPredicate: workerHumanPrincipalId`. Add
`{attribute: workerPrincipalId, equalTo: ana-reviewer}` to pin one worker; a
different worker on the same laptop for the same person is then refused with
`failedPredicate: workerPrincipalId`. The engine checks worker terms in order
and reports the first that fails.

Operators see this in two places. In the MCP tools, `staterush_select` returns
the card with an `eligibility` object for the configured selection station:
`claimable`, `rule` and `ruleId` (the rule that decided), `failedPredicate` (the
worker attribute that did not match, or null), `requiredFacts`,
`cardHumanPrincipalId` and `preparationMachine`, and beside it `worker` (the
`principalId`, `humanPrincipalId`, `machine`, `harness` and `model` the engine
saw). A claim the engine refuses arrives as `engine-refused`, with the reason
appended as `[{"staffingRule":1,"failedPredicate":"workerHumanPrincipalId"}]`.

Older engines that lack `workerCandidates` have no eligibility details:
`staterush_select` answers with the plain card and no `eligibility` object.
Such an engine does not evaluate the worker identity terms, so do not rely on
them there; an older engine may reject a rule that uses them.
When a rule has no explicit concurrency, its worker cap follows the column WIP limit.
An explicit concurrency sets that rule's cap independently of other rules.

| bin | does |
|---|---|
| `staterush-run-scripts` | serves a board's script stations |
| `staterush-board` | the board from a shell: a station script or worker notes, asks, answers, finishes, releases or renames its card, or reads a card or the board, with one JSON document out and a retry-safe exit code (`docs/BOARD-CLI-CONTRACT.md`) |
| `staterush-relay` | receives OTLP/HTTP JSON from agent CLIs on loopback, redacts before egress, buffers to disk, delivers to the engine's ingest and fans out to the customer's own collector |
| `staterush-watch` | durable subscriptions to board events, needs-person, absence and starvation facts, delivered to a live session, an inbox or a fallback |
| `staterush-wait` | waits read-only in the foreground for matching board events or needs-person rows |
| `staterush-wake` | tries local-only delivery to a named live Claude Code or Codex session |
| `staterush-mcp` | MCP board tools for interactive sessions, carrying the telemetry nudge |
| `staterush-owner` | exports, previews and applies a board's shape, staffing, instructions, highlights and filters |
| `staterush-login` | stores a workspace credential for a hosted engine |
| `staterush-setup` | guided dispatcher setup: one device sign-in, choose a workspace and board, consent, start the board's lane and report a dispatcher dry run |
| `staterush-verify` | proves one installed provider round trip end to end |
| `staterush-harness-adapter` | runs a provider CLI that does not speak the harness output contract, passes its output through, and on the line announcing its session writes the contract `session` event and binds that session for the relay (`--profile codex\|claude -- COMMAND ...`) |

Every tool talks to the engine through ONE board client, `src/board.js`; see
[`docs/BOARD-CLIENT-CONTRACT.md`](docs/BOARD-CLIENT-CONTRACT.md). Environment
variables keep their `PULLBOARD_*` names.

Completion writes (`note`, `setFields`, and `finish`) keep their idempotency key
and exact request in the execution state directory until confirmed. Concurrent
live processes get distinct keys, as do writes with different actions or input.
After an unconfirmed writer exits, a later write with the same claim, actor,
action, and byte-identical input reclaims its key. The engine may replay that
write as one effect; callers should treat such a later write as a retry.

```
agent CLI ──OTLP/HTTP JSON──▶ relay on 127.0.0.1 ──▶ engine ingest ──▶ board
                                 │  redact, buffer to disk, batch, retry
                                 └──▶ the customer's existing collector
```

We ship our own relay rather than `otelcol-contrib`: ~250 MB per platform, a
service manager on each of three OSes, Windows code signing, and we would use
about 5% of it.

## Outbound telemetry allowlist

The relay applies one fail-closed projection immediately before every outbound
send, independently of identifier redaction. `PULLBOARD_REDACT=off` may disable
identifier substitution, but it never disables this egress boundary. The exact
product contract is [`specs/relay-egress-allowlist.json`](specs/relay-egress-allowlist.json).

That contract separately names the permitted OTLP structural fields by their
exact container path, plus attribute keys, for Claude and Codex logs, metrics,
and traces. A field allowed at one path is not allowed at another; nested metric
containers are rebuilt from their local lists rather than copied whole. Provider
items containing an unknown field or attribute key are omitted while valid sibling
items continue. Relay health exposes only a cumulative dropped item count in
`egressDroppedItems`; neither health nor diagnostics retains or reports the
dropped value. Arbitrary provider log bodies are never copied: when an allowed
`event.name` attribute is present, the outbound log body is derived from that
value; otherwise the body is omitted.

Projection happens from durable records at send time, so fresh delivery,
fanout, retries after restart, legacy spool recovery, and quarantine replay all
use the same rule and deterministic bytes.

## Live sessions and supervision

### Live-session watch delivery

`staterush-watch register` optionally accepts `--session-provider claude|codex
--session-id ID`; Codex also uses `--codex-sock PATH` (or
`PULLBOARD_CODEX_APP_SERVER_SOCK`). A targeted subscription tries that live
session first and then uses its unchanged inbox, command, provider, or webhook
fallback on every refusal. An untargeted subscription keeps the previous path.
Renewals retain or update that target without putting credentials in argv.

Both live protocols are local-only, undocumented, and version-bound. Unknown
versions are refused instead of guessed. `codex exec` workers have no app-server
and therefore cannot receive this live path. Claude peer tokens are read only
from owner-protected local session files and are never accepted on a command
line or written to delivery state or diagnostics.

Claude live delivery is unconfirmed and must never be used alone as an
acknowledgement: the socket write is only a nudge, so the configured inbox or
fallback must acknowledge before watch progress advances. A Claude session in
bypass-permission mode holds messages from unattested local peers unless its
user opts in with `crossSessionInbound=accept`; the watcher reports `held` only
when authoritative receiver evidence is available. Codex `turn/start` results acknowledge live delivery;
they suppress duplicate fallback delivery.

Each watch also declares its supervision class and duties. `JUDGEMENT` is the
default for a live session or person-read inbox; `MECHANICAL` is the default for
a pure alarm or script watch. `--role` overrides that classification,
and repeated `--duty` options override the derived duties: `action=ask` supplies
`ANSWER_QUESTIONS`, `absence` supplies `ABSENCE`, and `starved>=N` supplies
`STARVATION`. Declarations are stored with the local subscription and reused by
explicit and run-loop renewals. They are projected only when GraphQL
introspection proves the corresponding register or renew input supports them.


### Claude Code plugin (people)

The public repository `newaxislabs/staterush-plugins` is a Claude Code marketplace
(marketplace `staterush`) with one plugin, `staterush`. The plugin declares the hosted
StateRush MCP by URL (`https://app.staterush.com/mcp`, `.mcp.json`), with no keys: the
person signs in with their own StateRush account through Claude Code's `/mcp` →
Authenticate, and the board records their actions as theirs. It ships three skills
(`skills/`): `staterush-doctor` (sign-in, workspace selection, refusal codes, fleet
prerequisites), `staterush-line` (lines, stations, the fleet tools and lanes) and
`staterush-coordinator` (supervising a line), plus `client-guide.md`, the text the server
sends on MCP initialize. The fleet tools ship as built bundles, never as source:
`npm run build` (esbuild, a dev dependency) writes one minified ESM file per tool to
`dist/` (git-ignored) plus the runtime assets they read, and the public plugin carries
`.claude-plugin/plugin.json`, `.mcp.json`, `README.md`, `client-guide.md`, `skills/`,
`hooks/` and `dist/`. `ops/tools/publish-plugin.sh` builds, stages through
`scripts/stage-public-plugin.mjs` (the allow-list and leak scan the tagged release also
uses), smoke-runs every bundle from the staged plugin, validates and commits.

If someone invited you to a workspace, the invitation sends no email and has
no acceptance link. Ask the inviter which email they used if you are unsure.

In Claude Code, install the marketplace and plugin in this order:

    /plugin marketplace add newaxislabs/staterush-plugins
    /plugin install staterush@staterush

Restart Claude Code after installing. Open `/mcp`, choose `staterush` under
Built-in MCPs, and select Authenticate to sign in with the invited verified
email. Your first authenticated `/mcp` request accepts a matching pending
invitation, and the workspace appears. If you were already signed in when
invited, use `/mcp` → `staterush` → Reconnect (or Authenticate) to sign in again
with that email.
Ask Claude to call `workspaces`, choose the workspace and a board it lists, then
call `board` with that board name and `view: "columns"`. A board response confirms
interactive access. If `workspaces` returns an empty list, check that you signed
in with the exact invited email and ask the inviter or workspace owner to verify
the invitation. If `/mcp` shows a refusal, read its reason and follow its web URL.

An optional local lane comes later, only if you want unattended workers on your
machine. It uses a separate workspace-issued machine credential (a workspace
API key), never your personal browser sign-in. Install the client launchers on
`PATH` separately from the Claude plugin, then use `staterush-setup` for guided
lane setup; the `staterush-line` skill explains its prerequisites.

Each tagged release must match the versions in `package.json` and
`.claude-plugin/plugin.json`. The latter is Claude Code's plugin version; the
marketplace entry has no separate version. The tagged GitHub release includes
generated changelog notes. To get a new version, run this in Claude Code:

    /plugin marketplace update staterush

Or run `claude plugin update staterush@staterush` in a shell. Claude Code starts
with background updates off for this marketplace; `staterush-setup` enables
auto-update unless your user settings already specify true or false. To change it, open `/plugin`, select
Marketplaces, select `staterush`, then select Enable auto-update or Disable
auto-update. To stay on a specific release, remove the marketplace and add its
tagged ref (for example, `/plugin marketplace add newaxislabs/staterush-plugins#v0.1.0`),
then install `staterush@staterush` from that pinned marketplace.

One address serves one workspace. A person in several workspaces adds one server per
workspace with the `/mcp/<slug>` URL the `workspaces` tool gives; the doctor skill walks
through it. Unattended seats and the fleet keep the local `staterush-mcp` below and
their machine keys.

### Supervisor plugin

The npm package is also a supervisor plugin for Codex (`.codex-plugin`, whose server is
`.codex-mcp.json`). It loads the packaged `codex/skills/staterush-supervisor/SKILL.md` (kept out of
`skills/`, which the Claude Code plugin loads, because it names the local `staterush_*`
tools the hosted server does not have) and
the actor-bound `staterush-mcp` server; no plugin files need to be copied into a
customer repository. Configure `PULLBOARD_ENGINE`, `PULLBOARD_API_KEY`,
`PULLBOARD_TENANT`, `PULLBOARD_BOARD`, and `PULLBOARD_ACTOR` as for the original
seven MCP tools; the MCP transport sends the configured machine credential,
workspace, and delegated actor on every engine request. Then set
`PULLBOARD_SUPERVISOR_ID`, `PULLBOARD_SUPERVISOR_SESSION`, and
`PULLBOARD_SUPERVISOR_HOST` to register a judgement supervisor and expose the
four supervisor tools. `PULLBOARD_SUPERVISOR_SELECT_STATION` names the board's own selection
station; there is no default, because station names belong to each board. A Claude
supervisor may opt into session-descendant live delivery by setting
`PULLBOARD_SUPERVISOR_WATCH_SUBSCRIPTION` to the id of its existing durable
watch subscription. The subscription must name the same Claude session; the
MCP process shares its registry cursor with the host watcher and stops polling
and renewing the supervisor when its stdio session closes.

The plugin can list and answer questions, select an eligible named card, retire
a designated card, and read starvation or absence evidence. It cannot override
the configured actor, workspace, or board, and it exposes no restart operation.

`staterush_rename` takes `{card, ref}` and renames a card on the configured
board, returning it with its new current ref. A former ref keeps working: reading
the card through any old ref reaches the same card, and the answer names the
current ref. Collisions with a current or former ref, a blank ref, and
an unauthorised rename come back as the engine's refusal. From a shell,
`staterush-board rename BOARD CARD NEW_REF` does the same
(`docs/BOARD-CLI-CONTRACT.md`).

`staterush_retitle` takes `{card, title, why}` and changes a card's title on the
configured board without changing its ref. Use `staterush_rename` to change the
ref instead. The engine decides whether to accept a title edit and returns its
reason and message if it refuses one.

`staterush_read_staffing` takes `{column}` and returns that column of the configured
board with its staffing rules as the engine answers them (shape, concurrency, mode,
runbook, `githubRunbookSource { repository path requestedRef }`, model, command and
matches). `staterush_set_staffing` takes `{column, staffing}` and sends the list whole
in one `staff` mutation: it REPLACES the column's staffing, and `[]` leaves the column
unserved. Both are offered on every seat; the engine decides who may staff a column,
and its refusals (`bad-staffing`, `no-column`, ...) come back as tool errors.

`staterush_runbook` takes `{reference}` and reads that runbook revision on the
configured board. It returns the engine's name, revision, body, author, time and
GitHub source, including the source commit when present. An unknown reference
comes back as a not-found tool error.

The tools are named `staterush_board`, `staterush_claim`, `staterush_finish` and
so on. They were `pb_*` before the StateRush rename: for one release an old name
still calls its tool, with one deprecation line on stderr, but `tools/list`
offers only the new names and an old name reaches only a tool the session is
already offered. Environment variables, state directories and the engine's own
wire names are unchanged.

## The four seams

`src/seams.js` is the **single source of truth for the world** (PB-12), exactly as
`src/config.js` is for the port. Everything outside this process — time, the
network, a child process, someone else's liveness — is reached through one of four
injectable objects, and nothing else in `src/` may touch `setTimeout`, `Date.now`,
`fetch`, `node:net`/`http`/`https`/`tls`/`dgram`, `node:child_process` or
`process.kill`. The suite greps for it and fails, because a component that grabs
those directly cannot be handed a different world, so it cannot be proved without
real time and a real network.

`src/board.js` is the one other boundary: it is the GraphQL transport, so it holds
its request timer and takes a `fetch`. Tools hand it their world with
`boardFromConfig(config, { sender })` (`src/board-world.js`), which carries every
request over the sender seam, so a test that substitutes the sender still runs the
one real transport.

```js
seams(overrides = {}) -> frozen { clock, sender, spawner, probe }
    clock   { now(): epochMillis, after(ms, fn): cancel }
    sender  { send({ url, method, headers, body }): Promise<{status, headers, body}> }
    spawner { spawn(command, args, options): childHandle }
    probe   { isListening({ host, port, timeoutMs }): Promise<boolean>,
              isAlive(pid): boolean }
```

Seams you do not name are the **real** implementations, so production code is real
by default and there is no "am I under test" branch anywhere — a subject that
behaves differently when observed is the opposite of the point. Callers take a
world as a defaulted argument (`probe(config, timeoutMs, world = seams())`) rather
than reaching for the factory mid-function.

The substitutes live beside the tests in `test/fakes.js`, out of the shipped
`files` list: `fakeClock({ start })` adds `advance(ms)` and `pending()`, and
`recordingSender({ respond })` adds `sent[]` holding each request unaltered. A
retry, a backoff or a flush timer is therefore proved by **advancing time and
watching the mechanism fire on its own** — never by sleeping, and never by calling
the scheduled work by hand, which replaces the subject with the test's own
intention and proves nothing.

Each of the four **real** seams is also executed by a test where it is itself the
subject, against a world that test owns: the real clock and probe answer for
themselves, the real sender performs a request against a loopback HTTP server the
test starts and closes, and the real spawner runs this same node binary on a
one-line script and reads back what the child received. Shape checks are not
coverage — a real implementation asserted only by `typeof` ships untested, and the
first thing to execute it would be a live machine.

## Configuration

`src/config.js` is the **single source of truth** for the relay port, the OTLP
endpoints, upstream batch limits and the redaction default. Nothing else in `src/` or `bin/` may write a
port or a `/v1/...` path down — the smoke test greps for it and fails, because a
second copy is how the wrapper and the relay end up disagreeing about where
telemetry goes.

For a hosted engine, configure the workspace credential once without placing it
in shell history or a process command line:

```sh
printf '%s\n' "$WORKSPACE_API_KEY" | \
  PULLBOARD_ENGINE=https://engine.example/graphql \
  PULLBOARD_TENANT=workspace-id staterush-login
```

`staterush-login` accepts no arguments and reads exactly one API-key line from
stdin. With `PULLBOARD_TENANT` unset it asks the engine which workspace the key
belongs to (`me { workspace }`, sent with the key and no `X-Tenant`) and stores that,
refusing, by name, only when the engine cannot say. It atomically creates
`$XDG_CONFIG_HOME/pullboard/credentials.json` (or
`~/.config/pullboard/credentials.json`) as mode 0600. The packaged tools refuse
an unsafe or malformed credentials file and require HTTPS plus both the tenant
and key for a non-loopback engine. `PULLBOARD_ENGINE`, `PULLBOARD_TENANT`, and
`PULLBOARD_API_KEY` override the corresponding saved values. Environment values override saved
credentials file values. Remote engines must use HTTPS. Numeric IPv4 127/8 and IPv6 ::1 loopback engines may use HTTP, and
`staterush-login` records those tunnel endpoints exactly as supplied; `localhost` is refused
because it requires name resolution. Numeric loopback engines remain
usable without a workspace credential. `staterush-wake` remains
local-only. The relay uses the saved machine login for native ingest and derives
its ingest destination from the selected engine URL's origin. It does not need a
separate ingest key for ordinary setup. An explicit `PULLBOARD_INGEST_ENDPOINT`
overrides that destination; existing ingest key and bearer settings remain available.

To set up a dispatcher for one board, run one guided command with only the
engine configured:

```sh
PULLBOARD_ENGINE=https://engine.example/graphql staterush-setup
```

`staterush-setup` shows the device verification URL and code once, lists the
workspaces the person belongs to and then the chosen workspace's boards (answer
with the number or the name), saves the person credential, issues or reuses that
workspace's dispatcher key, and runs
`staterush-station up` for the board, which asks the workspace-and-board y/N
consent and starts the lane. It then runs an unarmed `staterush-dispatch <board>
once` and reports what the dispatcher would take, or which verdict a card still
needs. It starts each tool by path with the same node, so no command needs to be
on `PATH` or linked. A declined consent, a missing permission, an unreadable
board or a board with no managed rule for this host ends it with the reason and
a non-zero exit, and it does not report setup complete.
The lane supervises the dispatcher, telemetry relay, and transcript spy.
Setup reports completion only after the configured relay answers its status check.

One supervised machine service is installed per host and records multiple consented boards
across workspaces. `staterush-station status` lists each pair and
its station coverage. The current service runs one board; additional consented
pairs wait for multi-board runtime support while retaining their consent.
`staterush-station down <board>` stops the machine service only when that board
and the selected workspace are its active pair. Running `down` for a waiting pair
leaves the service and consent intact. Remove that exact pair from
`~/.config/staterush/authorized-boards.json` to revoke its consent.

Guided setup also offers an optional coordinator seat for the chosen workspace
and board. It creates a separate, non-expiring reviewer key for this machine
with exactly `boards.read`, `cards.review`, `cards.work`, and `questions.answer`.
The dispatcher and worker keys keep their existing roles and cannot answer
questions. The seat key is saved in its own protected file and reused on later
setup runs when its name, machine, roles, and access still match. Setup prints a
secret-free local stdio `staterush-mcp` entry to add to the project's `.mcp.json`;
open a fresh Claude session after adding it. The hosted MCP entry can remain in
place.

Issuing or assigning the reviewer key requires `tenant.admin`. If setup reports
that permission is missing, give a workspace admin the exact key name, machine,
and four reviewer roles printed by setup. The admin should issue a key with no
scheduled expiry. Rerun setup and supply the admin-provisioned secret from a
mode-0600 protected file (or piped stdin when prompted); never put it in an
argument or project MCP JSON.

Guided setup asks which Claude provider this machine lane should use. Anthropic
is the default. For Amazon Bedrock, enter an AWS region and choose exactly one
credential source: a named AWS profile, an instance or task role, or an absolute
path to a Bedrock API-key file. The key itself stays in that file. Setup also
accepts a region prefix and optional Opus, Sonnet, and Haiku model IDs. In
`ap-southeast-2` and `ap-southeast-4`, the default prefix is `au`; enter a
prefix without a trailing dot. You can make the same choice directly with
`staterush-station up <board> --claude-provider bedrock --aws-region <region>`
and one of `--aws-profile <name>`, `--aws-role`, or
`--bedrock-api-key-file <absolute-path>`. Add `--bedrock-region-prefix <prefix>`
or `--opus-model`, `--sonnet-model`, and `--haiku-model` as needed. A later
`staterush-station up <board>` reuses this lane's saved choice, and `status`
shows its provider and region without showing credentials.

For a named AWS profile that can renew credentials without input, configure
Claude Code's `settings.json` (at `~/.claude/settings.json`, or
`$CLAUDE_CONFIG_DIR/settings.json` when that variable is set):

```json
{
  "awsCredentialExport": "aws configure export-credentials --format process"
}
```

Choose the profile with the lane's `--aws-profile <name>` setting. The AWS CLI
command reads that profile and writes JSON credentials to Claude Code, not to
the lane configuration. Its flat JSON output contains `AccessKeyId`,
`SecretAccessKey`, and, for temporary credentials, `SessionToken`; `Expiration`
is optional. Claude Code runs `awsCredentialExport` at session start and on
each credential reload, then caches the returned credentials. The profile and
its renewal mechanism must work without a browser or prompt for an unattended
worker. Keep credential values out of command arguments, settings, diagnostics,
status, and receipts.

On EC2, select an EC2 instance profile; on ECS, select an ECS task role. Use
`--aws-role` for either. Claude Code uses the default AWS credential chain to
obtain and refresh the role credentials, without a static key. There is no package credential loader.
Browser-based SSO refresh needs a person to complete sign-in
and does not qualify for unattended lane authentication, even if the initial
SSO session works. See [Claude Code's Amazon Bedrock credential guidance](https://code.claude.com/docs/en/amazon-bedrock)
for the export command and credential resolution behavior.

After the dispatcher dry run, `staterush-setup` enables auto-update for the
StateRush marketplace in your Claude Code user `settings.json`, unless you
already chose true or false there. Setup reports the resulting state. To turn
auto-update off, open `/plugin` > Marketplaces > `staterush` > Disable auto-update.
For a pinned release, turn auto-update off, remove the marketplace and add a
tagged ref, for example `/plugin marketplace add newaxislabs/staterush-plugins#v0.1.0`,
then install `staterush@staterush` from that marketplace. `DISABLE_AUTOUPDATER`,
`DISABLE_UPDATES`, and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` suppress updates.

Managed lanes check the published client release independently of Claude Code's
marketplace auto-update setting. When the engine recommends a newer release,
the lane verifies and stages it, switches at a safe point, and adds services
required by the new release. The previous staged release remains available for
rollback. To keep a lane on its current release, run
`staterush-station up <board> --no-auto-update`; this setting persists until
`staterush-station up <board> --auto-update` re-enables it. `staterush-station
status <board>` shows the setting, available release, and the last update error.

`staterush-station status <board>` also shows the dispatcher's active lane log
under `$XDG_STATE_HOME/staterush/lanes` (or `~/.local/state/staterush/lanes`).
Supervised dispatcher diagnostics reach that log even when cron or another
supervisor captures stdout and stderr elsewhere. The active log rotates at
10 MiB; up to three numbered archives (`.1` through `.3`) are retained, each
at most 10 MiB. The log directory and retained files are private to the lane
user. Direct `staterush-dispatch` invocations still write to their usual streams.

To defer new workers on selected stations while a host marker is fresh, set
`PULLBOARD_DISPATCH_HOLD_MARKER` to its path,
`PULLBOARD_DISPATCH_HOLD_MAX_AGE_SECONDS` to a positive age, and
`PULLBOARD_DISPATCH_HOLD_STATIONS` to comma-separated station names in that
dispatcher's environment. All three values are required together. Existing
workers and claim recovery continue. Removing the marker, or letting it age
beyond the limit, restores new admission on the next tick. With these values
unset, admission is unchanged.

An MCP seat can instead sign in as its person. Set `PULLBOARD_AUTH_KIND=person`
for the first `staterush-login` invocation; the command reads the issuer,
audience, and native client id from the engine. Browser sign-in opens a Google
page and prints its URL. The local callback completes
sign-in and stores the refresh credential in the same protected file. Use
`staterush-login --device` to choose the device verification URL and code instead.
Over SSH, without a browser, or when the local callback port is busy, the command
falls back to device sign-in and prints the verification URL and code.
Later invocations recognize that person credential without the environment
switch. To add a workspace key alongside the saved person credential, explicitly
select machine login:

```sh
printf '%s\n' "$WORKSPACE_API_KEY" | \
  PULLBOARD_ENGINE=https://engine.example/graphql \
  PULLBOARD_AUTH_KIND=machine staterush-login
```

Both credentials coexist in the protected file. Explicit `PULLBOARD_AUTH_KIND=person`
selects the saved person credential even when `PULLBOARD_API_KEY` is set. Explicit
`PULLBOARD_AUTH_KIND=machine` selects machine authentication for unattended tools.
With no auth kind set,
an explicit `PULLBOARD_API_KEY` takes precedence over saved person credentials;
otherwise a saved person credential selects person authentication. A saved machine key
for a tenant is scoped to that same tenant: a request for another tenant requires that tenant's
own saved key or an explicit API key. The MCP refreshes its access token before expiry and refuses board work
with sign-in guidance if refresh is unavailable; it never falls back to a saved
or ambient machine key. Person-token requests omit the actor header, so until
the engine supports human actor delegation, seat actions are indistinguishable
from the person's direct actions. API-key credentials remain the mode for
unattended fleet lanes.

| variable | default | |
|---|---|---|
| `PULLBOARD_RELAY_HOST` | `127.0.0.1` | loopback only; a relay on `0.0.0.0` is an unauthenticated LAN ingest |
| `PULLBOARD_RELAY_PORT` | policy `relay.defaultPort` | from `specs/worker-telemetry-policy.json`; workers are pointed at the same port |
| `PULLBOARD_ENGINE` | unset | the engine's GraphQL endpoint for board and session queries |
| `PULLBOARD_TENANT` | credentials file value | Hosted workspace id sent as `X-Tenant` |
| `PULLBOARD_API_KEY` | credentials file value | Hosted workspace key sent only as `X-API-Key` |
| `PULLBOARD_INGEST_ENDPOINT` / `_TOKEN` | engine origin / unset | native ingest uses the selected engine URL's origin; an explicit endpoint overrides the destination, and a token supplies optional bearer authentication |
| `PULLBOARD_FANOUT_ENDPOINT` | unset | the customer's pre-existing collector |
| `PULLBOARD_RELAY_BATCH_MAX_RECORDS` | `100` | positive safe-integer limit for records in each newly formed upstream request |
| `PULLBOARD_RELAY_BATCH_MAX_BYTES` | `524288` (512 KiB) | positive safe-integer limit for exact serialized UTF-8 bytes in each newly formed upstream request |
| `PULLBOARD_RELAY_SPOOL_MAX_RECORDS` | `100000` | hard positive safe-integer cap across spool and quarantine records; at the boundary ingress remains available by evicting the oldest unsent record and counting the capacity drop |
| `PULLBOARD_RELAY_SPOOL_MAX_BYTES` | `536870912` (512 MiB) | hard positive safe-integer cap across spool and quarantine payload bytes with the same explicit oldest-unsent capacity-drop policy |
| `PULLBOARD_RELAY_DELIVERY_CONCURRENCY` | `20` | positive safe-integer limit for simultaneous upstream deliveries; each provider session remains an ordered lane |
| `PULLBOARD_RELAY_DELIVERY_TIMEOUT_MS` | `10000` | positive safe-integer timeout for each outbound delivery request, preventing a hung socket from pinning a lane forever |
| `PULLBOARD_RELAY_STALE_AGE_MS` | `900000` (15 minutes) | positive safe-integer age at which the oldest undelivered spool record is stale |
| `PULLBOARD_RELAY_PRESSURE_RSS_BYTES` | `268435456` (256 MiB) | positive safe-integer resident-memory threshold; the relay keeps accepting durably, pauses ordinary delivery passes, and permits one bounded progress pass every 30 seconds at or above it |
| `PULLBOARD_RELAY_CAPTURE_MAX_AGE_MS` | `604800000` (7 days) | positive safe-integer receipt-age limit for redacted captures |
| `PULLBOARD_RELAY_STATE_MAX_BYTES` | `2147483648` (2 GiB) | positive safe-integer target for all regular-file apparent bytes under the state directory |
| `PULLBOARD_REDACT` | **on** | see "What is redacted" |
| `PULLBOARD_TELEMETRY_HOME` | `$XDG_STATE_HOME/pullboard-telemetry` | disk buffer and state |

A malformed value is refused, not silently replaced with the default.

### Board-owner workflow

`staterush-owner define BOARD --file FILE` creates a board from a raw
`DefineBoardInput` JSON document whose `name` matches `BOARD`. It prints the
created board's name and columns; topology refusals include the engine's full
error codes and messages.

`staterush-owner export BOARD --output FILE` writes an editable JSON snapshot of
the live board shape, ordered staffing, and board and station instructions.
`staterush-owner apply FILE` prints a deterministic dry run; add `--apply` to
commit the displayed changes after the command verifies that every exported
engine revision is still current. The engine remains the record, so the export
is a working document rather than a repository input.

The exported `board` also carries `highlights` (each `{name, label, predicate,
colour, fillPattern, fillShades, borderColour, borderStyle, dashRhythm}`, in
the engine's order, unset paint omitted) and `filters` (each `{name, label,
predicate}`). `apply` sets them through `upsertBoardHighlight` and
`upsertBoardFilter`, never through reshape, and lists each changed rule as
`highlight NAME` or `filter NAME`. When the document declares a `highlights`
or `filters` key, a live rule of that kind the key omits is removed through
`removeBoardRule` (listed as `remove highlight NAME`); a document without the
key changes and removes nothing of that kind. Paint the engine refuses stops
the apply with the engine's reason and a non-zero exit.

The command normally requires `PULLBOARD_API_KEY`, `PULLBOARD_TENANT`, and
`PULLBOARD_ACTOR`. A developer using a legacy engine that enforces no workspace
identity may set `PULLBOARD_ALLOW_UNAUTHENTICATED_LOOPBACK=1`; this exception is
accepted only when both credential variables are absent and the endpoint host
is `127.0.0.1`, `::1`, or `localhost`. It cannot enable an unauthenticated
request to any non-loopback endpoint.

### Bounded backlog memory and shutdown

The isolated relay benchmark seeds 15,000 two-KiB durable records (80% spool,
20% quarantine), checks startup and health, receives one new record, recovers a
durable 100-member repartition journal, starts a drain, and restarts. Its absolute
peak RSS is sampled from the parent through the OS process status every two
milliseconds, including while synchronous startup, health and delivery work
runs, and must stay below 224 MiB. Record-count and durable-body growth are
measured from live JavaScript heap plus live buffer bytes between explicitly
collected baseline and workload checkpoints within the same benchmark process,
with unchanged 64 MiB and 32 MiB bounds. This avoids treating native allocator
RSS high-water marks as relay retention. A benchmark-only negative control
retains durable body buffers and must be rejected by that same process-local
growth proof. Delivery reads
only a bounded pass window, health traverses records one at a time, duplicate
checks use a compact source-key index built once at startup, and new batches
account exact serialized bytes incrementally. Relay health exposes the duplicate
check's bound as zero directory scans and zero file reads per ingress, so an
operator's health check can alarm if either bound rises above zero.

Upstream batches from different provider sessions fill at most the configured
delivery concurrency. Batches within one session are sent serially, so a stuck
session consumes one slot without delaying independent sessions or allowing its
later records to overtake its earlier records. JSON and plain relay health name
the oldest undelivered timestamp, its current age, the effective stale threshold,
and whether it has crossed that threshold; an empty spool reports age zero and
is explicitly non-stale.

Relay health's `ok` means exactly "nothing here stops delivery": it is derived
from `problems`, a list of what does, each with its fix -- `no-destination`
(`heldWithoutDestination` records held with no upstream or fan-out configured,
which will never be delivered), `backlog-stale`, `systemic-refusal`,
`replay-ambiguity`, `refusing`, `capacity` and `memory-pressure`. A batch the
relay refuses terminally is quarantined and leaves the spool, so `holding` and
`delivered` stay flat while it refuses everything; `refused` therefore counts
the last hour's terminal refusals by reason, and one reason repeating
(`REFUSAL_PROBLEM_MIN` times) is the `refusing` problem. A batch the egress
allowlist empties entirely is never sent upstream as an empty envelope (the
engine would refuse it as incomplete and the relay would hold everything behind
it): the relay disposes of it itself, under the reason "the relay's egress
allowlist omitted every resource in this batch; nothing was sent", which
`refusing` then names with its fix. The historical
`quarantined` count is reported but is not a problem on its own. Records
the engine accepted without facts are reported in `acceptedWithoutFacts` but
are not a problem: most carry no token accounting by nature. `staterush-verify`
fails its relay check on any problem, or on a relay with no upstream at all.
**Recovering refused batches.** `staterush-relay quarantined [--since ISO]
[--until ISO] [--reason TEXT] [--names-out FILE]` lists what the relay refused,
by reason and card. `staterush-relay backfill-bindings --since ISO --until ISO`
plans session bindings for batches refused as "claim-correlated telemetry has
no provider session binding", taking each execution's session from the
batches' own `conversation.id`; it proposes a binding only where that is one
session and the claim has no binding already, and writes nothing without
`--apply`. `staterush-relay replay --limit N --names FILE [--dry-run]` replays
ONLY the named quarantine entries; `--dry-run` reports what each would send
(or why it would still be refused) and sends nothing.

Health's `memory` is the RELAY's: `staterush-relay health` asks a running relay
for its own rss and pressure over the control channel (`source: "relay-live"`),
and otherwise reports the reading the relay last recorded in
`relay-memory.json` -- every 30 s, and at once when pressure starts or stops --
with its age (`source: "relay-record"`, `ageMs`). With neither, it says
`source: "unknown"` rather than reporting the reading process's own memory.

The relay records which destinations it was started with
(`relay-destinations.json` in its state directory, booleans only) before it
takes a record, so a health read from another process -- the CLI, the doctor --
judges the relay by its own configuration, never the reader's environment;
`destinations.source` says `relay` when that record was used and `reader` when
no relay has written one yet.

At or above `PULLBOARD_RELAY_PRESSURE_RSS_BYTES`, scheduled work pauses ordinary
outbound passes but permits one configured-size progress pass every 30 seconds,
so persistent pressure cannot indefinitely starve a durable backlog. Receives
remain durably acknowledged and the existing schedule rechecks pressure so
ordinary draining resumes after it clears. Health reports RSS in
bytes as a conservative 16 MiB ceiling bucket, the effective threshold, and
whether ordinary delivery is pressure-paused; bucketing makes polling stable
and can only pause delivery early, never after the configured threshold has
been crossed.

SIGTERM or SIGINT stops admission at the HTTP server, aborts an in-flight
outbound request as ambiguous, and starts no next batch. The packaged adapter
test requires a clean exit within two seconds even during a large pass, rather
than making the bound depend on backlog size or the outbound-request timeout.
The attempted batch keeps its durable membership and delivery key for exact
replay after restart. Payloads received in one event-loop turn share one append
and fsync to an immutable segment before ingress is acknowledged; delivery never
rewrites those payload bytes. Payload-free state changes share a group-committed
transition append. The transition journal is atomically compacted after 8,192
entries, and a separate compact payload-free checkpoint serves health and
packaged status without reading payload files. Recovery combines the original
segment body with its latest durable transition.
Checkpoint replacement uses an atomic temporary-file rename, so a forced kill
(SIGKILL) leaves either the prior complete checkpoint or its complete successor.

Spool admission is bounded independently by record count and payload bytes.
New ingress is always accepted: when either cap is reached, the relay evicts
the oldest unsent row (or oldest terminal quarantine row if no unsent row is
available), increments the monotonic capacity-drop counter exposed by health,
and logs only the start and end of the drop episode. Retention age never deletes
undelivered work; this explicit space-boundary eviction is the sole exception.

New payloads are group-committed to approximately 4 MiB append-only segment
logs. Held, quarantine, session, capture, and delivery facts are maintained in
memory and written through grouped payload-free checkpoints/transitions; health
answers from those counters rather than scanning state directories.

The relay generates its operator sentence from the effective configuration:
redacted captures are retained for 7 days under a 2 GiB total-state target;
undelivered spool data is never reclaimed because of retention age. Capture reclamation runs at
startup and during operation, removes only eligible capture evidence
oldest-first, and health reports when protected state prevents meeting the
target. The separately reported capacity policy above remains the only way an
undelivered row is evicted.

### Delivery identity and replay

Relay delivery is durable **at-least-once**. Every outbound OTLP request carries
`Idempotency-Key: pb2:v1:<64 lowercase HMAC-SHA-256 hex>`. A separate random
local delivery secret keys the digest, so the receiver cannot test guesses at
an identifier that redaction removed. If an inbound collector request already
has an `Idempotency-Key`, its opaque value is keyed into that shape; otherwise
the relay keys the statelessly redacted payload, signal, and sorted session
identities. The raw collector key and delivery secret are never forwarded.

Before the first send, coalesced batch membership and its key are fixed in the
durable transition journal. A crash after remote acceptance but before local
acceptance therefore re-sends the same bytes with the same key. The engine's ingest
uses that key as its authoritative idempotency identity, and the relay marks the
leg accepted only after a matching structured engine receipt. Completed keys
are retained only in a 4,096-entry process-memory cache; new completions create
no per-delivery receipt files, and legacy receipt files are removed in bounded
asynchronous chunks. An arbitrary customer collector still uses ordinary
OTLP 2xx acceptance and may ignore the header, so duplicate remote observations
remain possible by design rather than risking loss of acknowledged telemetry.
New upstream batches contain one signal and one exact provider, service
version and effective session identity, and obey both configured bounds. Customer
fanout keeps its existing per-signal batching. Ambiguous and retryable attempts
replay immutable membership and keys; terminal upstream refusals are narrowed to
isolate bad members, which are retained in the durable quarantine instead of
blocking later telemetry. An operator can deliberately return a bounded number
of those proven-terminal records with `staterush-relay replay --limit N`; each
run reports accepted, re-quarantined and skipped counts, and later runs resume
the remainder. A record refused twice for the same bounded reason is thereafter
reported and left quarantined instead of entering an automatic loop.

When a parent and both immediate child probes receive the same terminal status
and bounded reason, the relay treats that as a systemic refusal. It durably holds
the complete cohort instead of narrowing to individual records, reports the
affected record count and completed parent/child probe progress in health, and
uses backoff for one whole-cohort recovery probe. Once that probe is accepted,
the held cohort recovers automatically under fresh delivery keys; no
record-by-record operator replay is needed. The `delivered` health count is a
durable payload-free aggregate. It survives restart and legacy-receipt cleanup
without coupling operational health to a directory scan.

The byte limit is also enforced at the upstream send boundary. On restart, a
never-attempted batch or one with a matching durable terminal refusal is
repartitioned by the exact serialized request bytes under new keys. A singleton
which cannot fit is quarantined without egress. An already-attempted over-cap
batch whose outcome is ambiguous is held byte-for-byte: JSON and plain health
name the ambiguity and require operator action to restore/increase the limit or
otherwise resolve the prior attempt before replay can safely continue.

The relay measures the exact UTF-8 body it sends. A proxy in front of the ingest
(nginx or otherwise) must accept a body of at least the relay's byte limit: keep
the two limits equal, or the proxy's larger, and change them together. With the
default 512 KiB limit that means a proxy accepting a body of exactly 524,288
bytes.

Codex does not emit its provider-created thread id as `session.id`. After the
spawner observes the provider handoff, it stores a bounded binding from that session to
the exact board/card/station/actor/claim tuple. The relay enriches only matching,
non-lapsed claim resources; native Claude session identity is left unchanged.

### What is redacted, and why the default is on

**VERIFIED:** every payload Claude emits carries `user.email`, `user.id`,
`user.account_uuid`, `user.account_id` and `organization.id` — with prompt logging
already disabled. So an automated setup is configuring the export of the
operator's identity to us. Redaction can only happen in the relay, before egress;
neither CLI can do it.

The identifying values are **REPLACED BY A SINGLE RANDOM PER-INSTALL ID** — not
hashed, not dropped (decision `DECISION-INSTALL-ID`, 2026-09-02).
`specs/pii-filter.spec.json` carries the decision and is authoritative;
`src/redact.js` implements it (`pb-${randomUUID()}`); the engine enforces it,
refusing any payload whose identity values are not all one value starting `pb-`.

There is no `PULLBOARD_REDACT_MODE`.

WHY HASH LOST, in the spec's own words (PII-012): *"A hash is reproducible by anyone
holding a guess at the email, so a hashed id is a re-identifier wearing a disguise."*
An email address has a guessable shape, so a digest plus a candidate confirms the
guess. A random per-install id cannot be guessed at all, and it keeps exactly the
property hashing was wanted for: stable aggregation within one install, without our
ever holding the address.

The identifier set is asserted as EXACT, not a superset — `user.email`, `user.id`,
`user.account_uuid`, `user.account_id`, `organization.id`, `host.name` — because
"a seventh name arriving unnoticed is a change to what we promise an operator".

An explicit host label is allowed on authenticated helper presence and supervisor
payloads for workspace admin status. It defaults to the OS hostname on macOS and
Linux; `PULLBOARD_SUPERVISOR_HOST` overrides it. The client does not send a person
or principal field: the engine attributes the authenticated credential. Ordinary
OTel and transcript telemetry still replaces identifying values, including
`host.name`, with the installation ID under DECISION-INSTALL-ID.

## Two providers, two token models

Claude's `input` **excludes** cache reads; codex's **includes** them. The
`fresh = input − cache_read` rule is codex-only, and applied to Claude yields
`10 − 14146`. Nothing in this package normalises tokens without branching on
provider, and an unrecognised provider or CLI version **refuses** rather than
guessing — `resourceAttributes()` already throws on one.

Temporality is DELTA on both. Sum points in an interval; never difference them.

## The card is not a resource attribute

Resource attributes are fixed at process start, so an agent that works five cards
would tag all five with the first. The card comes from the board, by slicing each
actor's series against the event log's own pull/take/ready/reject/release
intervals — nothing the agent can fake.

## Running it

```sh
npm install          # zero dependencies; nothing to fetch
npm test             # node --test
npx staterush-relay  # serves OTLP/HTTP JSON on the configured loopback endpoint
npx staterush-relay replay --limit 100  # deliberately drain a bounded quarantine slice
npx staterush-verify --provider claude --model MODEL  # proves one installed round trip
```

## Durable watches and runtime inboxes

For the common one-card case, register a durable one-shot arrival watch without
inventing a subscription id or cursor:

```sh
staterush-watch card --board my-board --card C-17 --reaches Review \
  --fallback-provider codex
staterush-wait --board my-board --card C-17 --reaches Review
```

Both forms inspect the card's current state first, so a card already at the
target resolves immediately and unrelated event history is never replayed.
While the card is upstream they remain pending. `--or-beyond` also treats a
station reachable downstream from the target as a successful `beyond` outcome;
without it, bypassing the target resolves as `can-no-longer-reach`. Reachability
comes from the board's directed routes, not the displayed column order.
Delivery to another terminal station, discard or abandonment, and retirement
of the target also resolve as `can-no-longer-reach` instead of waiting forever.

The notification identifies the board and card, target, observed column,
resolution time, outcome, transition verdict, and a deterministic `id`. Delivery
is at least once: a retry after an ambiguous failure or timeout reuses that same
id so the receiver can discard a duplicate. An acknowledged delivery is never
retried, and the registry records at most one acknowledgement for each id.
Command and provider fallbacks time out after 120 seconds by default (set
`PULLBOARD_WATCH_FALLBACK_TIMEOUT_MS` to override this); webhook delivery keeps
its HTTP transport timeout. Acknowledged durable arrival delivery is recorded,
then its active subscription is removed atomically. It is therefore one-shot and
later card events cannot notify it again. `staterush-watch
list` labels pending entries as `card-arrival` and includes their card, target,
and `orBeyond` setting. The foreground `staterush-wait` form prints the same
resolution and exits; it needs no subscription id, lease, inbox, notification
environment, or cursor file. A durable card watch with no explicit fallback uses
the current provider (`CODEX_THREAD_ID` first, then `CLAUDE_CODE_SESSION_ID`) and
defaults to Codex when it is invoked outside either provider.

`staterush-watch` stores subscriptions under `PULLBOARD_WATCH_HOME` (or the
normal telemetry state directory). A subscription has a stable id, one or more
boards, repeated `--until` expressions, an optional live inbox, a required
fallback, and a renewable lease. Expressions use the same vocabulary as
`staterush-wait`: predicates within an expression are ANDed, repeated
expressions are ORed, and `needs-person` selects staffing/absence facts.
Use `needs-person=QUESTION_OPEN` (or another engine reason, with `|` between
alternatives) when selection stock such as `BY_HAND_VERDICT` must not wake the
subscriber. A needs-person reason can be limited to one board column with both
qualifiers, for example
`needs-person=BY_HAND_VERDICT,board=my-board,column=Review`. `board` and
`column` must appear together; a partial, duplicate, empty, or unknown qualifier
is rejected. `starved>=SECONDS` independently samples the engine's per-rule
staffing starvation facts and reports the board, column/rule, unclaimed count,
age, and any reason supplied by the engine.
`needs-person=relay-backlog-stale` subscribes to the local relay's stale-backlog
incident. Its first evidence is stored before delivery, an unacknowledged attempt
retries that same durable evidence, unchanged age growth is deduplicated, and a
successful catch-up clears the incident so a later breach can notify again.

```sh
staterush-watch register --id supervisor --board my-board \
  --until action=ask --until 'starved>=60' --inbox http://127.0.0.1:9173/inbox \
  --inbox-token "$RUNTIME_INBOX_TOKEN" --lease 3600 \
  --fallback-provider codex -- --json
staterush-watch inspect --id supervisor   # credentials are redacted
staterush-watch renew --id supervisor --lease 3600
staterush-watch run --interval 30
staterush-watch remove --id supervisor
```

Registration baselines each board cursor at its current engine watermark, so
old history is not replayed and the next matching live event arrives within one
interval. Use `--from-start` only when deliberate historical replay is wanted.
An existing lagging cursor drains at least 25 and at most 50 event pages per
board per cycle. After the first 25 pages, the cycle stops once its one-second
budget is spent. Thus a cursor 10,000 events behind reaches current within two
cycles at the engine's 200-event page size, while catch-up still has a hard
per-cycle ceiling. Current-state signals for every subscriber are sampled before
historical reads, and catch-up rotates one page at a time across subscriber and
board pairs, so one slow lagging cursor cannot postpone another subscriber's
sampling or monopolise event progress. Non-matching and no-longer-current
history advances the durable cursor without a notification. A matching
notification still advances only after acknowledgement, so restart retries a
failed match.

Event, absence, and starvation sources are sampled independently. Absence and
starvation alarms are fingerprinted by stable affected state rather than sample
timestamps: unchanged samples are silent, changes notify once, and clearing the
state notifies once. Absence is the engine's own verdict (`Board.claimAbsences`),
not something this package derives; an engine that cannot answer is reported as
`unknown`, never as an absence alarm. The relay-backlog incident reads the local
relay state named by `PULLBOARD_TELEMETRY_HOME`.

Before delivering a historical `ask`, the production adapter checks the board's
current `awaitingAnswer` state. Resolved questions and cards that have moved on
are caught up without waking the subscriber once per stale event; only questions
that remain open are delivered.

The live inbox contract is runtime-neutral. The monitor sends an HTTP `POST`
whose JSON body is the notification. If configured, authentication is
`Authorization: Bearer TOKEN`. The runtime acknowledges with a 2xx response
whose JSON body contains `{"acknowledged":true}`. A plugin or other runtime can
implement that small contract without a provider control plane. A missing,
unreachable, or unacknowledged inbox invokes exactly the registered fallback:
an argv-preserving command, a webhook with the same acknowledgement contract,
or the existing provider-neutral dispatcher for Claude or Codex. Having no
inbound runtime channel is supported: the fallback is used directly, and its
acknowledgement records the notification as durably delivered.

`inspect --id ID` exits 0 for an existing subscription and exits 2 with a
diagnostic for an unknown id. `list`, successful `renew`, and successful
`remove` exit 0; invalid commands and source failures exit 2. If both inbox and
fallback delivery fail, the monitor writes a bounded diagnostic containing only
the subscriber id and signal, never credentials or notification payload.

The cron registration path creates each subscription and maintains its local subscription lease;
`remove` still unsubscribes immediately. The running watcher separately self-renews its engine
supervisor projection, so supervisor health reports poll-loop liveness. That projection does not
create, revive, remove, or extend a local subscription. Running cron renewal at
the same time remains an idempotent fallback. Registry files are written with
owner-only permissions because inbox and webhook tokens are retained there even
though inspection output redacts them.

Run `staterush-watch` under a service supervisor that restarts it after process
or host failure. An unsupervised watch that an operator must remember to keep
running cannot report events or absence while it is down.
