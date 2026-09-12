import type { MedicationOcrDraft } from './ocr';

export type FormularyDrug = {
  genericName: string;
  brandNames: string[];
  standardStrengths: number[];
  strengthUnit: string;
  standardForms: string[];
  standardRoute: string;
  lasaWarning?: string;
};

/**
 * Curated registry of essential Philippine National Drug Formulary (PNDF)
 * medications commonly prescribed in Philippine eldercare and chronic illness care.
 */
export const PHILIPPINE_DRUG_FORMULARY: FormularyDrug[] = [
  // Cardiovascular & Antihypertensives
  {
    genericName: 'Amlodipine',
    brandNames: ['Norvasc', 'Amlife', 'Amvaz', 'Provasc', 'Lodipine'],
    standardStrengths: [5, 10],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Losartan',
    brandNames: ['Cozaar', 'Lifezar', 'Kenzar', 'Arbloc', 'Losar'],
    standardStrengths: [50, 100],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Metoprolol',
    brandNames: ['Betaloc', 'Neobloc', 'Cardiosel'],
    standardStrengths: [50, 100],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Metoprolol (beta-blocker) vs Metronidazole (antibacterial/antiprotozoal).',
  },
  {
    genericName: 'Carvedilol',
    brandNames: ['Dilatrend', 'Cardipres', 'Carvid'],
    standardStrengths: [6.25, 12.5, 25],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Captopril',
    brandNames: ['Capoten', 'Tensomin'],
    standardStrengths: [25, 50],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Telmisartan',
    brandNames: ['Micardis', 'Telma', 'Pritor'],
    standardStrengths: [40, 80],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Furosemide',
    brandNames: ['Lasix', 'Rosemide', 'Furosed'],
    standardStrengths: [20, 40],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Hydralazine',
    brandNames: ['Apresoline'],
    standardStrengths: [25, 50],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Hydralazine (antihypertensive) vs Hydroxyzine (antihistamine).',
  },
  {
    genericName: 'Hydroxyzine',
    brandNames: ['Atarax', 'Iterax'],
    standardStrengths: [10, 25],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'syrup'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Hydroxyzine (antihistamine) vs Hydralazine (antihypertensive).',
  },

  // Antidiabetics
  {
    genericName: 'Metformin',
    brandNames: ['Glucophage', 'Humamet', 'Diaformin', 'Formet'],
    standardStrengths: [500, 850, 1000],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Metformin (antidiabetic) vs Metronidazole (antimicrobial).',
  },
  {
    genericName: 'Glimepiride',
    brandNames: ['Amaryl', 'Diapride', 'Glimerax', 'Zoryl'],
    standardStrengths: [1, 2, 3, 4],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Gliclazide',
    brandNames: ['Diamicron', 'Glizid', 'Diabrezide'],
    standardStrengths: [30, 60, 80],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Sitagliptin',
    brandNames: ['Januvia'],
    standardStrengths: [50, 100],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Empagliflozin',
    brandNames: ['Jardiance'],
    standardStrengths: [10, 25],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },

  // Lipid-lowering
  {
    genericName: 'Atorvastatin',
    brandNames: ['Lipitor', 'Torvast', 'Atorwin', 'Lipirex'],
    standardStrengths: [10, 20, 40, 80],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Rosuvastatin',
    brandNames: ['Crestor', 'Rosuvas', 'Roxitor', 'Zyrova'],
    standardStrengths: [10, 20],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Simvastatin',
    brandNames: ['Zocor', 'Vidastat', 'Simvador'],
    standardStrengths: [20, 40],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },

  // Analgesics, Antipyretics & NSAIDs
  {
    genericName: 'Paracetamol',
    brandNames: ['Biogesic', 'Tempra', 'Calpol', 'Opigesic', 'Rexidol'],
    standardStrengths: [500, 650],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'syrup', 'drops'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Ibuprofen',
    brandNames: ['Medicol', 'Advil', 'Dolan', 'Midol'],
    standardStrengths: [200, 400],
    strengthUnit: 'mg',
    standardForms: ['capsule', 'tablet', 'syrup'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Paracetamol + Ibuprofen',
    brandNames: ['Alaxan', 'Alaxan FR'],
    standardStrengths: [325, 500],
    strengthUnit: 'mg',
    standardForms: ['capsule', 'tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Mefenamic Acid',
    brandNames: ['Dolfenal', 'Ponstan', 'Gardan'],
    standardStrengths: [250, 500],
    strengthUnit: 'mg',
    standardForms: ['capsule', 'tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Celecoxib',
    brandNames: ['Celebrex', 'Coxitor', 'Celecap'],
    standardStrengths: [100, 200, 400],
    strengthUnit: 'mg',
    standardForms: ['capsule'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Celebrex (celecoxib, NSAID) vs Celexa (citalopram, SSRI antidepressant).',
  },
  {
    genericName: 'Citalopram',
    brandNames: ['Celexa', 'Cipram'],
    standardStrengths: [10, 20, 40],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Celexa (citalopram, SSRI antidepressant) vs Celebrex (celecoxib, NSAID).',
  },
  {
    genericName: 'Tramadol',
    brandNames: ['Tramal', 'Dolcet'],
    standardStrengths: [50],
    strengthUnit: 'mg',
    standardForms: ['capsule', 'tablet'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Tramadol (opioid analgesic) vs Trazodone (antidepressant).',
  },

  // Antibiotics
  {
    genericName: 'Amoxicillin',
    brandNames: ['Amoxil', 'Himox', 'Moxilin'],
    standardStrengths: [250, 500],
    strengthUnit: 'mg',
    standardForms: ['capsule', 'syrup', 'drops'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Co-Amoxiclav',
    brandNames: ['Augmentin', 'Natravox', 'Amoclav'],
    standardStrengths: [625, 1000],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'syrup'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Azithromycin',
    brandNames: ['Zithromax', 'Zenith', 'Azimax'],
    standardStrengths: [250, 500],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'capsule', 'suspension'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Ciprofloxacin',
    brandNames: ['Ciprobay', 'Cipro', 'Ciflox'],
    standardStrengths: [250, 500],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Cefalexin',
    brandNames: ['Keflex', 'Ceporex', 'Felexin'],
    standardStrengths: [250, 500],
    strengthUnit: 'mg',
    standardForms: ['capsule', 'syrup'],
    standardRoute: 'by mouth',
  },

  // Respiratory & Cough/Cold
  {
    genericName: 'Carbocisteine',
    brandNames: ['Solmux', 'Loviscol', 'Carboprem'],
    standardStrengths: [500],
    strengthUnit: 'mg',
    standardForms: ['capsule', 'syrup', 'drops'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Ambroxol',
    brandNames: ['Mucosolvan', 'Ambrolex'],
    standardStrengths: [30, 75],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'syrup', 'drops'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Salbutamol',
    brandNames: ['Ventolin', 'Asmalin'],
    standardStrengths: [2, 4],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'inhaler', 'syrup'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Cetirizine',
    brandNames: ['Alnix', 'Virlix', 'Zyrtec', 'Histal'],
    standardStrengths: [10],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'drops', 'syrup'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Loratadine',
    brandNames: ['Claritin', 'Allerta'],
    standardStrengths: [10],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'syrup'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Phenylpropanolamine + Chlorphenamine + Paracetamol',
    brandNames: ['Neozep', 'Decolgen', 'Sinutab', 'Bioflu'],
    standardStrengths: [500],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'syrup'],
    standardRoute: 'by mouth',
  },

  // Gastrointestinal
  {
    genericName: 'Omeprazole',
    brandNames: ['Losec', 'Omepron', 'Omebloc', 'Zegerid'],
    standardStrengths: [20, 40],
    strengthUnit: 'mg',
    standardForms: ['capsule'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Pantoprazole',
    brandNames: ['Pantoloc', 'Controloc'],
    standardStrengths: [20, 40],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Domperidone',
    brandNames: ['Motilium', 'Gastrodom'],
    standardStrengths: [10],
    strengthUnit: 'mg',
    standardForms: ['tablet', 'suspension'],
    standardRoute: 'by mouth',
  },
  {
    genericName: 'Hyoscine-N-butylbromide',
    brandNames: ['Buscopan'],
    standardStrengths: [10],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
  },

  // Steroids & Anti-inflammatory
  {
    genericName: 'Prednisone',
    brandNames: ['Deltasone', 'Meticorten'],
    standardStrengths: [5, 10, 20],
    strengthUnit: 'mg',
    standardForms: ['tablet'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Prednisone (oral prodrug tablet) vs Prednisolone (active metabolite liquid/tablet).',
  },
  {
    genericName: 'Prednisolone',
    brandNames: ['Prelone', 'Orapred'],
    standardStrengths: [5, 15],
    strengthUnit: 'mg',
    standardForms: ['syrup', 'tablet'],
    standardRoute: 'by mouth',
    lasaWarning: 'Look-Alike / Sound-Alike: Prednisolone (active metabolite) vs Prednisone (prodrug tablet).',
  },
];

/**
 * Normalizes common optical OCR character corruptions before dictionary lookup.
 */
export function normalizeOpticalCharacters(text: string): string {
  return text
    .replace(/[|!]/g, 'l')
    .replace(/1(?=[a-z])/gi, 'l')
    .replace(/(?<=[a-z])1/gi, 'l')
    .replace(/0(?=[a-z])/gi, 'o')
    .replace(/(?<=[a-z])0/gi, 'o')
    .replace(/5(?=[a-z])/gi, 's')
    .replace(/(?<=[a-z])5/gi, 's')
    .replace(/8(?=[a-z])/gi, 'b')
    .replace(/(?<=[a-z])8/gi, 'b')
    .replace(/rn\b/gi, 'm')
    .replace(/cl\b/gi, 'd')
    .replace(/vv/gi, 'w');
}

/**
 * Computes Damerau-Levenshtein distance between two strings.
 */
export function editDistance(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const d: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost, // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[s1.length][s2.length];
}

export type FormularyMatch = {
  drug: FormularyDrug;
  matchedName: string;
  isBrandMatch: boolean;
  distance: number;
  confidenceScore: number;
};

/**
 * Searches the Philippine Drug Formulary for a candidate medicine token.
 * Matches against canonical generic names and registered Philippine brand names.
 */
export function findFormularyMatch(candidateText: string): FormularyMatch | null {
  if (!candidateText || candidateText.length < 3) return null;

  const normalized = normalizeOpticalCharacters(candidateText.trim());
  const cleanInput = normalized.toLowerCase().replace(/[^a-z0-9\s\-\+]/g, '');

  let bestMatch: FormularyMatch | null = null;
  let minDistance = Infinity;

  for (const drug of PHILIPPINE_DRUG_FORMULARY) {
    // Check generic name
    const genericDist = editDistance(cleanInput, drug.genericName);
    const maxGenericTolerance = drug.genericName.length <= 5 ? 1 : (drug.genericName.length <= 10 ? 2 : 3);
    
    if (genericDist <= maxGenericTolerance && genericDist < minDistance) {
      minDistance = genericDist;
      bestMatch = {
        drug,
        matchedName: drug.genericName,
        isBrandMatch: false,
        distance: genericDist,
        confidenceScore: Math.round((1 - genericDist / Math.max(cleanInput.length, drug.genericName.length)) * 100),
      };
    }

    // Check registered brand names
    for (const brand of drug.brandNames) {
      const brandDist = editDistance(cleanInput, brand);
      const maxBrandTolerance = brand.length <= 5 ? 1 : 2;

      if (brandDist <= maxBrandTolerance && brandDist < minDistance) {
        minDistance = brandDist;
        bestMatch = {
          drug,
          matchedName: brand,
          isBrandMatch: true,
          distance: brandDist,
          confidenceScore: Math.round((1 - brandDist / Math.max(cleanInput.length, brand.length)) * 100),
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Enhances a MedicationOcrDraft by grounding it against the Philippine National Drug Formulary (PNDF).
 * Automatically repairs optical misreads, attaches canonical generic and brand names,
 * standardizes route and forms, validates dosage strengths, and injects LASA safety alerts.
 */
export function groundDraftWithFormulary(draft: MedicationOcrDraft): MedicationOcrDraft {
  const candidate = draft.displayName || draft.genericName || draft.brandName || '';
  const match = findFormularyMatch(candidate);

  if (!match) {
    return draft;
  }

  const { drug, matchedName, isBrandMatch } = match;
  const warnings = [...draft.warnings];

  // If a Look-Alike / Sound-Alike warning exists for this drug, add it prominently
  let lasaWarning: string | null = null;
  if (drug.lasaWarning) {
    lasaWarning = drug.lasaWarning;
    if (!warnings.some((w) => w.includes('Look-Alike / Sound-Alike'))) {
      warnings.unshift(drug.lasaWarning);
    }
  }

  // Canonical names
  const canonicalGeneric = drug.genericName;
  let canonicalBrand = draft.brandName;
  if (isBrandMatch) {
    canonicalBrand = matchedName;
  } else if (!canonicalBrand && drug.brandNames.length > 0) {
    canonicalBrand = drug.brandNames[0];
  }

  // Reconcile display name with canonical formulation
  let displayName = draft.displayName;
  const hasCompoundName = /[\[\(\/]/.test(draft.displayName);

  if (match.distance > 0 && !hasCompoundName) {
    // Optical OCR typo was detected and corrected!
    displayName = isBrandMatch
      ? `${canonicalGeneric} (${matchedName})`
      : canonicalGeneric;
  } else if (!draft.genericName && isBrandMatch && !hasCompoundName) {
    displayName = `${canonicalGeneric} (${matchedName})`;
  }

  // Route & Form standardization
  const route = draft.route || drug.standardRoute;
  const medicineForm = draft.medicineForm || drug.standardForms[0] || 'tablet';

  // Strength validation
  let strengthValue = draft.strengthValue;
  let strengthUnit = draft.strengthUnit || drug.strengthUnit;

  // Check for optical strength confusion in raw text (e.g. "5OOmg" -> 500mg, "5rng" -> 5mg)
  if (strengthValue === null && draft.rawText) {
    const opticalStrength = draft.rawText.match(/\b(\d+[Oo0]{1,3})\s*(?:mg|rng|mcg|g)\b/i);
    if (opticalStrength) {
      const repaired = Number(opticalStrength[1].replace(/[Oo]/g, '0'));
      if (drug.standardStrengths.includes(repaired)) {
        strengthValue = repaired;
        strengthUnit = drug.strengthUnit;
      }
    }
  }

  // If parsed strength matches a standard strength in PNDF, validate it
  if (strengthValue !== null && !drug.standardStrengths.includes(strengthValue)) {
    // Check if it's very close to a standard strength (e.g. 50 instead of 500)
    const exactStandard = drug.standardStrengths.find((s) => s === strengthValue);
    if (!exactStandard) {
      warnings.push(`PNDF Note: Detected strength (${strengthValue} ${strengthUnit}) is non-standard for ${canonicalGeneric} (Standard: ${drug.standardStrengths.join(', ')} ${drug.strengthUnit}). Check packaging.`);
    }
  }

  return {
    ...draft,
    displayName,
    genericName: canonicalGeneric,
    brandName: canonicalBrand,
    route,
    medicineForm,
    strengthValue,
    strengthUnit,
    warnings,
    pndfVerified: true,
    pndfGenericName: canonicalGeneric,
    lasaWarning,
  };
}
