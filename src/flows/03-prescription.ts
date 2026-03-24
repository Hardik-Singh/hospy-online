/**
 * Flow 03: Prescription Fulfillment
 *
 * Doctor proposes a contract to Pharmacy. Pharmacy validates the prescription
 * (drug interactions, allergies), accepts, dispenses. Uses settlement layer.
 *
 * SDK features: proposeContract(), acceptContract(), deliver(), acceptDelivery(), contractSession()
 */
import '../lib/mock-transport.js';
import { createHospital, section, printReceipt } from '../lib/hospital.js';
import type { Patient, Prescription } from '../lib/types.js';

async function main() {
  console.log('\x1b[1m🏥 Hospy Online — Flow 03: Prescription Fulfillment\x1b[0m\n');

  const hospital = createHospital();

  const patient: Patient = {
    id: 'PT-001',
    name: 'Maria Garcia',
    age: 45,
    sex: 'F',
    allergies: ['penicillin'],
    medicalHistory: ['hypertension', 'type 2 diabetes'],
  };

  const prescription: Prescription = {
    medication: 'Amoxicillin',
    dosage: '500mg',
    frequency: 'three times daily',
    duration: '10 days',
    route: 'oral',
    prescribedBy: hospital.doctor.identity,
    isControlled: false,
  };

  // ── Doctor proposes contract to pharmacy ──
  section('Doctor Proposes Prescription Contract');

  // Note: proposeContract requires the SDK to have a private key set at init time.
  // The contract goes: Doctor (requestor) → Pharmacy (provider)
  const contract = await hospital.inv.proposeContract(hospital.pharmacy.identity, {
    description: `Fulfill prescription for patient ${patient.id}`,
    deliverables: [
      `Validate ${prescription.medication} ${prescription.dosage}`,
      `Check interactions with patient allergies: ${patient.allergies.join(', ')}`,
      `Dispense medication`,
    ],
  });
  console.log(`  Contract proposed: ${contract.id}`);
  console.log(`  Session: ${contract.sessionId}`);

  // ── Pharmacy validates and accepts ──
  section('Pharmacy Validates Prescription');

  hospital.pharmacy.open('fulfillment');

  const { valid, interactions, warnings, receipt: valReceipt } = await hospital.pharmacy.validatePrescription(
    `RX-${Date.now()}`,
    prescription,
    patient.allergies,
  );
  printReceipt('Validation', valReceipt);
  console.log(`  Valid: ${valid}`);
  if (interactions.length > 0) console.log(`  Interactions: ${interactions.join('; ')}`);
  if (warnings.length > 0) console.log(`  Warnings: ${warnings.join('; ')}`);

  // Pharmacy accepts the contract (signs the terms hash)
  // In mock mode we use a placeholder terms hash
  const acceptance = await hospital.inv.acceptContract(contract.id, 'mock-terms-hash');
  console.log(`  Contract accepted: ${acceptance.status}`);

  // ── Pharmacy dispenses (delivery) ──
  section('Pharmacy Dispenses');

  const { dispenseRecord, receipt: dispReceipt } = await hospital.pharmacy.dispense(
    `RX-${Date.now()}`,
    prescription.medication,
    prescription.dosage,
  );
  printReceipt('Dispense', dispReceipt);
  console.log(`  Dispensed: ${dispenseRecord.medication} ${dispenseRecord.dosage} x${dispenseRecord.quantity}`);

  // Submit delivery proof
  const delivery = await hospital.inv.deliver(contract.id, {
    medication: dispenseRecord.medication,
    dosage: dispenseRecord.dosage,
    quantity: dispenseRecord.quantity,
    dispensedBy: dispenseRecord.dispensedBy,
  });
  console.log(`  Delivery submitted: ${delivery.status}`);

  // ── Doctor accepts delivery ──
  section('Doctor Accepts Delivery');
  const settlement = await hospital.inv.acceptDelivery(contract.id, delivery.id, 'mock-output-hash');
  console.log(`  Settlement: ${settlement.status}`);

  // ── Verify pharmacy chain ──
  section('Verification');
  const pharmaSession = hospital.pharmacy.getSession()!;
  const verification = await pharmaSession.verify();
  console.log(`  Pharmacy chain valid: ${verification.valid}`);
  console.log(`  Receipt count: ${verification.receiptCount}`);

  // ── Cleanup ──
  await hospital.pharmacy.close();
  await hospital.shutdown();
  console.log('\n\x1b[32m✓ Flow 03 complete\x1b[0m\n');
}

main().catch(console.error);
