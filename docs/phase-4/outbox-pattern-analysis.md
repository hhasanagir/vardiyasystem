# Outbox Pattern Analysis

**Question:** Does this system need the Transactional Outbox Pattern?
**Verdict:** ❌ **Not needed at this stage.**

## Current Event Flow

```
Domain events → EventBusService → BullMQ queue → EventsConsumer
```

1. Domain logic emits an event via `EventBusService`.
2. `EventBusService` adds the job to a BullMQ queue.
3. `EventsConsumer` picks up and processes the job.

## Identified Risk

- **DB commit succeeds but BullMQ add fails → event lost.**
  There is no atomic guarantee between the database write and the queue publish,
  which is exactly the gap the outbox pattern exists to close.

## Current Mitigation

- `EventBusService` wraps the queue add in a **try/catch with retry**,
  reducing the window in which an enqueue failure loses events.

## Assessment

| Factor                   | Evaluation                                                              |
| ------------------------ | ----------------------------------------------------------------------- |
| Purpose of the event bus | Non-critical notifications and logging                                  |
| Source of truth          | Schedule state in the database                                          |
| Impact of a lost event   | Informational gap only; no data corruption or state divergence          |
| Outbox complexity cost   | New table, relay process/publisher, cleanup strategy, ordering concerns |

**Key point:** The Schedule aggregate itself is the authoritative source of truth —
events are supplementary/informational. A missed notification is recoverable and does
not compromise correctness, because consumers never mutate state that isn't already
persisted in the database.

## Recommendation

**Do not implement the outbox pattern now.** The added complexity (outbox table,
relay worker, exactly-once delivery semantics, retention/cleanup) outweighs the
benefit for a system whose events are informational.

### When to revisit

Implement the outbox pattern **if and when** critical event delivery becomes a requirement, e.g.:

- Integration with **external systems** that act on events (billing, payroll, ERP sync)
- Downstream consumers that cannot tolerate missing notifications
- Regulatory requirements demanding guaranteed event audit trails

At that point, prefer the standard approach:

1. Write domain events to an `outbox` table **inside the same transaction** as state changes.
2. Run a background relay that polls the outbox and publishes to BullMQ, marking rows as published.
3. Retain failed rows with retry counters and alerting.
