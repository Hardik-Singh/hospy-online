import type { Invariance, Receipt } from '@invariance/sdk';
import { Session, A2AChannel } from '@invariance/sdk';
import type { A2AEnvelope } from '@invariance/sdk';
import type { RadiologyReport } from '../lib/types.js';

export class RadiologistAgent {
  readonly identity = 'hospy/radiology';
  private readonly inv: Invariance;
  private readonly keys: { privateKey: string; publicKey: string };
  private session: Session | null = null;
  private a2aChannel: A2AChannel | null = null;

  constructor(inv: Invariance, keys: { privateKey: string; publicKey: string }) {
    this.inv = inv;
    this.keys = keys;
  }

  startShift(shiftName: string): void {
    this.session = this.inv.session({ agent: this.identity, name: `radiology-${shiftName}` });
    this.a2aChannel = new A2AChannel(this.session, this.identity, this.keys.privateKey);
  }

  async readImaging(
    orderId: string,
    modality: string,
    bodyPart: string,
  ): Promise<{ report: RadiologyReport; receipt: Receipt }> {
    if (!this.session) throw new Error('Radiologist not on shift');

    // Simulated radiology interpretation
    const report: RadiologyReport = {
      modality,
      bodyPart,
      findings: `${modality.toUpperCase()} of ${bodyPart}: No acute abnormality identified. Normal anatomical structures visualized.`,
      impression: `Normal ${modality} of ${bodyPart}. No acute findings.`,
      readBy: this.identity,
    };

    const { receipt } = await this.session.wrap(
      {
        action: 'read_imaging',
        input: {
          orderId,
          modality,
          bodyPart,
          images: [`${orderId}-series-1.dcm`, `${orderId}-series-2.dcm`],
        },
      },
      () => ({ report }),
    );

    return { report, receipt };
  }

  async sendReport(toDoctorIdentity: string, orderId: string, report: RadiologyReport): Promise<{
    receipt: Receipt;
    envelope: A2AEnvelope;
  }> {
    if (!this.a2aChannel) throw new Error('Radiologist not on shift');

    const { envelope, receipt } = await this.a2aChannel.wrapOutgoing(toDoctorIdentity, {
      type: 'radiology_report',
      orderId,
      report,
      timestamp: new Date().toISOString(),
    });

    return { receipt, envelope };
  }

  async receiveOrder(envelope: A2AEnvelope, senderPublicKey: string): Promise<{
    payload: unknown;
    verified: boolean;
    receipt: Receipt;
  }> {
    if (!this.a2aChannel) throw new Error('Radiologist not on shift');
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

  get publicKey(): string {
    return this.keys.publicKey;
  }

  get privateKey(): string {
    return this.keys.privateKey;
  }
}
