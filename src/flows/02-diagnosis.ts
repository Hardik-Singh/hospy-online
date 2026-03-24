/**
 * Flow 02: Diagnosis & Treatment
 *
 * Doctor reviews triage notes, orders labs, interprets results,
 * makes diagnosis, and writes prescription.
 *
 * SDK features: session(), wrap() with policies, record(), chain verification
 */
import '../lib/mock-transport.js';
import { createHospital, section, printReceipt } from '../lib/hospital.js';
import type { Patient, Vitals, LabOrder, LabResult, Prescription } from '../lib/types.js';

async function main() {
  console.log('\x1b[1m🏥 Hospy Online — Flow 02: Diagnosis & Treatment\x1b[0m\n');

  const hospital = createHospital();

  const patient: Patient = {
    id: 'PT-001',
    name: 'Maria Garcia',
    age: 45,
    sex: 'F',
    allergies: ['penicillin'],
    medicalHistory: ['hypertension', 'type 2 diabetes'],
  };

  // ── Triage (quick) ──
  section('Triage');
  hospital.triage.startShift('morning');
  const vitals: Vitals = {
    heartRate: 88, bloodPressure: { systolic: 142, diastolic: 88 },
    temperature: 99.1, oxygenSaturation: 97, respiratoryRate: 18, painLevel: 5,
  };
  const { result: triage } = await hospital.triage.assess(patient, vitals, 'Persistent headache');

  // ── Doctor consultation ──
  section('Doctor Reviews Triage');
  hospital.doctor.startConsultation(patient.id);

  const reviewReceipt = await hospital.doctor.reviewTriage(patient.id, triage);
  printReceipt('Review triage', reviewReceipt);

  // ── Order labs ──
  section('Order Labs');
  const labOrders: LabOrder[] = [
    { testName: 'CBC', urgency: 'routine', clinicalJustification: 'Headache workup', orderedBy: hospital.doctor.identity },
    { testName: 'BMP', urgency: 'routine', clinicalJustification: 'Check electrolytes, kidney function', orderedBy: hospital.doctor.identity },
    { testName: 'HbA1c', urgency: 'routine', clinicalJustification: 'Diabetes monitoring', orderedBy: hospital.doctor.identity },
  ];

  const { orderId, receipt: labReceipt } = await hospital.doctor.orderLabs(patient.id, labOrders);
  printReceipt(`Labs ordered (${orderId})`, labReceipt);

  // ── Simulated lab results come back ──
  section('Lab Results');
  const labResults: LabResult[] = [
    { testName: 'CBC', value: 'Normal', unit: '', referenceRange: 'Normal', abnormal: false },
    { testName: 'BMP - Sodium', value: '128', unit: 'mEq/L', referenceRange: '136-145', abnormal: true },
    { testName: 'BMP - Potassium', value: '4.2', unit: 'mEq/L', referenceRange: '3.5-5.0', abnormal: false },
    { testName: 'HbA1c', value: '8.2', unit: '%', referenceRange: '<7.0', abnormal: true },
  ];
  for (const lab of labResults) {
    console.log(`  ${lab.testName}: ${lab.value} ${lab.unit} ${lab.abnormal ? '\x1b[31m(abnormal)\x1b[0m' : '\x1b[32m(normal)\x1b[0m'}`);
  }

  // ── Diagnosis ──
  section('Diagnosis');
  const { diagnosis, receipt: dxReceipt } = await hospital.doctor.diagnose(
    patient.id,
    'Headache with hyponatremia (Na 128) and uncontrolled diabetes (HbA1c 8.2%)',
    labResults,
  );
  printReceipt('Diagnosis', dxReceipt);
  console.log(`  ICD: ${diagnosis.icdCode} — ${diagnosis.confidence}`);
  console.log(`  ${diagnosis.description}`);

  // ── Prescribe ──
  section('Prescription');
  const prescription: Prescription = {
    medication: 'Metformin XR',
    dosage: '1000mg',
    frequency: 'twice daily',
    duration: '90 days',
    route: 'oral',
    prescribedBy: hospital.doctor.identity,
    isControlled: false,
  };

  const { prescriptionId, receipt: rxReceipt } = await hospital.doctor.prescribe(patient.id, prescription);
  printReceipt(`Prescription (${prescriptionId})`, rxReceipt);
  console.log(`  ${prescription.medication} ${prescription.dosage} ${prescription.frequency}`);

  // ── Verify chain ──
  section('Chain Verification');
  const docSession = hospital.doctor.getSession()!;
  const verification = await docSession.verify();
  console.log(`  Doctor session chain valid: ${verification.valid}`);
  console.log(`  Receipt count: ${verification.receiptCount}`);

  // ── Cleanup ──
  await hospital.triage.endShift();
  await hospital.doctor.endConsultation();
  await hospital.shutdown();
  console.log('\n\x1b[32m✓ Flow 02 complete\x1b[0m\n');
}

main().catch(console.error);
