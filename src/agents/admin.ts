import type { Invariance, Receipt } from '@invariance/sdk';
import { Session } from '@invariance/sdk';
import type { Patient, Diagnosis, Prescription, DischargeSummary, BillingItem } from '../lib/types.js';

export class AdminAgent {
  readonly identity = 'hospy/admin';
  private readonly inv: Invariance;
  private readonly keys: { privateKey: string; publicKey: string };
  private session: Session | null = null;

  constructor(inv: Invariance, keys: { privateKey: string; publicKey: string }) {
    this.inv = inv;
    this.keys = keys;
  }

  open(sessionName: string): void {
    this.session = this.inv.session({ agent: this.identity, name: `admin-${sessionName}` });
  }

  async discharge(
    patient: Patient,
    diagnoses: Diagnosis[],
    medications: Prescription[],
    procedures: string[],
    admissionDate: string,
  ): Promise<{ summary: DischargeSummary; receipt: Receipt }> {
    if (!this.session) throw new Error('Admin session not open');

    const summary: DischargeSummary = {
      patient,
      admissionDate,
      dischargeDate: new Date().toISOString(),
      diagnoses,
      procedures,
      medications,
      followUp: [
        'Follow up with primary care in 7 days',
        'Return to ED if symptoms worsen',
        ...(diagnoses.length > 0 ? [`Specialist referral for ${diagnoses[0].description}`] : []),
      ],
      dischargeInstructions: `Patient ${patient.name} discharged with ${diagnoses.length} diagnose(s). ` +
        `Continue prescribed medications. ${procedures.length > 0 ? `Procedures performed: ${procedures.join(', ')}.` : ''}`,
    };

    const { receipt } = await this.session.wrap(
      {
        action: 'discharge',
        input: {
          patientId: patient.id,
          summary: summary as unknown as Record<string, unknown>,
        },
      },
      () => ({ dischargeId: `DC-${Date.now()}` }),
    );

    return { summary, receipt };
  }

  async generateBill(
    patientId: string,
    items: BillingItem[],
  ): Promise<{ invoiceId: string; totalUsd: number; receipt: Receipt }> {
    if (!this.session) throw new Error('Admin session not open');

    const totalUsd = items.reduce((sum, item) => sum + item.amountUsd, 0);
    const invoiceId = `INV-${Date.now()}`;

    const { receipt } = await this.session.wrap(
      {
        action: 'bill_patient',
        input: {
          patientId,
          items: items as unknown as Record<string, unknown>[],
          amountUsd: totalUsd,
        },
      },
      () => ({ invoiceId, totalUsd }),
    );

    return { invoiceId, totalUsd, receipt };
  }

  async close(): Promise<{ receiptCount: number }> {
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
