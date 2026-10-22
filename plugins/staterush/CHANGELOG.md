# Changelog

## v0.3.35 (2026-10-23)

any finished worker session whose file is on this machine opens in a terminal without claiming the card, a lane's spy reports engine refusals clearly, setup starts and supervises the relay and spy, lanes keep a log and status shows the live process, stale transcript loops stop, timestamped spy logs, tests leave no processes behind, station up explains staffing first (P0-283-2, P0-283-4, P0-292, P0-293, P0-294, P0-295, P0-295-3, P0-296-2)

## v0.3.34 (2026-10-22)

a lane starts workers even when no relay is running (warning UNOBSERVED with the exact relay start command, as before 10-08), relay hints name the port the lane really uses, Terminal.app takeover and hand-back on macOS, station commands on macOS (P0-282-2, P0-290-3, P0-291)

## v0.3.33 (2026-10-22)

Open in terminal works on a freshly set-up lane (it starts the visit spy), the relay needs no hand configuration, cron lanes install with a short entry, re-running station up uses the saved login, lanes upgrade themselves with rollback, workspace key tools, more of the macOS suite passes (P0-278-2, P0-285, P0-287, P0-288, P0-288-2, P0-289, P0-290, P0-290-2)

## v0.3.32 (2026-10-22)

works on macOS without /proc, setup's lane backs off and says why when it can't start a worker, Open in terminal brings an already-open session back, finishing from a foreground session records the verdict or fails loudly, setup names the workspace and board, read_staffing returns script outcomes (P0-275, P0-275-3, P0-282, P0-283, P0-283-3, P0-283-5, P0-283-5-2, P0-284, P0-286)

## v0.3.31 (2026-10-22)

local tools run straight after install with no PATH setup, lanes run from a staged release copy, helpers report machine and version for the admin Helpers page, a lapsed question-parked worker can be opened in a terminal, plugin CHANGELOG, true onboarding guide (P0-275-2, P0-276, P0-278, P0-280, P0-280-2, P0-281)

## v0.3.30 (2026-10-22)

guided setup offers Claude marketplace auto-update (P0-278-3)

## v0.3.29 (2026-10-22)

Open in terminal configured by station up (Terminal.app/iTerm/Linux), hooks silent without Node, foreground refusals explained, browser takeover via Remote Control, Codex app-server attach, foreground recovery (P0-271, P0-272, P0-273, P0-274, P0-275-4, P0-277, P0-279)

## v0.3.28 (2026-10-16)

takeover answers recorded through the session's own board tools, foreground MCP from the lane plugin (P0-269, P0-270)

## v0.3.27 (2026-10-16)

foreground takeover told to the session, Hand back, accepted end report, relay pauses unwatched finished transcripts (P0-265, P0-266, P0-267, P0-268)

## v0.3.26 (2026-10-15)

Open in terminal on a lapsed, question-parked card resumes its session (P0-264)

## v0.3.25 (2026-10-13)

closing a foreground terminal hands the card back (P0-262), Open in terminal acts within seconds (P0-263)

## v0.3.24 (2026-10-13)

foregrounded sessions run as the claim's worker with its MCP tools (P0-261), host session markers scrubbed (P0-260), card scope guards

## v0.3.23 (2026-10-13)

bring a question-parked visit to the foreground (P0-258), retry-cap test resolution (P0-259)

## v0.3.22 (2026-10-13)

completion idempotency keys, 429 backoff with jitter, watcher escalation, verified release selection, presence refresh, spy survives engine deploys

## v0.3.21 (2026-10-09)

Dispatcher brings its own worker session to the foreground for a person at this host

## v0.3.20 (2026-10-09)

Claude worker transcripts are found by session id, not by repo location

