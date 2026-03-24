/**
 * Flow 01: Patient Intake
 *
 * Triage agent receives a patient, assesses vitals, calculates severity,
 * and routes to the appropriate doctor.
 *
 * SDK features: init(), generateKeypair(), deriveAgentKeypair(), session(), record(), end()
 */
import '../lib/mock-transport.js';
import { createHospital, section, printReceipt } from '../lib/hospital.js';
import type { Patient, Vitals } from '../lib/types.js';

async function main() {
  console.log('\x1b[1m🏥 Hospy Online — Flow 01: Patient Intake\x1b[0m\n');

  const hospital = createHospital();

  // ── Patient arrives ──
  section('Patient Arrival');

  const patient: Patient = {
    id: 'PT-001',
    name: 'Maria Garcia',
    age: 45,
    sex: 'F',
    allergies: ['penicillin'],
    medicalHistory: ['hypertension', 'type 2 diabetes'],
    insuranceId: 'INS-88234',
  };

  console.log(`  Patient: ${patient.name}, ${patient.age}yo ${patient.sex}`);
  console.log(`  Allergies: ${patient.allergies.join(', ')}`);
  console.log(`  History: ${patient.medicalHistory.join(', ')}`);

  // ── Triage assessment ──
  section('Triage Assessment');

  hospital.triage.startShift('morning-2026-03-23');

  // Normal vitals patient
  const vitals1: Vitals = {
    heartRate: 88,
    bloodPressure: { systolic: 142, diastolic: 88 },
    temperature: 99.1,
    oxygenSaturation: 97,
    respiratoryRate: 18,
    painLevel: 5,
  };

  const { result: triage1, receipt: r1 } = await hospital.triage.assess(
    patient, vitals1, 'Persistent headache and dizziness for 3 days'
  );
  printReceipt('Triage #1', r1);
  console.log(`  Severity: ${triage1.severity}/10 → Routed to: ${triage1.assignedTo}`);

  // Critical vitals patient
  const criticalPatient: Patient = {
    id: 'PT-002',
    name: 'James Wilson',
    age: 67,
    sex: 'M',
    allergies: [],
    medicalHistory: ['coronary artery disease', 'prior MI'],
  };

  const criticalVitals: Vitals = {
    heartRate: 132,
    bloodPressure: { systolic: 85, diastolic: 52 },
    temperature: 101.3,
    oxygenSaturation: 89,
    respiratoryRate: 28,
    painLevel: 9,
  };

  const { result: triage2, receipt: r2 } = await hospital.triage.assess(
    criticalPatient, criticalVitals, 'Crushing chest pain, diaphoresis, shortness of breath'
  );
  printReceipt('Triage #2', r2);
  console.log(`  Severity: ${triage2.severity}/10 → Routed to: ${triage2.assignedTo}`);

  // ── Verify chain ──
  section('Chain Verification');

  const triageSession = hospital.triage.getSession()!;
  const verification = await triageSession.verify();
  console.log(`  Chain valid: ${verification.valid}`);
  console.log(`  Receipt count: ${verification.receiptCount}`);
  if (verification.errors.length > 0) {
    console.log(`  Errors: ${JSON.stringify(verification.errors)}`);
  }

  // ── End shift ──
  section('End Shift');

  const { receiptCount } = await hospital.triage.endShift();
  console.log(`  Triage shift ended. Total receipts: ${receiptCount}`);

  await hospital.shutdown();
  console.log('\n\x1b[32m✓ Flow 01 complete\x1b[0m\n');
}

main().catch(console.error);
