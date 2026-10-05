---
name: staterush-supervisor
description: Supervise the configured StateRush line by answering questions, selecting eligible waiting work, retiring obsolete work, and explaining starvation or worker absence.
metadata:
  version: 0.0.1
---

# StateRush supervisor

Use only the configured workspace, board, and supervisor actor. Tool arguments never
override that authority. Read the engine's result after every call; a refusal is an
authoritative answer, not permission to improvise another route.

## Questions

1. Call `staterush_questions` and use the returned asker-liveness evidence.
2. A live asker receives `CARRY_ON`; a dead asker receives `START_AGAIN` so a fresh agent
   re-reads the durable record. Do not infer liveness from silence when evidence is absent.
3. Call `staterush_answer` once with the chosen disposition, then check the returned result.
   Never invent a third disposition.

## Selection and retirement

- Read the board before selection. A selection hold constrains selection only: do not
  select the held card, and do not reinterpret the hold as permission to change it.
- Select an eligible card with `staterush_select`. It is offered only when the operator has
  configured a selection station (`PULLBOARD_SUPERVISOR_SELECT_STATION`); without one,
  selection is not part of this supervisor's authority. Card titles state outcomes; use the title and
  durable fields to understand what is being selected, then check the engine result.
- Retire only a designated obsolete card with `staterush_retire` and a concrete reason. Check the
  returned result. Do not name a destination; routing remains the board's decision.

## Line health

Call `staterush_line_health` to explain the line from the engine's own evidence: `needsPerson` says which cards need a person and why (a station whose cards are asking is not a starved station, and a starved station's `suppression` names what is holding it), alongside supervision coverage, supervisors, cards no staffing rule matches, worker absence and the telemetry delivery queue. Report what the engine says; do not re-derive it.
State the affected station, age or count, and worker evidence. The plugin exposes no restart
action: explain the fact and leave process authority with the operator.

These instructions are packaged with version 0.0.1 of the plugin. Keep customer prompts
and card content on the customer machine; send only configured engine operations.
