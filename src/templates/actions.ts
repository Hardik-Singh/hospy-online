import { action } from '@invariance/sdk';
import type { Vitals, TriageResult, LabOrder, LabResult, ImagingOrder, RadiologyReport, Prescription, DispenseRecord, MedicationAdministration, Diagnosis, DischargeSummary, BillingItem } from '../lib/types.js';

// ── Triage ──

export const triageAssess = action<
  { patientId: string; chiefComplaint: string; vitals: Vitals },
  { result: TriageResult }
>({
  label: 'Triage Assessment',
  category: 'clinical',
  description: 'Assess patient severity and route to appropriate provider',
  highlights: ['chiefComplaint', 'severity'],
});

// ── Doctor ──

export const diagnose = action<
  { patientId: string; findings: string; labs?: LabResult[]; imaging?: RadiologyReport },
  { diagnosis: Diagnosis }
>({
  label: 'Diagnose',
  category: 'clinical',
  description: 'Make a clinical diagnosis based on findings',
  highlights: ['findings', 'diagnosis'],
});

export const orderLabs = action<
  { patientId: string; orders: LabOrder[] },
  { orderId: string; tests: string[] }
>({
  label: 'Order Labs',
  category: 'clinical',
  description: 'Order laboratory tests for a patient',
});

export const orderImaging = action<
  { patientId: string; order: ImagingOrder },
  { orderId: string; modality: string }
>({
  label: 'Order Imaging',
  category: 'clinical',
  description: 'Request diagnostic imaging',
});

export const prescribe = action<
  { patientId: string; prescription: Prescription; amountUsd?: number },
  { prescriptionId: string; warnings: string[] }
>({
  label: 'Prescribe Medication',
  category: 'clinical',
  description: 'Write a prescription for a patient',
  highlights: ['medication', 'dosage'],
});

// ── Pharmacy ──

export const validatePrescription = action<
  { prescriptionId: string; prescription: Prescription; patientAllergies: string[] },
  { valid: boolean; interactions: string[]; warnings: string[] }
>({
  label: 'Validate Prescription',
  category: 'pharmacy',
  description: 'Check drug interactions and contraindications',
});

export const dispenseMedication = action<
  { prescriptionId: string; medication: string; dosage: string },
  { dispenseRecord: DispenseRecord }
>({
  label: 'Dispense Medication',
  category: 'pharmacy',
  description: 'Dispense validated medication to patient',
});

// ── Nurse ──

export const administerMedication = action<
  { patientId: string; medication: string; dosage: string; prescriptionId: string; vitals: Vitals },
  { administration: MedicationAdministration }
>({
  label: 'Administer Medication',
  category: 'nursing',
  description: 'Administer medication and record vitals',
});

export const monitorVitals = action<
  { patientId: string; vitals: Vitals },
  { stable: boolean; alerts: string[] }
>({
  label: 'Monitor Vitals',
  category: 'nursing',
  description: 'Record and assess patient vital signs',
});

export const nurseHandoff = action<
  { patientId: string; status: string; medications: string[]; alerts: string[] },
  { acknowledged: boolean }
>({
  label: 'Nurse Shift Handoff',
  category: 'nursing',
  description: 'Transfer patient care between nurses',
});

// ── Radiology ──

export const readImaging = action<
  { orderId: string; modality: string; bodyPart: string; images: string[] },
  { report: RadiologyReport }
>({
  label: 'Read Imaging',
  category: 'radiology',
  description: 'Interpret diagnostic images and produce report',
});

// ── Admin ──

export const discharge = action<
  { patientId: string; summary: DischargeSummary },
  { dischargeId: string }
>({
  label: 'Discharge Patient',
  category: 'admin',
  description: 'Process patient discharge with full summary',
});

export const billPatient = action<
  { patientId: string; items: BillingItem[]; amountUsd: number },
  { invoiceId: string; totalUsd: number }
>({
  label: 'Generate Bill',
  category: 'admin',
  description: 'Generate billing invoice for patient stay',
});
