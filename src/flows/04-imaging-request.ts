/**
 * Flow 04: Imaging Request
 *
 * Doctor orders imaging → radiologist receives via A2A, reads images,
 * sends report back via A2A. Dual-signed messages create bilateral proof.
 *
 * SDK features: A2AChannel, wrapOutgoing(), wrapIncoming(), wrap() with policies
 */
import '../lib/mock-transport.js';
import { createHospital, section, printReceipt } from '../lib/hospital.js';
import { A2AChannel } from '@invariance/sdk';
import type { A2AEnvelope } from '@invariance/sdk';
import type { ImagingOrder } from '../lib/types.js';

async function main() {
  console.log('\x1b[1m🏥 Hospy Online — Flow 04: Imaging Request\x1b[0m\n');

  const hospital = createHospital();

  // Start shifts for doctor and radiologist
  hospital.doctor.startConsultation('PT-001');
  hospital.radiologist.startShift('morning');

  // Doctor also needs an A2A channel to send orders
  const doctorSession = hospital.doctor.getSession()!;
  const doctorA2A = new A2AChannel(
    doctorSession,
    hospital.doctor.identity,
    hospital.doctor.privateKey,
  );

  // ── Doctor orders imaging ──
  section('Doctor Orders Chest X-Ray');

  const imagingOrder: ImagingOrder = {
    modality: 'xray',
    bodyPart: 'chest',
    clinicalJustification: 'Rule out pneumonia in patient with persistent cough and fever x 5 days',
    urgency: 'urgent',
    orderedBy: hospital.doctor.identity,
  };

  // Record the order (uses wrap() with policy check for clinical justification)
  const { orderId, receipt: orderReceipt } = await hospital.doctor.orderImaging('PT-001', imagingOrder);
  printReceipt(`Imaging ordered (${orderId})`, orderReceipt);

  // ── Doctor sends order to radiologist via A2A ──
  section('A2A: Doctor → Radiologist');

  const { envelope: orderEnvelope, receipt: sendReceipt } = await doctorA2A.wrapOutgoing(
    hospital.radiologist.identity,
    {
      type: 'imaging_order',
      orderId,
      modality: imagingOrder.modality,
      bodyPart: imagingOrder.bodyPart,
      clinicalJustification: imagingOrder.clinicalJustification,
      urgency: imagingOrder.urgency,
    },
  );
  printReceipt('A2A send (order)', sendReceipt);
  console.log(`  Sender signature: ${orderEnvelope.sender_signature.slice(0, 24)}…`);

  // ── Radiologist receives and verifies the order ──
  section('Radiologist Receives Order');

  const { payload: orderPayload, verified: orderVerified, receipt: recvReceipt } =
    await hospital.radiologist.receiveOrder(orderEnvelope, hospital.doctor.publicKey);
  printReceipt('A2A receive (order)', recvReceipt);
  console.log(`  Sender verified: ${orderVerified}`);
  console.log(`  Order: ${JSON.stringify((orderPayload as Record<string, unknown>).modality)} ${(orderPayload as Record<string, unknown>).bodyPart}`);

  // ── Radiologist reads the imaging ──
  section('Radiologist Reads Imaging');

  const { report, receipt: readReceipt } = await hospital.radiologist.readImaging(
    orderId,
    imagingOrder.modality,
    imagingOrder.bodyPart,
  );
  printReceipt('Read imaging', readReceipt);
  console.log(`  Findings: ${report.findings}`);
  console.log(`  Impression: ${report.impression}`);

  // ── Radiologist sends report back to doctor via A2A ──
  section('A2A: Radiologist → Doctor');

  const { envelope: reportEnvelope, receipt: reportSendReceipt } =
    await hospital.radiologist.sendReport(hospital.doctor.identity, orderId, report);
  printReceipt('A2A send (report)', reportSendReceipt);

  // ── Doctor receives the report (manually verifying via A2A channel) ──
  // Note: Doctor doesn't have a separate wrapIncoming in its class,
  // so we use the A2A channel directly — shows raw SDK usage
  const { payload: reportPayload, verified: reportVerified, receipt: reportRecvReceipt } =
    await doctorA2A.wrapIncoming(reportEnvelope as A2AEnvelope, hospital.radiologist.publicKey);
  printReceipt('A2A receive (report)', reportRecvReceipt);
  console.log(`  Sender verified: ${reportVerified}`);
  const reportData = reportPayload as Record<string, unknown>;
  console.log(`  Report type: ${reportData.type}`);

  // ── Verify both chains ──
  section('Chain Verification');

  const doctorVerify = await hospital.doctor.getSession()!.verify();
  const radioVerify = await hospital.radiologist.getSession()!.verify();
  console.log(`  Doctor chain: valid=${doctorVerify.valid}, receipts=${doctorVerify.receiptCount}`);
  console.log(`  Radiologist chain: valid=${radioVerify.valid}, receipts=${radioVerify.receiptCount}`);

  // ── Cleanup ──
  await hospital.doctor.endConsultation();
  await hospital.radiologist.endShift();
  await hospital.shutdown();
  console.log('\n\x1b[32m✓ Flow 04 complete\x1b[0m\n');
}

main().catch(console.error);
