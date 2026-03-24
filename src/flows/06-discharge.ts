/**
 * Flow 06: Discharge
 *
 * Admin compiles billing from all agent sessions, generates discharge summary,
 * and runs eval suite to verify completeness of the patient record.
 *
 * SDK features: EvalSuite, TraceQuery, session(), wrap(), assertions
 */
import '../lib/mock-transport.js';
import { EvalSuite } from '@invariance/sdk';
import { createHospital, section, printReceipt } from '../lib/hospital.js';
import type { Patient, Diagnosis, Prescription, BillingItem } from '../lib/types.js';

async function main() {
  console.log('\x1b[1m🏥 Hospy Online — Flow 06: Discharge\x1b[0m\n');

  const hospital = createHospital();

  const patient: Patient = {
    id: 'PT-001',
    name: 'Maria Garcia',
    age: 45,
    sex: 'F',
    allergies: ['penicillin'],
    medicalHistory: ['hypertension', 'type 2 diabetes'],
  };

  const diagnoses: Diagnosis[] = [
    {
      icdCode: 'E11.65',
      description: 'Type 2 diabetes with hyperglycemia',
      confidence: 'confirmed',
      diagnosedBy: hospital.doctor.identity,
    },
    {
      icdCode: 'I10',
      description: 'Essential hypertension',
      confidence: 'confirmed',
      diagnosedBy: hospital.doctor.identity,
    },
  ];

  const medications: Prescription[] = [
    {
      medication: 'Metformin XR',
      dosage: '1000mg',
      frequency: 'twice daily',
      duration: '90 days',
      route: 'oral',
      prescribedBy: hospital.doctor.identity,
      isControlled: false,
    },
    {
      medication: 'Lisinopril',
      dosage: '10mg',
      frequency: 'once daily',
      duration: '90 days',
      route: 'oral',
      prescribedBy: hospital.doctor.identity,
      isControlled: false,
    },
  ];

  // ── Generate bill ──
  section('Generate Bill');

  hospital.admin.open('discharge-PT-001');

  const billingItems: BillingItem[] = [
    { code: '99213', description: 'Office visit, established patient', amountUsd: 150, category: 'physician' },
    { code: '80053', description: 'Comprehensive metabolic panel', amountUsd: 45, category: 'lab' },
    { code: '85025', description: 'Complete blood count', amountUsd: 35, category: 'lab' },
    { code: '83036', description: 'HbA1c', amountUsd: 55, category: 'lab' },
    { code: '71046', description: 'Chest X-ray, 2 views', amountUsd: 120, category: 'imaging' },
    { code: 'RX-001', description: 'Metformin XR 1000mg #60', amountUsd: 25, category: 'pharmacy' },
    { code: 'RX-002', description: 'Lisinopril 10mg #30', amountUsd: 15, category: 'pharmacy' },
  ];

  const { invoiceId, totalUsd, receipt: billReceipt } = await hospital.admin.generateBill(patient.id, billingItems);
  printReceipt(`Bill (${invoiceId})`, billReceipt);
  console.log(`  Total: $${totalUsd}`);
  for (const item of billingItems) {
    console.log(`    ${item.code} — ${item.description}: $${item.amountUsd}`);
  }

  // ── Discharge ──
  section('Discharge');

  const { summary, receipt: dcReceipt } = await hospital.admin.discharge(
    patient,
    diagnoses,
    medications,
    ['Venipuncture', 'Chest radiograph'],
    '2026-03-22T08:00:00Z',
  );
  printReceipt('Discharge', dcReceipt);
  console.log(`  Diagnoses: ${summary.diagnoses.length}`);
  console.log(`  Medications: ${summary.medications.length}`);
  console.log(`  Follow-up: ${summary.followUp.join('; ')}`);

  // ── Eval Suite: Verify discharge completeness ──
  section('Eval Suite: Discharge Completeness');

  const adminSession = hospital.admin.getSession()!;
  const receipts = adminSession.getReceipts();

  const evalSuite = new EvalSuite()
    .add('has_billing', (q) => {
      const billingReceipts = q.ofType('bill_patient').all();
      if (billingReceipts.length === 0) throw new Error('Missing billing record');
    })
    .add('has_discharge', (q) => {
      const dischargeReceipts = q.ofType('discharge').all();
      if (dischargeReceipts.length === 0) throw new Error('Missing discharge record');
    })
    .add('billing_under_cap', (q) => {
      const billingReceipts = q.ofType('bill_patient').all();
      for (const r of billingReceipts) {
        const total = (r.output as Record<string, unknown>)?.totalUsd as number;
        if (total > 100_000) throw new Error(`Bill exceeds $100k cap: $${total}`);
      }
    })
    .add('chain_integrity', async () => {
      const verification = await adminSession.verify();
      if (!verification.valid) throw new Error(`Chain broken: ${JSON.stringify(verification.errors)}`);
    });

  const results = await evalSuite.run(receipts);
  for (const result of results) {
    const icon = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${result.name} (${result.duration_ms}ms)${result.reason ? ` — ${result.reason}` : ''}`);
  }

  const passRate = results.filter(r => r.passed).length / results.length;
  console.log(`\n  Pass rate: ${(passRate * 100).toFixed(0)}%`);

  // ── Cleanup ──
  await hospital.admin.close();
  await hospital.shutdown();
  console.log('\n\x1b[32m✓ Flow 06 complete\x1b[0m\n');
}

main().catch(console.error);
