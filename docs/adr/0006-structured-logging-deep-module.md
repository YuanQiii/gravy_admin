# ADR 0006: Structured Logging as a Deep `src/logging/` Module (No Abstract Logger Interface)

- Status: Accepted

- Date: 2026-09-02

- Related: OpenSpec change `add-structured-logging-collection`, CONTEXT.md (*Request-logging module* term), ADR 0005 (guard-chain depth precedent)

## Context

The app relies only on NestJS built-in `Logger` (leveled by `LOG_LEVEL`); logs are non-structured text, request/error logging is scattered across `HttpExceptionFilter` (5xx/4xx) and the DB-oriented `OperationLogInterceptor`. Adding "structured logging + centralized collection" surfaces an architectural question: how deep should the logging module be, and how many seams should "log this request" cross?

A codebase-design review (grep-verified) found the naive design **shallow**: the concept "record this request" was split across a correlation-id middleware, an access-log interceptor, and the exception filter — three modules each with an interface nearly as complex as its tiny implementation, and the dedup invariant ("a failing request is logged exactly once") had **no single owner** (it lived in the *relation* between interceptor and filter).

## Decision

1. **Introduce one deep module** **`src/logging/`.** Its external interface is the thin Nest-`Logger`-aligned signature (`log/debug/verbose/warn/error`) plus `@RequestId()`; everything else — pino init, `LOG_LEVEL` mapping, pino `redact`, the `request#id` correlation, and the **single outermost global** **`RequestLogInterceptor`** **whose** **`catchError`** **branch emits success / slow(>** **`LOG_SLOW_MS`, +body) / failure(error+stack, once) access logs** — is an internal implementation. Registration: `LoggerModule.forRootAsync` in `app.module`; the interceptor is the **first** global `APP_INTERCEPTOR` (wrapping `ResponseInterceptor`/`OperationLogInterceptor`).
2. **`pinoHttp.autologging = false`; pino is transport+redact only.** Avoids double-logging with the custom interceptor. pino `redact` applies to the final JSON object regardless of source, so interceptor-emitted fields are masked without a second masking pass.
3. **`HttpExceptionFilter`** **stops logging.** It only shapes responses; failure detail is emitted by the interceptor's error branch once, correlated by `request#id`. The cross-module dedup invariant collapses into one branch inside the module (locality).
4. **No abstract** **`Logger`** **interface.** pino is the **sole real adapter** (dev-pretty vs prod-JSON vs Loki are pino *sub-behavior/config*, not adapters at the seam). Per one-adapter principle, an `ILogger`+pino-adapter is a hypothetical seam — YAGNI. `@RequestId()` is an *accessor* seam (a stable concept), **not** an adapter seam. Revisit only if a second real logging kernel appears.
5. **`OperationLogInterceptor`** **reads the correlation id from its own** **`ctx`** **request** (the stable `request.id` property written by the logging module) for a null-safe nullable `requestId` column — no AsyncLocalStorage needed; no request → null. Keep DB audit (`oLogMaskFields`) structurally separate from stdout masking (`LOG_REDACT`).

## Consequences

Positive:

- "How a request is logged" concentrates in one module (locality); call sites keep the built-in `Logger` signature (zero migration for business logging).

- The dedup invariant has a single owner and a single test seam (interface is the test surface).

- Future review won't re-propose an abstract Logger layer (recorded here), nor re-scatter logging across middleware/interceptor/filter.

Negative:

- Bigger upfront module than a thin pino wrapper. Accepted for the locality/deletion-test payoff.

- Validation-path rejects (400) may escape the *outermost* interceptor's reach; boundary confirmed during integration testing (recorded in design Open Questions), spec unchanged.

- Retains two masking mechanisms (stdout vs DB) — deliberate: different sinks; only the sensitive-field *name list* is single-sourced.

Decorrelated (candidates 3/4/5, folded into design/tasks): sensitive-field name list is single-sourced at `src/shared/constants` and derived by both `LOG_REDACT`/redact.paths and `OPLOG_MASK_FIELDS`.

## References

- Planning artifacts: `openspec/changes/add-structured-logging-collection/` (proposal.md, specs/logging/spec.md, design.md, tasks.md)

- Term definition: [CONTEXT.md](../../CONTEXT.md) → *Request-logging module*

- Precedent for depth-as-locality: [ADR 0005](../../docs/adr/0005-anonymous-visitor-access.md) (guard-chain shallowness collapsed into one orchestrator)

