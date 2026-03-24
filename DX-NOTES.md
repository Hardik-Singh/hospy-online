# Invariance SDK — Developer Experience Notes

Friction points observed while building a multi-agent hospital system with `@invariance/sdk` v0.2.1 (local build, not the stale npm v0.1.1).

## SDK DX Scorecard

| Area | Score (1-5) | Notes |
|------|:-----------:|-------|
| Initialization | 4 | `Invariance.init()` is clean. `generateKeypair()` just works. |
| Session management | 4 | `session()` vs `createSession()` is a nice lazy/eager split, but undocumented |
| Receipt recording | 3 | `record()` requires manual `as unknown as Record<string, unknown>` casts for typed objects |
| Policy engine | 4 | Declarative rules + custom predicates work well. Composition is clear. |
| A2A communication | 3 | Works, but A2AChannel constructor signature is non-obvious. Public key exchange is manual. |
| Contract settlement | 3 | Full lifecycle works, but requires two SDK instances which adds ceremony |
| Observability/tracing | 4 | `wrap()` vs `trace()` split is clean once you understand it |
| Identity/crypto | 5 | `deriveAgentKeypair()` is elegant — deterministic HKDF with zero server-side key management |
| Error handling | 4 | `InvarianceError` codes are machine-readable and useful |
| Type safety | 3 | Types exist but SDK forces `Record<string, unknown>` for input/output, losing domain types |
| Documentation | 2 | README is minimal. No docs site (expired SSL). Examples exist but are hard to discover. |
| TraceQuery | 3 | `ofType()`, `byAgent()`, `all()` are clean, but naming isn't guessable without reading source |

## Critical Issues

### 1. npm package is stale (blocks adoption)
Published `@invariance/sdk@0.1.1` has blockchain deps (viem, merkle-tree) — completely different from the current Ed25519 SDK. Anyone running `pnpm add @invariance/sdk` gets a broken package.

### 2. No working documentation
- `docs.invariance.dev` has expired SSL cert → ERR_CERT_DATE_INVALID
- `invariance.dev` is someone else's blog
- README has a 10-line quickstart and nothing else
- AI agents (like Claude) cannot `curl` any docs to learn the SDK

### 3. `Record<string, unknown>` tax
Every `Action.input` and `Action.output` is typed as `Record<string, unknown>`. When building with domain types (Patient, Vitals, Prescription), you need ugly casts everywhere:
```typescript
// This is what you have to write
input: { vitals: vitals as unknown as Record<string, unknown> }
// vs what you'd want
input: { vitals }
```
The `action<TInput, TOutput>()` template system exists but doesn't flow through to `session.record()` — only to `inv.agent().session().record()`, which has a different API.

## Major Issues

### 4. TraceQuery API naming
Methods are `ofType()`, `byAgent()`, `all()`, `count()` — but without docs, you'd guess `filter()`, `where()`, `results()`, `length`. I initially wrote `.filter({ action: 'x' }).receipts()` and only discovered the real API by reading `trace-query.ts` source.

### 5. A2A envelope return type
`A2AChannel.wrapOutgoing()` returns `{ envelope: A2AEnvelope, receipt: Receipt }` — but if you wrap it in a helper method and return `envelope: unknown`, you lose the type and need manual casting. The SDK should export `A2AEnvelope` more prominently (it's exported but not in the main docs).

### 6. `session()` vs `createSession()` undocumented
`session()` is lazy (returns immediately, creates session in background), `createSession()` awaits backend init. This is important but only explained in source code comments. The README example uses `createSession()` with `await`, which is the safer pattern.

### 7. Contract flow requires managing two SDK instances
To test contracts (requestor/provider), you need two `Invariance.init()` calls or use the same instance for both roles. The SDK doesn't have a clean "act as provider" pattern — you use the same `inv.proposeContract()` / `inv.acceptContract()` methods with different private keys.

### 8. `wrap()` output coercion
`wrap()` auto-captures the function return value as `output`, but coerces non-object returns via `{ value: result }`. This is surprising — if your function returns a string, the receipt gets `{ value: "..." }` not the string.

## Minor Issues

### 9. Mock transport pattern undocumented
The SDK's own tests use `vi.stubGlobal('fetch', ...)` but there's no guidance for consumers who want to run offline/mock mode. We had to build our own mock transport.

### 10. `agent` field on `record()` vs session agent
When using `session.record()`, you can omit `agent` and it defaults to the session's agent. But if you explicitly set it to a different agent, it throws. This is correct but the error message could explain that receipts must match the session agent.

### 11. `sortedStringify` divergence risk
Both SDK and backend implement `sortedStringify()` independently. If they ever diverge, hash chains break silently. This is documented in CLAUDE.md but not in any consumer-facing docs.

### 12. No `inv.agent()` examples in README
The `inv.agent({ id, privateKey, actions })` pattern is powerful (typed actions, allow/deny lists) but has zero documentation outside the CLAUDE.md and source code.

## What Works Well

- **`deriveAgentKeypair()`** — The HKDF derivation model is brilliant. One owner key → deterministic agent keys. No key distribution problem.
- **Hash chaining** — `previousHash` → `hash` linking is automatic and `session.verify()` just works.
- **`wrap()` with policies** — The execute-then-record pattern with pre-flight policy checks is exactly right for agent safety.
- **`EvalSuite`** — Chainable `.add()` + `.addJudge()` is clean. Running evals over receipts is a natural pattern.
- **Error codes** — `POLICY_DENIED`, `CHAIN_BROKEN`, `SESSION_CLOSED` etc. are machine-readable and actionable.
- **A2A dual-signing** — Once you understand the flow (wrapOutgoing → send → wrapIncoming), it's elegant. Bilateral proof is automatic.
- **Transport batching** — Auto-flush with configurable interval/batch size is production-ready out of the box.
