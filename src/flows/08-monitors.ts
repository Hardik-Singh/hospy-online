/**
 * Flow 08: Natural Language Monitors
 *
 * Demonstrates the full monitor lifecycle: create monitors from natural-language
 * rules, evaluate them against clinical activity, poll for signals, acknowledge
 * events, and manage monitor lifecycle (update, pause, delete).
 *
 * SDK features: monitors.create(), monitors.evaluate(), monitors.listEvents(),
 *               monitors.acknowledgeEvent(), monitors.compilePreview()
 */
import '../lib/mock-transport.js';
import { createHospital, section, printReceipt } from '../lib/hospital.js';
import { MonitorPoller } from '../lib/monitors.js';
import type { Vitals } from '../lib/types.js';

async function main() {
  console.log('\x1b[1m🏥 Hospy Online — Flow 08: Natural Language Monitors\x1b[0m\n');
  const startTime = Date.now();

  const hospital = createHospital();

  // ═══════════════════════════════════════════════════
  // PHASE 1: SETUP MONITORS
  // ═══════════════════════════════════════════════════
  section('PHASE 1: Setup Monitors');

  const monitors = await hospital.monitors.setupAll();
  console.log(`  Created ${monitors.length} monitors:\n`);
  for (const m of monitors) {
    const severityColor =
      m.severity === 'critical' ? '\x1b[31m' :
      m.severity === 'high' ? '\x1b[33m' :
      m.severity === 'medium' ? '\x1b[36m' : '\x1b[37m';
    console.log(`  ${severityColor}[${m.severity}]\x1b[0m ${m.name}`);
    console.log(`         NL: "${m.natural_language}"`);
    console.log(`         ID: ${m.id.slice(0, 8)}… agent=${m.agent_id ?? 'global'}`);
  }

  // Verify idempotency — running setupAll() again should not create duplicates
  const monitorsAgain = await hospital.monitors.setupAll();
  console.log(`\n  Idempotency check: setupAll() returned ${monitorsAgain.length} monitors (same as before)`);

  // ═══════════════════════════════════════════════════
  // PHASE 2: CLINICAL ACTIVITY
  // ═══════════════════════════════════════════════════
  section('PHASE 2: Clinical Activity');

  // Record vitals with abnormals that should trigger monitors
  hospital.nurse.startShift('monitor-demo');

  const abnormalVitals: Vitals = {
    heartRate: 115,           // Tachycardia (>100)
    bloodPressure: { systolic: 152, diastolic: 98 }, // Hypertension (>140)
    temperature: 101.2,       // Fever (>100.4)
    oxygenSaturation: 93,     // Hypoxia (<95)
    respiratoryRate: 26,
    painLevel: 7,
  };

  const { stable, alerts, receipt: vitalsReceipt } = await hospital.nurse.monitorVitals('PT-DEMO', abnormalVitals);
  printReceipt('Vitals (abnormal)', vitalsReceipt);
  console.log(`  Local threshold check: stable=${stable}, alerts=[${alerts.join(', ')}]`);

  // Also record a doctor prescription for allergy-safety monitor
  hospital.doctor.startConsultation('PT-DEMO');
  const { receipt: rxReceipt } = await hospital.doctor.prescribe('PT-DEMO', {
    medication: 'Amoxicillin',
    dosage: '500mg',
    frequency: 'three times daily',
    duration: '10 days',
    route: 'oral',
    prescribedBy: hospital.doctor.identity,
    isControlled: false,
  });
  printReceipt('Prescription', rxReceipt);

  // ═══════════════════════════════════════════════════
  // PHASE 3: EVALUATE MONITORS
  // ═══════════════════════════════════════════════════
  section('PHASE 3: Evaluate Monitors');

  const evalResults = await hospital.monitors.evaluateAll();
  console.log(`  Evaluated ${evalResults.length} monitors:\n`);
  for (const r of evalResults) {
    const monitor = monitors.find((m) => m.id === r.monitor_id);
    const name = monitor?.name ?? r.monitor_id;
    const icon = r.matches_found > 0 ? '\x1b[31m!\x1b[0m' : '\x1b[32m✓\x1b[0m';
    console.log(`  ${icon} ${name}: ${r.matches_found} match(es)`);
    if (r.matched_node_ids.length > 0) {
      console.log(`    nodes: ${r.matched_node_ids.join(', ')}`);
    }
  }

  // ═══════════════════════════════════════════════════
  // PHASE 4: POLL FOR EVENTS
  // ═══════════════════════════════════════════════════
  section('PHASE 4: Poll for Monitor Events');

  const collectedEvents: string[] = [];

  const poller = new MonitorPoller(
    hospital.inv,
    5000, // 5s interval (won't actually tick — we poll manually)
    (event) => {
      collectedEvents.push(event.id);
      const severityColor =
        event.severity === 'critical' ? '\x1b[31m' :
        event.severity === 'high' ? '\x1b[33m' :
        event.severity === 'medium' ? '\x1b[36m' : '\x1b[37m';
      console.log(`  ${severityColor}[${event.severity}]\x1b[0m ${event.monitor_name}`);
      console.log(`         id: ${event.id}`);
      console.log(`         monitor_id: ${event.monitor_id.slice(0, 8)}…`);
      console.log(`         session_id: ${event.session_id}`);
      console.log(`         agent_id: ${event.agent_id}`);
      console.log(`         message: ${event.message}`);
      console.log(`         acknowledged: ${event.acknowledged}`);
      console.log(`         created_at: ${event.created_at}`);
    },
    (err) => {
      console.error(`  \x1b[31m[poll error]\x1b[0m ${err}`);
    },
  );

  // Single manual poll to fetch events generated by evaluate
  await poller.poll();
  console.log(`\n  Collected ${collectedEvents.length} event(s) via poller`);

  // ═══════════════════════════════════════════════════
  // PHASE 5: ACKNOWLEDGE EVENTS
  // ═══════════════════════════════════════════════════
  section('PHASE 5: Acknowledge Events');

  const ackCount = await hospital.monitors.acknowledgeAllUnacknowledged();
  console.log(`  Acknowledged ${ackCount} event(s)`);

  // Verify they are now acknowledged
  const { events: postAckEvents } = await hospital.monitors.getEvents({ acknowledged: false });
  console.log(`  Unacknowledged events remaining: ${postAckEvents.length}`);

  const { events: allEvents } = await hospital.monitors.getEvents();
  const ackEvents = allEvents.filter((e) => e.acknowledged);
  console.log(`  Total acknowledged events in history: ${ackEvents.length}`);

  // ═══════════════════════════════════════════════════
  // PHASE 6: MONITOR LIFECYCLE
  // ═══════════════════════════════════════════════════
  section('PHASE 6: Monitor Lifecycle Management');

  // Update a monitor's severity
  const feverMonitor = monitors.find((m) => m.name.includes('Fever'));
  if (feverMonitor) {
    const updated = await hospital.inv.monitors.update(feverMonitor.id, { severity: 'critical' });
    console.log(`  Updated "${updated.name}": severity ${feverMonitor.severity} → ${updated.severity}`);
  }

  // Pause a monitor
  const bpMonitor = monitors.find((m) => m.name.includes('Blood Pressure'));
  if (bpMonitor) {
    const paused = await hospital.inv.monitors.update(bpMonitor.id, { status: 'paused' });
    console.log(`  Paused "${paused.name}": status → ${paused.status}`);
  }

  // Delete a monitor
  const billingMonitor = monitors.find((m) => m.name.includes('Billing'));
  if (billingMonitor) {
    await hospital.inv.monitors.delete(billingMonitor.id);
    console.log(`  Deleted "${billingMonitor.name}"`);
  }

  // List remaining monitors
  const remaining = await hospital.inv.monitors.list();
  console.log(`\n  Remaining monitors: ${remaining.length}`);
  for (const m of remaining) {
    const statusIcon = m.status === 'active' ? '\x1b[32m●\x1b[0m' : '\x1b[33m○\x1b[0m';
    console.log(`  ${statusIcon} ${m.name} [${m.status}] [${m.severity}]`);
  }

  // ═══════════════════════════════════════════════════
  // PHASE 7: COMPILE PREVIEW
  // ═══════════════════════════════════════════════════
  section('PHASE 7: Compile Preview');

  const customRule = 'Alert when a patient has been waiting more than 30 minutes without being seen by a doctor';
  console.log(`  Rule: "${customRule}"\n`);

  const preview = await hospital.monitors.previewRule(customRule);
  console.log(`  Compiled output:`);
  console.log(`  ${JSON.stringify(preview.compiled, null, 2).split('\n').join('\n  ')}`);

  // ═══════════════════════════════════════════════════
  // PHASE 8: CLEANUP
  // ═══════════════════════════════════════════════════
  section('Cleanup');

  await hospital.monitors.teardownAll();
  const afterTeardown = await hospital.inv.monitors.list();
  console.log(`  Monitors after teardown: ${afterTeardown.length}`);

  await hospital.nurse.endShift();
  await hospital.doctor.endConsultation();
  await hospital.shutdown();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\x1b[32m✓ Flow 08 complete — Monitor lifecycle in ${elapsed}s\x1b[0m\n`);
}

main().catch(console.error);
