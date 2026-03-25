import type { CreateMonitorBody } from '@invariance/sdk';

/** Stable app-side identifier for each monitor rule. */
export interface MonitorRule {
  key: string;
  name: string;
  natural_language: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  agent_id?: string;
}

/** Prefix used to encode the stable key in the monitor name. */
export const MONITOR_KEY_PREFIX = 'hospy';

/** Encode a stable key into a monitor name for reconciliation. */
export function encodeMonitorName(key: string, displayName: string): string {
  return `[${MONITOR_KEY_PREFIX}:${key}] ${displayName}`;
}

/** Extract the stable key from an encoded monitor name, or null if not ours. */
export function extractMonitorKey(name: string): string | null {
  const match = name.match(/^\[hospy:([^\]]+)\]/);
  return match ? match[1] : null;
}

/** Convert a MonitorRule to a CreateMonitorBody for the SDK. */
export function toCreateBody(rule: MonitorRule): CreateMonitorBody {
  return {
    name: encodeMonitorName(rule.key, rule.name),
    natural_language: rule.natural_language,
    severity: rule.severity,
    ...(rule.agent_id ? { agent_id: rule.agent_id } : {}),
  };
}

export const hospitalMonitorRules: MonitorRule[] = [
  {
    key: 'nurse-vitals-heart-rate',
    name: 'Tachycardia / Bradycardia',
    natural_language: 'heart rate above 100 or heart rate below 60',
    severity: 'high',
    agent_id: 'hospy/nurse-ward-a',
  },
  {
    key: 'nurse-vitals-hypoxia',
    name: 'Hypoxia',
    natural_language: 'oxygen saturation below 95',
    severity: 'critical',
    agent_id: 'hospy/nurse-ward-a',
  },
  {
    key: 'nurse-vitals-bp',
    name: 'Blood Pressure',
    natural_language: 'systolic above 140 or systolic below 90',
    severity: 'high',
    agent_id: 'hospy/nurse-ward-a',
  },
  {
    key: 'nurse-vitals-fever',
    name: 'Fever',
    natural_language: 'temperature above 100.4',
    severity: 'medium',
    agent_id: 'hospy/nurse-ward-a',
  },
  {
    key: 'doctor-allergy-safety',
    name: 'Allergy Safety',
    natural_language: 'Alert when a medication is prescribed to a patient with a known allergy to that drug class',
    severity: 'critical',
    agent_id: 'hospy/dr-general',
  },
  {
    key: 'doctor-imaging-justification',
    name: 'Imaging Justification',
    natural_language: 'Alert when imaging is ordered without adequate clinical justification',
    severity: 'medium',
    agent_id: 'hospy/dr-general',
  },
  {
    key: 'workflow-missing-triage',
    name: 'Missing Triage',
    natural_language: 'Alert when a diagnosis action is recorded but no triage assessment exists in the session',
    severity: 'low',
  },
  {
    key: 'admin-billing-cap',
    name: 'Billing Cap',
    natural_language: 'Alert when a billing total exceeds $50,000 for a single patient encounter',
    severity: 'high',
    agent_id: 'hospy/admin',
  },
];
