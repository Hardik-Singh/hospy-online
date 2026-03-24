import type { Invariance, Receipt } from '@invariance/sdk';
import { Session } from '@invariance/sdk';
import type { Prescription, DispenseRecord } from '../lib/types.js';

// Simulated drug interaction database
const KNOWN_INTERACTIONS: Record<string, string[]> = {
  warfarin: ['aspirin', 'ibuprofen', 'naproxen'],
  metformin: ['contrast dye'],
  lisinopril: ['potassium supplements', 'spironolactone'],
  amoxicillin: ['methotrexate'],
};

export class PharmacyAgent {
  readonly identity = 'hospy/pharmacy';
  private readonly inv: Invariance;
  private readonly keys: { privateKey: string; publicKey: string };
  private session: Session | null = null;

  constructor(inv: Invariance, keys: { privateKey: string; publicKey: string }) {
    this.inv = inv;
    this.keys = keys;
  }

  open(sessionName: string): void {
    this.session = this.inv.session({ agent: this.identity, name: `pharmacy-${sessionName}` });
  }

  async validatePrescription(
    prescriptionId: string,
    prescription: Prescription,
    patientAllergies: string[],
  ): Promise<{ valid: boolean; interactions: string[]; warnings: string[]; receipt: Receipt }> {
    if (!this.session) throw new Error('Pharmacy not open');

    const interactions: string[] = [];
    const warnings: string[] = [];
    const medLower = prescription.medication.toLowerCase();

    // Check drug interactions
    for (const [drug, interactsWith] of Object.entries(KNOWN_INTERACTIONS)) {
      if (medLower.includes(drug)) {
        for (const interact of interactsWith) {
          interactions.push(`${prescription.medication} may interact with ${interact}`);
        }
      }
    }

    // Check allergies
    for (const allergy of patientAllergies) {
      if (medLower.includes(allergy.toLowerCase())) {
        warnings.push(`ALLERGY ALERT: Patient allergic to ${allergy}`);
      }
    }

    // Check controlled substance
    if (prescription.isControlled) {
      warnings.push('Controlled substance — verify prescriber DEA number');
    }

    const valid = warnings.filter(w => w.startsWith('ALLERGY')).length === 0;

    const receipt = await this.session.record({
      action: 'validate_prescription',
      input: {
        prescriptionId,
        prescription: prescription as unknown as Record<string, unknown>,
        patientAllergies,
      },
      output: { valid, interactions, warnings },
    });

    return { valid, interactions, warnings, receipt };
  }

  async dispense(
    prescriptionId: string,
    medication: string,
    dosage: string,
  ): Promise<{ dispenseRecord: DispenseRecord; receipt: Receipt }> {
    if (!this.session) throw new Error('Pharmacy not open');

    const dispenseRecord: DispenseRecord = {
      medication,
      dosage,
      quantity: 30, // standard 30-day supply
      dispensedBy: this.identity,
      interactionsChecked: true,
      warnings: [],
    };

    const receipt = await this.session.record({
      action: 'dispense_medication',
      input: { prescriptionId, medication, dosage },
      output: { dispenseRecord: dispenseRecord as unknown as Record<string, unknown> },
    });

    return { dispenseRecord, receipt };
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
