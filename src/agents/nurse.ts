import type { Invariance, Receipt } from '@invariance/sdk';
import { Session, A2AChannel } from '@invariance/sdk';
import type { A2AEnvelope } from '@invariance/sdk';
import type { Vitals, MedicationAdministration } from '../lib/types.js';

export class NurseAgent {
  readonly identity = 'hospy/nurse-ward-a';
  private readonly inv: Invariance;
  private readonly keys: { privateKey: string; publicKey: string };
  private session: Session | null = null;
  private a2aChannel: A2AChannel | null = null;

  constructor(inv: Invariance, keys: { privateKey: string; publicKey: string }) {
    this.inv = inv;
    this.keys = keys;
  }

  startShift(shiftName: string): void {
    this.session = this.inv.session({ agent: this.identity, name: `nurse-${shiftName}` });
    this.a2aChannel = new A2AChannel(this.session, this.identity, this.keys.privateKey);
  }

  async monitorVitals(patientId: string, vitals: Vitals): Promise<{ stable: boolean; alerts: string[]; receipt: Receipt }> {
    if (!this.session) throw new Error('Nurse not on shift');

    const alerts: string[] = [];
    if (vitals.heartRate > 100) alerts.push('Tachycardia');
    if (vitals.heartRate < 60) alerts.push('Bradycardia');
    if (vitals.oxygenSaturation < 95) alerts.push('Low O2 saturation');
    if (vitals.bloodPressure.systolic > 140) alerts.push('Hypertension');
    if (vitals.bloodPressure.systolic < 90) alerts.push('Hypotension');
    if (vitals.temperature > 100.4) alerts.push('Fever');

    const stable = alerts.length === 0;

    const receipt = await this.session.record({
      action: 'monitor_vitals',
      input: {
        patientId,
        vitals: vitals as unknown as Record<string, unknown>,
      },
      output: { stable, alerts },
    });

    return { stable, alerts, receipt };
  }

  async administerMedication(
    patientId: string,
    medication: string,
    dosage: string,
    route: string,
    prescriptionId: string,
    vitals: Vitals,
  ): Promise<{ administration: MedicationAdministration; receipt: Receipt }> {
    if (!this.session) throw new Error('Nurse not on shift');

    const administration: MedicationAdministration = {
      medication,
      dosage,
      route,
      administeredBy: this.identity,
      prescriptionId,
      vitalsAtTime: vitals,
    };

    const { receipt } = await this.session.wrap(
      {
        action: 'administer_medication',
        input: {
          patientId,
          medication,
          dosage,
          route,
          prescriptionId,
          vitals: vitals as unknown as Record<string, unknown>,
        },
      },
      () => ({ administration }),
    );

    return { administration, receipt };
  }

  async sendHandoff(
    toNurse: string,
    patientId: string,
    status: string,
    medications: string[],
    alerts: string[],
  ): Promise<{ receipt: Receipt; envelope: A2AEnvelope }> {
    if (!this.a2aChannel) throw new Error('Nurse not on shift');

    const { envelope, receipt } = await this.a2aChannel.wrapOutgoing(toNurse, {
      type: 'nurse_handoff',
      patientId,
      status,
      medications,
      alerts,
      timestamp: new Date().toISOString(),
    });

    return { receipt, envelope };
  }

  async receiveHandoff(envelope: A2AEnvelope, senderPublicKey: string): Promise<{
    payload: unknown;
    verified: boolean;
    receipt: Receipt;
  }> {
    if (!this.a2aChannel) throw new Error('Nurse not on shift');
    return this.a2aChannel.wrapIncoming(envelope, senderPublicKey);
  }

  async endShift(): Promise<{ receiptCount: number }> {
    if (!this.session) return { receiptCount: 0 };
    const info = this.session.end();
    this.session = null;
    this.a2aChannel = null;
    return { receiptCount: info.receiptCount };
  }

  getSession(): Session | null {
    return this.session;
  }

  getA2AChannel(): A2AChannel | null {
    return this.a2aChannel;
  }

  get publicKey(): string {
    return this.keys.publicKey;
  }

  get privateKey(): string {
    return this.keys.privateKey;
  }
}
