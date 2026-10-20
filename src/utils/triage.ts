/**
 * AuraTriage (SirenSight) - Clinical Telemetry & Triage Logic Engine
 */

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

export interface TriageProtocol {
  condition: string;
  conditionName: string;
  esiLevel: string;
  esiColor: string;
  bystanderSteps: string[];
  voiceScript: string;
  edChecklist: string[];
  defaultEtaSeconds: number;
}

/**
 * Calculates Facial Asymmetry Index by comparing vertical eye-to-mouth corner distances.
 * Landmarks:
 * Left Eye (33), Left Mouth (61) -> leftDist
 * Right Eye (263), Right Mouth (291) -> rightDist
 */
export function calculateFacialAsymmetry(leftDist: number, rightDist: number): number {
  if (leftDist <= 0 || rightDist <= 0) return 0;
  const maxDist = Math.max(leftDist, rightDist);
  if (maxDist === 0) return 0;
  const asymmetry = Math.abs(leftDist - rightDist) / maxDist;
  return Number(asymmetry.toFixed(3));
}

/**
 * Classifies facial asymmetry severity
 * < 0.35: Normal facial symmetry
 * >= 0.35 and < 0.42: Noticeable asymmetry
 * >= 0.42: Critical asymmetry (Stroke/Facial droop threshold)
 */
export function classifyAsymmetry(index: number): {
  isAbnormal: boolean;
  isTriggerThreshold: boolean;
  label: string;
  color: string;
} {
  if (index >= 0.42) {
    return {
      isAbnormal: true,
      isTriggerThreshold: true,
      label: 'CRITICAL ASYMMETRY (FACIAL DROOP)',
      color: '#ef4444',
    };
  }
  if (index >= 0.35) {
    return {
      isAbnormal: true,
      isTriggerThreshold: false,
      label: 'MODERATE ASYMMETRY DETECTED',
      color: '#f59e0b',
    };
  }
  return {
    isAbnormal: false,
    isTriggerThreshold: false,
    label: 'NORMAL FACIAL SYMMETRY',
    color: '#10b981',
  };
}

/**
 * Classifies acoustic airway status based on decibels and dominant frequency characteristics
 */
export function classifyAcousticAirway(decibels: number, highFreqRatio = 0): {
  status: 'Normal Breathing' | 'Tachypnea / Hyperventilation' | 'Inspiratory Stridor / Wheezing';
  severity: 'low' | 'medium' | 'high';
  alert: boolean;
} {
  if (decibels >= 72 || (decibels >= 60 && highFreqRatio > 0.4)) {
    return {
      status: 'Inspiratory Stridor / Wheezing',
      severity: 'high',
      alert: true,
    };
  }
  if (decibels >= 58) {
    return {
      status: 'Tachypnea / Hyperventilation',
      severity: 'medium',
      alert: true,
    };
  }
  return {
    status: 'Normal Breathing',
    severity: 'low',
    alert: false,
  };
}

/**
 * Condition-specific triage protocol lookup
 */
