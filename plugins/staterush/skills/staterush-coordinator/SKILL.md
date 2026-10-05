---
name: staterush-coordinator
description: Supervising a StateRush line as its coordinator. Use when the watcher wakes the session (needs-person, starved, absence or event), when workers have open questions to answer, when cards are waiting in Backlog or a selection column, when a groomed card has split into pieces, when a claim looks dead or silent, when a release or deploy asks for approval, when filing a card for the line, or when deciding whether something needs the person's say.
---

# Coordinating a StateRush line

The coordinator keeps the line moving on the person's behalf: answers workers, selects
work, unsticks cards and approves what it has been trusted to approve. Everything here
uses the board tools (`board`, `card`, `questions`, `line_health`, `claim`, `finish`,
`answer`, `note`, `set_fields`, `add`, `set_theme`, `reclassify`). Read the board fresh
before every decision and every report: a cached view or an earlier dump goes stale
quickly, and some views leave out cards that have reached Done.

## Respond to every wake with a board action

When the watcher wakes you, act on that same board within the board's supervision
window (minutes, not hours). The engine tracks whether a supervisor is covering its
duties (answering questions, deploy decisions, absence, starvation, dead claims). If
the right answer is "this waits on the person", a short hold note on the card *is* the
action. Then tell the person.

| signal | what it means | what to do |
|---|---|---|
| `needs-person` | the engine can prove a person owes a decision on a card | read the reason (below) |
| `starved` | a staffed station has had eligible work waiting past its bound | check the lane is running and its workers produce output (`staterush-line`) |
| `absence` | a claim's holder has gone quiet by the engine's own measure | check the worker process; see "Dead or silent claims" |
| `event` | a board event your subscription asked for (e.g. a question was asked) | read the card it names |

The watcher's `needs-person` wake names the card and a reason:

- `QUESTION_OPEN`: a live worker is waiting on an answer. Answer it (next section).
- `QUESTION_NO_ONE_WAITING`: the asker has gone. Answer anyway; the next worker reads
  the answer and carries it out. Notes alone won't clear it, and the station can't
  re-take the card while the question is open.
- `DECISION_PENDING`: a station asks for a human decision, often a release approval.
- `BY_HAND_VERDICT`: work stands at a column nobody is staffed for. Do it if it's
  within your mandate (claim, finish with the right verdict), or tell the person.
- `WAITING_ON_PREDECESSOR`: see "Delivery order".
- `DELIVERY_OVERDUE`: a finished card hasn't been delivered. A harmless `set_fields` on
  the unheld card re-runs delivery.
- `CLAIM_LOOP`: one card keeps being claimed and released without moving. Read its notes;
  usually the station can't do what the card asks. Fix the card or close it.
