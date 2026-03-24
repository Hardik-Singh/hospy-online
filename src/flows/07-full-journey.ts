/**
 * Flow 07: Full Patient Journey
 *
 * End-to-end orchestration: intake → diagnosis → prescription → imaging →
 * nursing care → discharge. Exercises all agents and SDK features together.
 *
 * SDK features: Everything — sessions, wrap(), contracts, A2A, policies, evals, identity derivation
 */
import '../lib/mock-transport.js';
import { A2AChannel, EvalSuite } from '@invariance/sdk';
import type { A2AEnvelope } from '@invariance/sdk';
import { createHospital, section, printReceipt } from '../lib/hospital.js';
import type { Patient, Vitals, LabOrder, LabResult, ImagingOrder, Prescription, BillingItem, Diagnosis } from '../lib/types.js';

async function main() {
  console.log('\x1b[1m🏥 Hospy Online — Flow 07: Full Patient Journey\x1b[0m\n');
  const startTime = Date.now();

  const hospital = createHospital();

  const patient: Patient = {
    id: 'PT-042',
    name: 'Robert Chen',
    age: 58,
    sex: 'M',
    allergies: ['sulfa drugs'],
    medicalHistory: ['COPD', 'former smoker'],
    insuranceId: 'INS-45678',
  };

  // ═══════════════════════════════════════════════════
  // PHASE 1: INTAKE
  // ═══════════════════════════════════════════════════
  section('PHASE 1: Patient Intake');

  hospital.triage.startShift('morning');

  const vitals: Vitals = {
    heartRate: 96,
    bloodPressure: { systolic: 155, diastolic: 95 },
    temperature: 100.2,
    oxygenSaturation: 93,
    respiratoryRate: 24,
    painLevel: 6,
  };

  const { result: triage, receipt: triageReceipt } = await hospital.triage.assess(
    patient, vitals, 'Worsening shortness of breath and productive cough x 4 days',
  );
  printReceipt('Triage', triageReceipt);
  console.log(`  Severity: ${triage.severity}/10 → ${triage.assignedTo}`);

  // ═══════════════════════════════════════════════════
  // PHASE 2: DIAGNOSIS
  // ═══════════════════════════════════════════════════
  section('PHASE 2: Diagnosis');

  hospital.doctor.startConsultation(patient.id);
  await hospital.doctor.reviewTriage(patient.id, triage);

  // Order labs
  const labOrders: LabOrder[] = [
    { testName: 'CBC with differential', urgency: 'stat', clinicalJustification: 'Infection workup — fever, productive cough', orderedBy: hospital.doctor.identity },
    { testName: 'BMP', urgency: 'stat', clinicalJustification: 'Assess metabolic status', orderedBy: hospital.doctor.identity },
    { testName: 'Procalcitonin', urgency: 'stat', clinicalJustification: 'Bacterial vs viral differentiation', orderedBy: hospital.doctor.identity },
  ];

  const { orderId: labOrderId, receipt: labReceipt } = await hospital.doctor.orderLabs(patient.id, labOrders);
  printReceipt(`Labs (${labOrderId})`, labReceipt);

  // Simulated results
  const labResults: LabResult[] = [
    { testName: 'WBC', value: '14.2', unit: 'K/uL', referenceRange: '4.5-11.0', abnormal: true },
    { testName: 'Neutrophils', value: '82', unit: '%', referenceRange: '40-70', abnormal: true },
    { testName: 'Procalcitonin', value: '2.8', unit: 'ng/mL', referenceRange: '<0.5', abnormal: true },
    { testName: 'BMP', value: 'Normal', unit: '', referenceRange: 'Normal', abnormal: false },
  ];

  console.log('  Lab results:');
  for (const lab of labResults) {
    const flag = lab.abnormal ? '\x1b[31m↑\x1b[0m' : '\x1b[32m✓\x1b[0m';
    console.log(`    ${flag} ${lab.testName}: ${lab.value} ${lab.unit}`);
  }

  // ═══════════════════════════════════════════════════
  // PHASE 3: IMAGING
  // ═══════════════════════════════════════════════════
  section('PHASE 3: Imaging');

  hospital.radiologist.startShift('morning');

  const imagingOrder: ImagingOrder = {
    modality: 'xray',
    bodyPart: 'chest',
    clinicalJustification: 'COPD exacerbation with fever, elevated WBC and procalcitonin — rule out pneumonia',
    urgency: 'stat',
    orderedBy: hospital.doctor.identity,
  };

  const { orderId: imgOrderId, receipt: imgReceipt } = await hospital.doctor.orderImaging(patient.id, imagingOrder);
  printReceipt(`Imaging ordered (${imgOrderId})`, imgReceipt);

  // A2A: Doctor → Radiologist
  const doctorSession = hospital.doctor.getSession()!;
  const doctorA2A = new A2AChannel(doctorSession, hospital.doctor.identity, hospital.doctor.privateKey);

  const { envelope: orderEnv } = await doctorA2A.wrapOutgoing(hospital.radiologist.identity, {
    type: 'imaging_order', orderId: imgOrderId, ...imagingOrder,
  });

  const { verified: orderVerified } = await hospital.radiologist.receiveOrder(
    orderEnv as A2AEnvelope, hospital.doctor.publicKey,
  );
  console.log(`  A2A order verified: ${orderVerified}`);

  // Radiologist reads
  const { report } = await hospital.radiologist.readImaging(imgOrderId, 'xray', 'chest');

  // A2A: Radiologist → Doctor (report)
  const { envelope: reportEnv } = await hospital.radiologist.sendReport(
    hospital.doctor.identity, imgOrderId, report,
  );

  const { verified: reportVerified } = await doctorA2A.wrapIncoming(reportEnv, hospital.radiologist.publicKey);
  console.log(`  A2A report verified: ${reportVerified}`);
  console.log(`  Impression: ${report.impression}`);

  // ═══════════════════════════════════════════════════
  // PHASE 4: DIAGNOSIS & PRESCRIPTION
  // ═══════════════════════════════════════════════════
  section('PHASE 4: Final Diagnosis & Treatment');

  const { diagnosis } = await hospital.doctor.diagnose(
    patient.id,
    'Community-acquired pneumonia — elevated WBC (14.2), procalcitonin (2.8), chest imaging consistent',
    labResults,
    report,
  );
  console.log(`  Diagnosis: ${diagnosis.icdCode} — ${diagnosis.confidence}`);

  // Prescribe antibiotic (avoiding sulfa due to allergy)
  const prescription: Prescription = {
    medication: 'Levofloxacin',
    dosage: '750mg',
    frequency: 'once daily',
    duration: '7 days',
    route: 'oral',
    prescribedBy: hospital.doctor.identity,
    isControlled: false,
  };

  const { prescriptionId, receipt: rxReceipt } = await hospital.doctor.prescribe(patient.id, prescription);
  printReceipt(`Prescription (${prescriptionId})`, rxReceipt);

  // ═══════════════════════════════════════════════════
  // PHASE 5: PHARMACY
  // ═══════════════════════════════════════════════════
  section('PHASE 5: Pharmacy Fulfillment');

  hospital.pharmacy.open('fulfillment');

  // Contract: Doctor → Pharmacy
  const contract = await hospital.inv.proposeContract(hospital.pharmacy.identity, {
    description: `Fulfill Levofloxacin 750mg for PT-042`,
    deliverables: ['Validate prescription', 'Check interactions', 'Dispense'],
  });
  console.log(`  Contract: ${contract.id.slice(0, 8)}…`);

  const { valid, warnings } = await hospital.pharmacy.validatePrescription(
    prescriptionId, prescription, patient.allergies,
  );
  console.log(`  Validation: ${valid ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  if (warnings.length > 0) console.log(`  Warnings: ${warnings.join('; ')}`);

  await hospital.inv.acceptContract(contract.id, 'mock-terms-hash');
  const { dispenseRecord } = await hospital.pharmacy.dispense(prescriptionId, prescription.medication, prescription.dosage);
  console.log(`  Dispensed: ${dispenseRecord.medication} ${dispenseRecord.dosage} x${dispenseRecord.quantity}`);

  await hospital.inv.deliver(contract.id, { ...dispenseRecord as unknown as Record<string, unknown> });

  // ═══════════════════════════════════════════════════
  // PHASE 6: NURSING CARE
  // ═══════════════════════════════════════════════════
  section('PHASE 6: Nursing Care');

  hospital.nurse.startShift('day');

  const { administration } = await hospital.nurse.administerMedication(
    patient.id, prescription.medication, prescription.dosage, prescription.route, prescriptionId, vitals,
  );
  console.log(`  Administered: ${administration.medication} ${administration.dosage} via ${administration.route}`);

  // Monitor vitals post-medication (improving)
  const improvedVitals: Vitals = {
    heartRate: 84, bloodPressure: { systolic: 138, diastolic: 85 },
    temperature: 99.4, oxygenSaturation: 96, respiratoryRate: 20, painLevel: 3,
  };
  const { stable, alerts } = await hospital.nurse.monitorVitals(patient.id, improvedVitals);
  console.log(`  Post-treatment vitals: stable=${stable}${alerts.length > 0 ? ` alerts=${alerts.join(',')}` : ''}`);

  // ═══════════════════════════════════════════════════
  // PHASE 7: DISCHARGE
  // ═══════════════════════════════════════════════════
  section('PHASE 7: Discharge');

  hospital.admin.open('discharge-PT-042');

  const billingItems: BillingItem[] = [
    { code: '99223', description: 'Initial hospital care, high complexity', amountUsd: 350, category: 'physician' },
    { code: '85025', description: 'CBC with differential', amountUsd: 40, category: 'lab' },
    { code: '80048', description: 'BMP', amountUsd: 45, category: 'lab' },
    { code: '84145', description: 'Procalcitonin', amountUsd: 95, category: 'lab' },
    { code: '71046', description: 'Chest X-ray, 2 views', amountUsd: 120, category: 'imaging' },
    { code: 'RX-LEV', description: 'Levofloxacin 750mg #7', amountUsd: 85, category: 'pharmacy' },
    { code: 'ADM-1D', description: 'Room & board, 1 day', amountUsd: 2200, category: 'room' },
  ];

  const { invoiceId, totalUsd } = await hospital.admin.generateBill(patient.id, billingItems);
  console.log(`  Invoice: ${invoiceId} — Total: $${totalUsd}`);

  const allDiagnoses: Diagnosis[] = [diagnosis];
  const { summary } = await hospital.admin.discharge(
    patient, allDiagnoses, [prescription], ['Chest radiograph', 'Venipuncture x3'], '2026-03-23T06:00:00Z',
  );
  console.log(`  Discharged: ${summary.diagnoses.length} diagnosis, ${summary.medications.length} medication`);
  console.log(`  Follow-up: ${summary.followUp.join('; ')}`);

  // ═══════════════════════════════════════════════════
  // VERIFICATION
  // ═══════════════════════════════════════════════════
  section('Verification — All Agent Chains');

  const chains = [
    { name: 'Triage', session: hospital.triage.getSession() },
    { name: 'Doctor', session: hospital.doctor.getSession() },
    { name: 'Radiologist', session: hospital.radiologist.getSession() },
    { name: 'Pharmacy', session: hospital.pharmacy.getSession() },
    { name: 'Nurse', session: hospital.nurse.getSession() },
    { name: 'Admin', session: hospital.admin.getSession() },
  ];

  let totalReceipts = 0;
  for (const { name, session } of chains) {
    if (!session) { console.log(`  ${name}: no session`); continue; }
    const v = await session.verify();
    totalReceipts += v.receiptCount;
    const icon = v.valid ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${name}: ${v.receiptCount} receipts, valid=${v.valid}`);
  }

  // ── Eval Suite ──
  section('Eval Suite: Journey Completeness');

  // Collect all receipts across all sessions
  const allReceipts = chains
    .filter(c => c.session)
    .flatMap(c => c.session!.getReceipts());

  const evalSuite = new EvalSuite()
    .add('has_triage', (q) => {
      if (q.ofType('triage_assess').count() === 0) throw new Error('Missing triage');
    })
    .add('has_diagnosis', (q) => {
      if (q.ofType('diagnose').count() === 0) throw new Error('Missing diagnosis');
    })
    .add('has_prescription', (q) => {
      if (q.ofType('prescribe').count() === 0) throw new Error('Missing prescription');
    })
    .add('has_imaging', (q) => {
      if (q.ofType('read_imaging').count() === 0) throw new Error('Missing imaging read');
    })
    .add('has_medication_admin', (q) => {
      if (q.ofType('administer_medication').count() === 0) throw new Error('Missing medication administration');
    })
    .add('has_discharge', (q) => {
      if (q.ofType('discharge').count() === 0) throw new Error('Missing discharge');
    })
    .add('has_billing', (q) => {
      if (q.ofType('bill_patient').count() === 0) throw new Error('Missing billing');
    });

  const results = await evalSuite.run(allReceipts);
  for (const result of results) {
    const icon = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${result.name}${result.reason ? ` — ${result.reason}` : ''}`);
  }

  const passRate = results.filter(r => r.passed).length / results.length;
  console.log(`\n  Pass rate: ${(passRate * 100).toFixed(0)}% | Total receipts: ${totalReceipts}`);

  // ── Cleanup ──
  await hospital.triage.endShift();
  await hospital.doctor.endConsultation();
  await hospital.radiologist.endShift();
  await hospital.pharmacy.close();
  await hospital.nurse.endShift();
  await hospital.admin.close();
  await hospital.shutdown();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\x1b[32m✓ Flow 07 complete — Full patient journey in ${elapsed}s\x1b[0m\n`);
}

main().catch(console.error);
