/**
 * Flow 05: Nurse Shift Handoff
 *
 * Outgoing nurse monitors patient vitals, then hands off to incoming nurse
 * via dual-signed A2A messages. Incoming nurse acknowledges and continues care.
 *
 * SDK features: A2AChannel, wrapOutgoing(), wrapIncoming(), session chaining
 */
import '../lib/mock-transport.js';
import { Invariance, deriveAgentKeypair, A2AChannel, Session } from '@invariance/sdk';
import { hospitalPolicies } from '../policies/hospital-rules.js';
import { NurseAgent } from '../agents/nurse.js';
import { section, printReceipt } from '../lib/hospital.js';
import type { Vitals } from '../lib/types.js';

async function main() {
  console.log('\x1b[1m🏥 Hospy Online — Flow 05: Nurse Shift Handoff\x1b[0m\n');

  const ownerKeys = Invariance.generateKeypair();

  const inv = Invariance.init({
    apiKey: 'dev_hospy_mock',
    privateKey: ownerKeys.privateKey,
    policies: hospitalPolicies,
    onError: () => {},
  });

  // Two nurses with different identities
  const nurseAKeys = deriveAgentKeypair(ownerKeys.privateKey, 'hospy/nurse-ward-a');
  const nurseBKeys = deriveAgentKeypair(ownerKeys.privateKey, 'hospy/nurse-ward-b');

  // We'll create nurse B manually since it has a different identity
  const nurseA = new NurseAgent(inv, nurseAKeys);

  // Nurse B is a different instance — simulating a different identity
  // We'll use the SDK directly for nurse B
  const nurseBIdentity = 'hospy/nurse-ward-b';
  const nurseBSession = inv.session({ agent: nurseBIdentity, name: 'nurse-shift-night' });
  const nurseBChannel = new A2AChannel(nurseBSession, nurseBIdentity, nurseBKeys.privateKey);

  // ── Nurse A monitors patient during day shift ──
  section('Nurse A: Day Shift');

  nurseA.startShift('day-2026-03-23');

  const vitals1: Vitals = {
    heartRate: 78, bloodPressure: { systolic: 128, diastolic: 82 },
    temperature: 98.6, oxygenSaturation: 98, respiratoryRate: 16, painLevel: 3,
  };

  const { stable: stable1, alerts: alerts1, receipt: v1 } = await nurseA.monitorVitals('PT-001', vitals1);
  printReceipt('Vitals check #1', v1);
  console.log(`  Stable: ${stable1}${alerts1.length > 0 ? ` Alerts: ${alerts1.join(', ')}` : ''}`);

  // 2 hours later, patient condition changes
  const vitals2: Vitals = {
    heartRate: 105, bloodPressure: { systolic: 145, diastolic: 92 },
    temperature: 100.8, oxygenSaturation: 94, respiratoryRate: 22, painLevel: 6,
  };

  const { stable: stable2, alerts: alerts2, receipt: v2 } = await nurseA.monitorVitals('PT-001', vitals2);
  printReceipt('Vitals check #2', v2);
  console.log(`  Stable: ${stable2}${alerts2.length > 0 ? ` Alerts: \x1b[33m${alerts2.join(', ')}\x1b[0m` : ''}`);

  // ── Nurse A sends handoff to Nurse B ──
  section('A2A: Nurse A → Nurse B (Handoff)');

  const { receipt: handoffSendReceipt, envelope } = await nurseA.sendHandoff(
    nurseBIdentity,
    'PT-001',
    'Condition deteriorating — fever developing, tachycardia, borderline hypoxia',
    ['Metformin XR 1000mg BID', 'Lisinopril 10mg daily'],
    alerts2,
  );
  printReceipt('Handoff sent', handoffSendReceipt);

  // ── Nurse B receives and verifies handoff ──
  section('Nurse B: Receives Handoff');

  const { payload, verified, receipt: handoffRecvReceipt } = await nurseBChannel.wrapIncoming(
    envelope as Parameters<A2AChannel['wrapIncoming']>[0],
    nurseA.publicKey,
  );
  printReceipt('Handoff received', handoffRecvReceipt);
  console.log(`  Verified sender: ${verified}`);

  const handoffData = payload as Record<string, unknown>;
  console.log(`  Patient: ${handoffData.patientId}`);
  console.log(`  Status: ${handoffData.status}`);
  console.log(`  Medications: ${(handoffData.medications as string[]).join(', ')}`);
  console.log(`  Active alerts: ${(handoffData.alerts as string[]).join(', ')}`);

  // ── Nurse B continues monitoring ──
  section('Nurse B: Night Shift Monitoring');

  // Nurse B records acknowledgment
  await nurseBSession.record({
    action: 'nurse_handoff',
    input: {
      patientId: 'PT-001',
      status: 'Handoff acknowledged — continuing monitoring',
      medications: handoffData.medications as string[],
      alerts: handoffData.alerts as string[],
    },
    output: { acknowledged: true },
  });

  // ── Verify both chains ──
  section('Chain Verification');

  const nurseAVerify = await nurseA.getSession()!.verify();
  const nurseBVerify = await nurseBSession.verify();
  console.log(`  Nurse A chain: valid=${nurseAVerify.valid}, receipts=${nurseAVerify.receiptCount}`);
  console.log(`  Nurse B chain: valid=${nurseBVerify.valid}, receipts=${nurseBVerify.receiptCount}`);

  // ── Cleanup ──
  await nurseA.endShift();
  nurseBSession.end();
  await inv.shutdown();
  console.log('\n\x1b[32m✓ Flow 05 complete\x1b[0m\n');
}

main().catch(console.error);
