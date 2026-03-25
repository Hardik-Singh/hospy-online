import { Invariance, deriveAgentKeypair } from '@invariance/sdk';
import { hospitalPolicies } from '../policies/hospital-rules.js';
import { TriageAgent } from '../agents/triage.js';
import { DoctorAgent } from '../agents/doctor.js';
import { NurseAgent } from '../agents/nurse.js';
import { PharmacyAgent } from '../agents/pharmacy.js';
import { RadiologistAgent } from '../agents/radiologist.js';
import { AdminAgent } from '../agents/admin.js';
import { HospitalMonitorManager } from './monitors.js';

export interface HospitalSystem {
  inv: Invariance;
  ownerKeys: { privateKey: string; publicKey: string };
  triage: TriageAgent;
  doctor: DoctorAgent;
  nurse: NurseAgent;
  pharmacy: PharmacyAgent;
  radiologist: RadiologistAgent;
  admin: AdminAgent;
  monitors: HospitalMonitorManager;
  shutdown: () => Promise<void>;
}

/**
 * Initialize the full hospital agent system.
 * Each agent gets a deterministically-derived keypair from the owner key.
 */
export function createHospital(): HospitalSystem {
  const ownerKeys = Invariance.generateKeypair();

  const inv = Invariance.init({
    apiKey: process.env.INVARIANCE_API_KEY || 'dev_hospy_mock',
    apiUrl: process.env.INVARIANCE_API_URL || 'https://api.invariance.dev',
    privateKey: ownerKeys.privateKey,
    policies: hospitalPolicies,
    onError: (err) => {
      // Suppress transport errors in mock mode, log real ones
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('fetch')) {
        console.error(`  \x1b[31m[error]\x1b[0m ${msg}`);
      }
    },
  });

  // Derive keypairs for each agent identity
  const triageKeys = deriveAgentKeypair(ownerKeys.privateKey, 'hospy/triage');
  const doctorKeys = deriveAgentKeypair(ownerKeys.privateKey, 'hospy/dr-general');
  const nurseKeys = deriveAgentKeypair(ownerKeys.privateKey, 'hospy/nurse-ward-a');
  const pharmacyKeys = deriveAgentKeypair(ownerKeys.privateKey, 'hospy/pharmacy');
  const radiologistKeys = deriveAgentKeypair(ownerKeys.privateKey, 'hospy/radiology');
  const adminKeys = deriveAgentKeypair(ownerKeys.privateKey, 'hospy/admin');

  const triage = new TriageAgent(inv, triageKeys);
  const doctor = new DoctorAgent(inv, doctorKeys);
  const nurse = new NurseAgent(inv, nurseKeys);
  const pharmacy = new PharmacyAgent(inv, pharmacyKeys);
  const radiologist = new RadiologistAgent(inv, radiologistKeys);
  const admin = new AdminAgent(inv, adminKeys);
  const monitors = new HospitalMonitorManager(inv);

  return {
    inv,
    ownerKeys,
    triage,
    doctor,
    nurse,
    pharmacy,
    radiologist,
    admin,
    monitors,
    shutdown: () => inv.shutdown(),
  };
}

/** Print a section header */
export function section(title: string): void {
  console.log(`\n\x1b[1m\x1b[36m── ${title} ──\x1b[0m`);
}

/** Print a receipt summary */
export function printReceipt(label: string, receipt: { action: string; hash: string; previousHash: string }): void {
  console.log(`  \x1b[32m✓\x1b[0m ${label}: action=${receipt.action} hash=${receipt.hash.slice(0, 12)}… prev=${receipt.previousHash.slice(0, 12)}…`);
}
