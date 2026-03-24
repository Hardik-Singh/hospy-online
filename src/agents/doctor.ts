import type { Invariance, Receipt } from '@invariance/sdk';
import { Session } from '@invariance/sdk';
import type { Patient, Diagnosis, LabOrder, LabResult, ImagingOrder, Prescription, TriageResult, RadiologyReport } from '../lib/types.js';

export class DoctorAgent {
  readonly identity = 'hospy/dr-general';
  private readonly inv: Invariance;
  private readonly keys: { privateKey: string; publicKey: string };
  private session: Session | null = null;

  constructor(inv: Invariance, keys: { privateKey: string; publicKey: string }) {
    this.inv = inv;
    this.keys = keys;
  }

  startConsultation(patientId: string): void {
    this.session = this.inv.session({ agent: this.identity, name: `consult-${patientId}` });
  }

  async reviewTriage(patientId: string, triage: TriageResult): Promise<Receipt> {
    if (!this.session) throw new Error('No active consultation');

    return this.session.record({
      action: 'review_triage',
      input: {
        patientId,
        severity: triage.severity,
        chiefComplaint: triage.chiefComplaint,
        vitals: triage.vitals as unknown as Record<string, unknown>,
      },
      output: { reviewed: true, notes: `Reviewed triage for severity ${triage.severity}/10` },
    });
  }

  async orderLabs(patientId: string, orders: LabOrder[]): Promise<{ orderId: string; receipt: Receipt }> {
    if (!this.session) throw new Error('No active consultation');

    const orderId = `LAB-${Date.now()}`;
    const receipt = await this.session.record({
      action: 'order_labs',
      input: {
        patientId,
        orders: orders as unknown as Record<string, unknown>[],
      },
      output: { orderId, tests: orders.map(o => o.testName) },
    });

    return { orderId, receipt };
  }

  async orderImaging(patientId: string, order: ImagingOrder): Promise<{ orderId: string; receipt: Receipt }> {
    if (!this.session) throw new Error('No active consultation');

    const orderId = `IMG-${Date.now()}`;
    const { receipt } = await this.session.wrap(
      {
        action: 'order_imaging',
        input: {
          patientId,
          modality: order.modality,
          bodyPart: order.bodyPart,
          clinicalJustification: order.clinicalJustification,
          urgency: order.urgency,
          orderedBy: this.identity,
        },
      },
      () => ({ orderId, modality: order.modality }),
    );

    return { orderId, receipt };
  }

  async diagnose(
    patientId: string,
    findings: string,
    labs?: LabResult[],
    imaging?: RadiologyReport,
  ): Promise<{ diagnosis: Diagnosis; receipt: Receipt }> {
    if (!this.session) throw new Error('No active consultation');

    // Simulated clinical reasoning
    const diagnosis: Diagnosis = {
      icdCode: 'J18.9',
      description: `Based on ${findings}. ${labs ? `Lab results reviewed (${labs.length} tests).` : ''} ${imaging ? `Imaging: ${imaging.impression}` : ''}`,
      confidence: labs && imaging ? 'confirmed' : labs ? 'provisional' : 'differential',
      diagnosedBy: this.identity,
    };

    const { receipt } = await this.session.wrap(
      {
        action: 'diagnose',
        input: {
          patientId,
          findings,
          ...(labs ? { labs: labs as unknown as Record<string, unknown> } : {}),
          ...(imaging ? { imaging: imaging as unknown as Record<string, unknown> } : {}),
        },
      },
      () => ({ diagnosis }),
    );

    return { diagnosis, receipt };
  }

  async prescribe(patientId: string, prescription: Prescription): Promise<{ prescriptionId: string; receipt: Receipt }> {
    if (!this.session) throw new Error('No active consultation');

    const prescriptionId = `RX-${Date.now()}`;

    const { receipt } = await this.session.wrap(
      {
        action: 'prescribe',
        input: {
          patientId,
          prescription: prescription as unknown as Record<string, unknown>,
        },
      },
      () => ({ prescriptionId, warnings: [] as string[] }),
    );

    return { prescriptionId, receipt };
  }

  async endConsultation(): Promise<{ receiptCount: number }> {
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