- `ROUTING_GRIDLOCK`: a loop of full columns (`line_health` shows it in `capacityCycles`).
  The board owner must reshape (a section limit below the loop's total). Tell the person.
- `STATION_STARVED`: as `starved` above.

## Answering questions

Call `questions`, read the card (`card`, sections `summary`, `notes`, `questions`), then
`answer` once with a disposition:

- `CARRY_ON`: the asker keeps its claim and continues with your answer. The default for
  a live asker.
- `START_AGAIN`: ends the claim; a fresh worker re-reads the card's record. Use when the
  asker is dead, or its approach is wrong and it should restart from the record.
- `TAKE_OVER`: the claim passes to you. Then you must finish or release it yourself.

Give a decision, not an essay. The first sentence is the ruling ("Yes, use the existing
table; don't add a migration."). Add only the constraints the worker needs to act. If
sibling cards will hit the same question, note the ruling on them before they ask.

An answer is guidance, not an act. Answering "abandon this" doesn't retire the card:
the next worker reads its brief and may do the work anyway. To close a card yourself,
write the reason as a note, then claim it and `finish` it `abandoned` (wait until it is
free if someone holds it). If the question is the person's call (see "Escalate"), leave
a hold note and ask them; don't answer for them.

## Selecting work

A Backlog (or other selection column) holds stock until someone chooses what the line
pulls next. The watcher does **not** alert on it, so check it yourself after filing a
card, and again whenever triage or grooming finishes.

- To select: `claim` with the selection station and the card, then `finish` with
  verdict `selected` and a `why`. A claim with no finish leaves it stuck there.
- To close a card that isn't needed: claim it, then `finish` `abandoned` with the reason.
- A card in Backlog is either being done or gone. If it's useful, select it; if not, or
  if it can't start yet, abandon it with the reason and keep the future step elsewhere.
- Before doing something by hand, search the boards for a card that already covers it.
  If one exists, note what you did and let the line verify it.

**Split pieces.** Grooming may split a card into `<ref>-2`, `<ref>-3` ... that arrive
**unselected** in Backlog, while the parent carries on and can reach Done without them.
When a card you care about is groomed, list the column for `<ref>-` pieces, select every
piece that serves the person's objective in the same turn, and abandon the rest with a
reason.

**Delivery order.** A piece's `delivery_order` field may chain it behind siblings it
doesn't really depend on, and it is refused at selection (`waiting-on-predecessor`)
until those reach Done. Trim it to the true dependencies with `set_fields`, and note why.
An **abandoned** predecessor never reaches Done, so remove its ref from every
successor's `delivery_order` whenever you abandon a piece.

**Scope.** A card already past grooming (in build or later) doesn't pick up new scope
from a note. File a new card for the extra scope and select it.

## Dead or silent claims

- Absence is the engine's verdict, not a guess. Confirm the worker process is gone (ask
  whoever runs the lane, or check it per `staterush-line`) before acting.
- A worker that is merely quiet may be thinking. Don't release a live worker's card.
- A dead worker's claim lapses when its lease expires, and the station takes the card
  again. The lane's own recovery (a dispatcher's escalating stop) can release it sooner.
  Don't move the card by hand around the claim.
- If the dead worker had asked a question, answer `START_AGAIN` so a fresh worker starts
  from the record.

## Release and deploy approvals

Approve only what the person has delegated to you; otherwise escalate.

- **Never approve a build older than what is live.** Before approving, compare the
  requested commit with the one the target stage serves:
  `git merge-base --is-ancestor <requested> <live>`. If the requested build is an
  ancestor, approving would roll production back: deny it and answer the card that its
  change is already live.
- Promote one stage at a time, confirm the transition actually succeeded, then answer
  the station `CARRY_ON` naming what you approved.
- A pending, unapproved transition can block the next promotion. Decide it either way.

## Filing a card

- Lead with a concrete scenario: who, doing what, and what goes wrong or should happen
  ("Given Ana has three cards in Review, when she opens the board, then she sees..."). A
  title states the outcome.
- Give it an explicit `ref`, set its theme with `set_theme`, and use `expedite` only when
  someone is actually waiting.
- If the coordinator has already decided the work should be done, file it straight into
  the board's grooming column rather than an intake column meant for suggestions.
- Write acceptance criteria a test can check. No wall-clock limits ("within 2 s"): state
  the property the time stood for. Anything that needs production or a person is
  post-deploy evidence the coordinator runs, not something the build waits on; say so in
  the card, and expect grooming to ask anyway.
- Don't card board operations. Reshaping a board, staffing, limits and runbooks are
  declarations the owner applies directly (with the owner tooling's dry run); routing
  them through the line only adds ceremony and conflicts.
- When re-filing under a new ref, retire the old card only after the new one has cleared
  triage, or triage may close the new one as a duplicate.

## Escalate to the person

Decide inside the mandate the person has set: filing and selecting the cards that serve
their objective, answering routine questions, unsticking delivery. Ask them first for:

- **spending** money or significant provider usage;
- **outward-facing actions**: anything customers, other teams or the public will see, and
  anything hard to undo;
- **genuinely new direction**: a change of objective, priority or scope they haven't set.

When you ask, lead with the concrete scenario and the behaviour each option produces,
not the design. While a line is paused for measurement or maintenance, make no board
moves that would start work.
