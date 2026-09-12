import { groundDraftWithFormulary } from './formulary';
import type { MedicationOcrDraft, PhotoSourceKind } from './ocr';

/**
 * Optional Cloud Multimodal Vision-Language Model adapter using Google Gemini 3.7 Flash.
 *
 * SAFETY INVARIANTS:
 * 1. Activated only when GEMINI_API_KEY is configured in the backend server environment.
 * 2. Per docs/research/gemini-flash-ocr-evaluation.md, the free Developer API is strictly
 *    limited to synthetic evaluations; production handling of real patient PHI requires
 *    Gemini Paid Tier (Zero Data Retention) or Vertex AI with HIPAA BAA.
 * 3. Enforces strict JSON Schema structured output adhering directly to MedicationOcrDraft.
 * 4. Outputs are treated strictly as untrusted drafts requiring explicit human confirmation.
 * 5. All drafts pass through Philippine National Drug Formulary (PNDF) grounding.
 */
export async function recognizeWithGemini(
  imageBuffer: Buffer,
  sourceKind: PhotoSourceKind,
  apiKey: string = process.env.GEMINI_API_KEY || '',
): Promise<MedicationOcrDraft[] | null> {
  if (!apiKey) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`;
  const base64Data = imageBuffer.toString('base64');

  const systemInstruction = `You are a specialized pharmaceutical vision and clinical OCR extractor for the Alaga Eldercare Application in the Philippines.
Extract all medications present in the image into structured drafts adhering to the specified schema.
CRITICAL MEDICAL SAFETY RULES:
1. Extract exact medicine names, generic names, brand names, strengths, and units.
2. Parse Philippine/Tagalog instructions (e.g. 'kalahating tableta', 'tuwing gabi bago matulog', 'bago mag-almusal', 'tuwing ika-8 oras').
3. NEVER invent or guess clock times if not explicitly printed. If a time is vague (e.g. 'after meals', 'PRN'), leave exactTimes empty.
4. Always preserve rawText exactly as visible.`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemInstruction },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            confidence: { type: 'INTEGER', description: '0 to 100 confidence score' },
            displayName: { type: 'STRING', description: 'Medicine name as printed' },
            genericName: { type: 'STRING', description: 'Generic pharmaceutical active ingredient' },
            brandName: { type: 'STRING', description: 'Commercial brand name if present' },
            doseQuantity: { type: 'NUMBER', description: 'Dose quantity per intake' },
            doseUnit: { type: 'STRING', description: 'e.g. tablet, capsule, ml, puff' },
            exactTimes: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Explicit HH:MM times only' },
            medicineForm: { type: 'STRING', description: 'e.g. tablet, capsule, liquid' },
            originalInstructions: { type: 'STRING', description: 'Intake instructions as printed' },
            rawText: { type: 'STRING', description: 'Full transcription of visible text' },
            route: { type: 'STRING', description: 'e.g. by mouth, topical, inhaled' },
            strengthUnit: { type: 'STRING', description: 'mg, mcg, g, ml' },
            strengthValue: { type: 'NUMBER', description: 'Numeric strength value' },
            suggestedScheduleKind: { type: 'STRING', description: 'exact, interval, or meal' },
            detectedMeals: { type: 'ARRAY', items: { type: 'STRING' } },
            mealRelation: { type: 'STRING', description: 'before or after' },
            intervalHours: { type: 'NUMBER', description: 'Hours between doses if interval' },
            timingClarification: { type: 'STRING' },
            isAsNeeded: { type: 'BOOLEAN' },
            warnings: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['displayName', 'doseUnit', 'exactTimes', 'medicineForm', 'originalInstructions', 'rawText', 'route', 'warnings'],
        },
      },
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const textPayload = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textPayload) return null;

    const rawDrafts = JSON.parse(textPayload) as MedicationOcrDraft[];
    if (!Array.isArray(rawDrafts) || rawDrafts.length === 0) return null;

    return rawDrafts.map((d) => {
      const normalizedDraft: MedicationOcrDraft = {
        confidence: typeof d.confidence === 'number' ? Math.max(0, Math.min(100, Math.round(d.confidence))) : 95,
        displayName: d.displayName || 'Unrecognized Medication',
        genericName: d.genericName,
        brandName: d.brandName,
        doseQuantity: typeof d.doseQuantity === 'number' ? d.doseQuantity : null,
        doseUnit: d.doseUnit || 'tablet',
        exactTimes: Array.isArray(d.exactTimes) ? d.exactTimes : [],
        medicineForm: d.medicineForm || 'tablet',
        originalInstructions: d.originalInstructions || d.rawText || '',
        rawText: d.rawText || '',
        route: d.route || 'by mouth',
        sourceKind,
        strengthUnit: d.strengthUnit || 'mg',
        strengthValue: typeof d.strengthValue === 'number' ? d.strengthValue : null,
        warnings: Array.isArray(d.warnings) ? d.warnings : ['Review every field against the source image.'],
        suggestedScheduleKind: d.suggestedScheduleKind,
        detectedMeals: d.detectedMeals,
        mealRelation: d.mealRelation,
        intervalHours: d.intervalHours,
        timingClarification: d.timingClarification,
        isAsNeeded: Boolean(d.isAsNeeded),
      };
      return groundDraftWithFormulary(normalizedDraft);
    });
  } catch (error) {
    // Graceful fallback to local Tesseract engine
    return null;
  }
}
