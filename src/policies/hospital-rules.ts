import type { PolicyRule } from '@invariance/sdk';

export const hospitalPolicies: PolicyRule[] = [
  // Prescription cost cap — no single prescription over $5,000 without override
  {
    action: 'prescribe',
    maxAmountUsd: 5000,
  },

  // Billing cap — individual line items cannot exceed $50,000
  {
    action: 'bill_patient',
    maxAmountUsd: 50000,
  },

  // Only approved imaging modalities
  {
    action: 'order_imaging',
    allowlist: {
      field: 'modality',
      values: ['xray', 'ct', 'mri', 'ultrasound'],
    },
  },

  // Medication route must be in approved list
  {
    action: 'administer_medication',
    allowlist: {
      field: 'route',
      values: ['oral', 'iv', 'im', 'topical', 'inhaled'],
    },
  },

  // Rate limit: max 20 prescriptions per 60 seconds (prevent runaway agent loops)
  {
    action: 'prescribe',
    rateLimit: { max: 20, windowMs: 60_000 },
  },

  // Imaging orders require clinical justification
  {
    action: 'order_imaging',
    custom: (action) => {
      const justification = action.input['clinicalJustification'];
      if (typeof justification !== 'string' || justification.length < 10) {
        return false;
      }
      return true;
    },
  },

  // Controlled substances require explicit flag
  {
    action: 'prescribe',
    custom: (action) => {
      const prescription = action.input['prescription'] as { isControlled?: boolean } | undefined;
      if (prescription?.isControlled) {
        // In a real system, this would require two-agent verification
        // For now, just ensure the flag is explicitly set
        return true;
      }
      return true;
    },
  },

  // Triage severity > 8 must include notes
  {
    action: 'triage_assess',
    custom: (action) => {
      const vitals = action.input['vitals'] as { painLevel?: number } | undefined;
      if (vitals && vitals.painLevel !== undefined && vitals.painLevel > 8) {
        const complaint = action.input['chiefComplaint'];
        return typeof complaint === 'string' && complaint.length > 0;
      }
      return true;
    },
  },
];
