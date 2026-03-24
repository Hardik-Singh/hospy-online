import type { Invariance, Receipt } from '@invariance/sdk';
import { Session } from '@invariance/sdk';
import type { Patient, Vitals, TriageResult } from '../lib/types.js';

export class TriageAgent {
  readonly identity = 'hospy/triage';
  private readonly inv: Invariance;
  private readonly keys: { privateKey: string; publicKey: string };
  private session: Session | null = null;

  constructor(inv: Invariance, keys: { privateKey: string; publicKey: string }) {
    this.inv = inv;
    this.keys = keys;
  }

  startShift(shiftName: string): void {
    this.session = this.inv.session({ agent: this.identity, name: `triage-${shiftName}` });
  }

  async assess(patient: Patient, vitals: Vitals, chiefComplaint: string): Promise<{ result: TriageResult; receipt: Receipt }> {
    if (!this.session) throw new Error('Triage agent not on shift — call startShift() first');

    // Calculate severity based on vitals
    let severity = 3; // baseline
    if (vitals.oxygenSaturation < 92) severity += 3;
    if (vitals.heartRate > 120 || vitals.heartRate < 50) severity += 2;
    if (vitals.bloodPressure.systolic > 180 || vitals.bloodPressure.systolic < 90) severity += 2;
    if (vitals.temperature > 103 || vitals.temperature < 95) severity += 1;
    if (vitals.painLevel >= 8) severity += 1;
    severity = Math.min(10, severity);

    // Route based on severity
    const assignedTo = severity >= 8 ? 'hospy/dr-emergency' : 'hospy/dr-general';

    const triageResult: TriageResult = {
      severity,
      chiefComplaint,
      vitals,
      assignedTo,
      notes: `Patient ${patient.name}, age ${patient.age}. ${chiefComplaint}. Severity: ${severity}/10.`,
    };

    const receipt = await this.session.record({
      action: 'triage_assess',
      input: {
        patientId: patient.id,
        chiefComplaint,
        vitals: vitals as unknown as Record<string, unknown>,
      },
      output: { result: triageResult as unknown as Record<string, unknown> },
    });

    return { result: triageResult, receipt };
  }

  async endShift(): Promise<{ receiptCount: number }> {
    if (!this.session) return { receiptCount: 0 };
    const info = this.session.end();
    this.session = null;
    return { receiptCount: info.receiptCount };
  }

  getSession(): Session | null {
    return this.session;
  }

  get publicKey(): string {
    return this.keys.publicKey;
  }

  get privateKey(): string {
    return this.keys.privateKey;
  }
}
