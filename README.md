# Hospy Online

Multi-agent hospital system built on the [Invariance SDK](https://github.com/Hardik-Singh/invariance-sdk). Six autonomous agents handle patient care — from triage to discharge — with cryptographic audit trails, inter-agent contracts, and dual-signed communication.

## Agents

| Agent | Identity | Role |
|-------|----------|------|
| Triage | `hospy/triage` | Assess vitals, calculate severity, route to doctor |
| Doctor | `hospy/dr-general` | Diagnose, order labs/imaging, prescribe |
| Nurse | `hospy/nurse-ward-a` | Administer meds, monitor vitals, shift handoffs |
| Pharmacy | `hospy/pharmacy` | Validate prescriptions, check interactions, dispense |
| Radiologist | `hospy/radiology` | Read imaging, deliver reports via A2A |
| Admin | `hospy/admin` | Billing, discharge summaries, eval checks |

## Flows

```bash
pnpm intake       # 01 — Patient intake & triage
pnpm diagnosis    # 02 — Diagnosis & treatment
pnpm prescription # 03 — Prescription fulfillment (contracts)
pnpm imaging      # 04 — Imaging request (A2A)
pnpm handoff      # 05 — Nurse shift handoff (A2A)
pnpm discharge    # 06 — Discharge & eval suite
pnpm journey      # 07 — Full patient journey (all agents)
```

## Setup

Requires the Invariance SDK cloned alongside this repo:

```bash
git clone https://github.com/Hardik-Singh/invariance-sdk.git ../Invariance/invariance-sdk
cd hospy-online
pnpm install
pnpm journey   # runs the full patient journey
```

Runs in mock mode by default (no backend needed). To connect to a live Invariance backend:

```bash
cp .env.example .env
# Edit .env with your API key and private key
```

## SDK Features Exercised

- **Sessions & Receipts** — Hash-chained audit trail for every clinical action
- **`wrap()` with Policies** — Prescription dosage limits, imaging justification requirements
- **Contracts** — Doctor → Pharmacy prescription fulfillment via propose/accept/deliver/settle
- **A2A Communication** — Doctor ↔ Radiologist imaging reports, Nurse ↔ Nurse shift handoffs
- **Identity** — HKDF-derived keypairs from a single owner key
- **EvalSuite** — Discharge completeness checks (all required actions present)
- **Chain Verification** — Cryptographic integrity verification for every agent session

## DX Evaluation

See [DX-NOTES.md](DX-NOTES.md) for SDK friction points observed while building this system.