export function getTriageProtocol(conditionKey: string): TriageProtocol {
  const normalized = conditionKey.toUpperCase();

  switch (normalized) {
    case 'STROKE':
      return {
        condition: 'STROKE',
        conditionName: 'Acute Ischemic Stroke (LVO Suspected)',
        esiLevel: 'RED - IMMEDIATE (ESI-1)',
        esiColor: '#dc2626',
        defaultEtaSeconds: 320,
        voiceScript:
          'Stroke emergency confirmed. Sit the patient upright at forty-five degrees. Do not give any food, water, or aspirin. Keep the patient calm. Emergency dispatch is alerted and hospital trauma team is standing by.',
        bystanderSteps: [
          'Sit patient upright at 30 to 45 degrees; do NOT give food, water, or aspirin.',
          'Note the exact time symptoms began (critical for tPA or thrombectomy time window).',
          'Loosen any tight clothing around neck; keep patient calm and completely still.',
          'If patient becomes unresponsive or vomits, immediately roll gently onto their left side in Recovery Position.',
        ],
        edChecklist: [
          'Code Stroke Team Paged & Neurointerventionalist on Standby',
          'CT / CTA Neuro Scanner Cleared & Radiologist Alerted',
          'IV tPA (Alteplase / Tenecteplase) Weight-Dosed & Reconstituted',
          'Point-of-Care Blood Glucose & Coagulation Panel Pre-Staged',
        ],
      };

    case 'ANAPHYLAXIS':
      return {
        condition: 'ANAPHYLAXIS',
        conditionName: 'Severe Systemic Anaphylaxis & Airway Compromise',
        esiLevel: 'RED - IMMEDIATE (ESI-1)',
        esiColor: '#dc2626',
        defaultEtaSeconds: 280,
        voiceScript:
          'Severe anaphylaxis detected. Administer epinephrine auto-injector immediately into the outer mid-thigh. Keep the patient flat with legs elevated. Airway trauma bay is prepped.',
        bystanderSteps: [
          'Administer Epinephrine Auto-Injector (EpiPen) immediately into outer mid-thigh.',
          'Keep patient lying flat with legs elevated unless breathing is severely labored.',
          'Remove known allergen trigger; do NOT allow patient to stand or walk.',
          'Prepare secondary epinephrine dose if no clinical improvement within 5 to 10 minutes.',
        ],
        edChecklist: [
          'Video Laryngoscope & Difficult Airway Cart to Bedside',
          'IM Epinephrine 1:1,000 (0.3mg) & IV Infusion Pump Primed',
          'IV Methylprednisolone (125mg) & Diphenhydramine (50mg) Ready',
          'High-Flow Non-Rebreather Mask / Nebulized Albuterol Operational',
        ],
      };

    case 'HEMORRHAGE':
      return {
        condition: 'HEMORRHAGE',
        conditionName: 'Severe Arterial Hemorrhage / Exsanguinating Trauma',
        esiLevel: 'RED - IMMEDIATE (ESI-1)',
        esiColor: '#dc2626',
        defaultEtaSeconds: 240,
        voiceScript:
          'Severe arterial hemorrhage. Apply direct, firm, continuous pressure immediately with clean cloth. If limb bleeding continues, apply tourniquet two inches above wound. Blood bank massive transfusion is pre-activated.',
        bystanderSteps: [
          'Apply direct, firm, continuous bilateral pressure over the bleeding site with sterile dressing.',
          'If arterial limb bleeding does not stop, apply tourniquet 2 to 3 inches above wound (never over a joint).',
          'Keep patient warm with jackets or blankets to prevent trauma-induced hypothermia and coagulopathy.',
          'Do NOT remove original gauze even if soaked through; layer fresh gauze on top and maintain constant pressure.',
        ],
        edChecklist: [
          'Massive Transfusion Protocol (MTP) Activated with Blood Bank',
          '4 Units Uncrossed O-Negative PRBCs & FFP to Trauma Bay 1',
          'Belmont Rapid Infuser & Blood Fluid Warmer Primed',
          'Trauma Surgery Attending & OR-1 Cleared for Damage Control',
        ],
      };

    case 'BURN':
    default:
      return {
        condition: 'BURN',
        conditionName: 'Severe Inhalation Thermal Injury / Cyanosis',
        esiLevel: 'RED - IMMEDIATE (ESI-1)',
        esiColor: '#dc2626',
        defaultEtaSeconds: 350,
        voiceScript:
          'Severe burn and airway trauma. Remove patient from heat source. Cool burns with clean room-temperature water. Do not apply ice. Cover loosely with sterile cloth. Trauma team ready.',
        bystanderSteps: [
          'Remove patient from fire or chemical source; ensure immediate airway patency.',
          'Cool burn area with clean room-temperature water for 10 to 15 minutes (never use ice or greasy ointments).',
          'Cover burn loosely with clean, non-adherent sterile dressing or plastic wrap.',
          'Elevate burned extremities above heart level if possible and monitor respiratory status closely.',
        ],
        edChecklist: [
          'Parkland Formula Resuscitation Calculated (Warm Lactated Ringers Pre-Staged)',
          'Fiberoptic Bronchoscopy Prepped for Inhalation Airway Assessment',
          'Sterile Burn Sheets & Forced-Air Bair Hugger Warming Blanket Placed',
          'Arterial Line Kit & Rapid ABG / Carboxyhemoglobin Cartridges Ready',
        ],
      };
  }
}

/**
 * Format countdown seconds into MM:SS
 */
export function formatETA(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
