/** Patient record */
export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: 'M' | 'F' | 'Other';
  allergies: string[];
  medicalHistory: string[];
  insuranceId?: string;
}

/** Vital signs reading */
export interface Vitals {
  heartRate: number;
  bloodPressure: { systolic: number; diastolic: number };
  temperature: number; // Fahrenheit
  oxygenSaturation: number;
  respiratoryRate: number;
  painLevel: number; // 0-10
}

/** Triage assessment result */
export interface TriageResult {
  severity: number; // 1-10 (10 = most urgent)
  chiefComplaint: string;
  vitals: Vitals;
  assignedTo: string; // doctor agent identity
  notes: string;
}

/** Lab order */
export interface LabOrder {
  testName: string;
  urgency: 'stat' | 'routine' | 'urgent';
  clinicalJustification: string;
  orderedBy: string;
}

/** Lab result */
export interface LabResult {
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  abnormal: boolean;
}

/** Imaging order */
export interface ImagingOrder {
  modality: 'xray' | 'ct' | 'mri' | 'ultrasound';
  bodyPart: string;
  clinicalJustification: string;
  urgency: 'stat' | 'routine' | 'urgent';
  orderedBy: string;
}

/** Radiology report */
export interface RadiologyReport {
  modality: string;
  bodyPart: string;
  findings: string;
  impression: string;
  readBy: string;
}

/** Prescription */
export interface Prescription {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: 'oral' | 'iv' | 'im' | 'topical' | 'inhaled';
  prescribedBy: string;
  isControlled: boolean;
}

/** Medication dispensing record */
export interface DispenseRecord {
  medication: string;
  dosage: string;
  quantity: number;
  dispensedBy: string;
  interactionsChecked: boolean;
  warnings: string[];
}

/** Medication administration record */
export interface MedicationAdministration {
  medication: string;
  dosage: string;
  route: string;
  administeredBy: string;
  prescriptionId: string;
  vitalsAtTime: Vitals;
}

/** Diagnosis */
export interface Diagnosis {
  icdCode: string;
  description: string;
  confidence: 'confirmed' | 'provisional' | 'differential';
  diagnosedBy: string;
}

/** Discharge summary */
export interface DischargeSummary {
  patient: Patient;
  admissionDate: string;
  dischargeDate: string;
  diagnoses: Diagnosis[];
  procedures: string[];
  medications: Prescription[];
  followUp: string[];
  dischargeInstructions: string;
}

/** Billing line item */
export interface BillingItem {
  code: string;
  description: string;
  amountUsd: number;
  category: 'room' | 'procedure' | 'lab' | 'imaging' | 'pharmacy' | 'physician';
}
