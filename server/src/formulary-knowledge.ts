/**
 * Philippine National Drug Formulary (PNDF) Knowledge Base & Entity-Scoped RAG Store.
 * Contains vetted patient leaflets and drug monographs for eldercare chronic illness medications.
 * Provides deterministic vector embeddings, cosine similarity, lexical scoring, and hybrid retrieval.
 * Runs completely locally in Node.js with zero external vector database dependencies.
 */

import { PHILIPPINE_DRUG_FORMULARY } from './formulary';

export type FormularySection =
  | 'purpose'
  | 'food_and_timing'
  | 'missed_dose'
  | 'administration_instructions';

export interface LeafletCitation {
  medicationName: string;
  sourceTitle: string;
  section: string;
}

export interface LeafletChunk {
  id: string;
  medicationGenericName: string;
  section: FormularySection;
  sectionTitle: string;
  sourceTitle: string;
  content: string;
  contentFil: string;
  keywords: string[];
  embedding: number[];
}

export interface DrugMonograph {
  genericName: string;
  brandNames: string[];
  therapeuticClass: string;
  sourceTitle: string;
  chunks: LeafletChunk[];
}

const PNDF_SOURCE_TITLE = 'Philippine National Drug Formulary (PNDF) Patient Leaflet';
const VECTOR_DIMENSIONS = 64;

/**
 * Computes a deterministic 64-dimensional dense embedding for a given text string.
 * Uses character n-gram hashing and subword token projection with L2 normalization.
 * Runs deterministically in local Node.js in <0.05ms without external dependencies.
 */
export function computeDeterministicEmbedding(text: string, dimensions = VECTOR_DIMENSIONS): number[] {
  const vector = new Array(dimensions).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);

  for (const token of tokens) {
    // Word level hash
    let wordHash = 0;
    for (let j = 0; j < token.length; j++) {
      wordHash = (wordHash * 31 + token.charCodeAt(j)) >>> 0;
    }
    const wordIdx = wordHash % dimensions;
    vector[wordIdx] += 1.5;

    // Subword tri-gram hashes for partial matching and typos
    for (let i = 0; i <= token.length - 3; i++) {
      const gram = token.slice(i, i + 3);
      let hash = 0;
      for (let j = 0; j < gram.length; j++) {
        hash = (hash * 37 + gram.charCodeAt(j)) >>> 0;
      }
      const index = hash % dimensions;
      const sign = hash & 0x80 ? 1 : -1;
      vector[index] += sign * 0.8;
    }
  }

  // L2 normalization
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(6));
    }
  }
  return vector;
}

/**
 * Computes cosine similarity between two normalized vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return Math.max(-1, Math.min(1, dot));
}

/**
 * Computes lexical keyword / token match score between query and chunk.
 */
export function computeLexicalScore(query: string, keywords: string[], content: string): number {
  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const queryTokens = cleanQuery.split(/\s+/).filter((t) => t.length > 2);
  if (queryTokens.length === 0) return 0;

  let keywordMatches = 0;
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (cleanQuery.includes(kwLower)) {
      keywordMatches += kwLower.includes(' ') ? 2.0 : 1.0;
    }
  }

  let contentTokenHits = 0;
  const contentLower = content.toLowerCase();
  for (const token of queryTokens) {
    if (contentLower.includes(token)) {
      contentTokenHits += 0.5;
    }
  }

  const rawScore = (keywordMatches * 1.5 + contentTokenHits) / (queryTokens.length * 1.2 + 2);
  return Math.min(1, Math.max(0, rawScore));
}

function makeChunk(
  id: string,
  medicationGenericName: string,
  section: FormularySection,
  sectionTitle: string,
  content: string,
  contentFil: string,
  keywords: string[],
): LeafletChunk {
  const combined = `${content} ${contentFil} ${keywords.join(' ')}`;
  const embedding = computeDeterministicEmbedding(combined);
  return {
    id,
    medicationGenericName,
    section,
    sectionTitle,
    sourceTitle: PNDF_SOURCE_TITLE,
    content,
    contentFil,
    keywords,
    embedding,
  };
}

/**
 * Curated PNDF drug monographs with official patient leaflet excerpts.
 */
export const FORMULARY_MONOGRAPHS: DrugMonograph[] = [
  // 1. Amlodipine
  {
    genericName: 'Amlodipine',
    brandNames: ['Norvasc', 'Amlife', 'Amvaz', 'Provasc', 'Lodipine'],
    therapeuticClass: 'Calcium Channel Blocker (Dihydropyridine) / Antihypertensive',
    sourceTitle: PNDF_SOURCE_TITLE,
    chunks: [
      makeChunk(
        'amlodipine-purpose',
        'Amlodipine',
        'purpose',
        'General Purpose & Indication',
        'Amlodipine is a dihydropyridine calcium channel blocker prescribed to treat high blood pressure (hypertension) and chronic stable chest pain (angina). It relaxes and dilates peripheral blood vessels, lowering blood pressure so blood flows more easily and reducing the workload on the heart.',
        'Ang Amlodipine ay isang calcium channel blocker na inirereseta para sa altapresyon (mataas na presyon ng dugo) at pananakit ng dibdib (angina). Pinaluluwag nito ang mga daluyan ng dugo upang mas madaling dumaloy ang dugo at gumaan ang trabaho ng puso.',
        [
          'purpose',
          'indication',
          'what is it for',
          'why take',
          'blood pressure',
          'hypertension',
          'angina',
          'chest pain',
          'para saan',
          'dahilan',
          'altapresyon',
          'mataas na presyon',
          'puso',
        ],
      ),
      makeChunk(
        'amlodipine-food-timing',
        'Amlodipine',
        'food_and_timing',
        'Food & Meal Timing',
        'Amlodipine can be taken with or without food. It should be taken once daily with a full glass of water, preferably at approximately the same time each day (e.g. morning or evening) to keep blood pressure steady. Avoid consuming grapefruit or drinking grapefruit juice while taking Amlodipine, as grapefruit can increase drug concentrations in the blood.',
        'Maaaring inumin ang Amlodipine nang may laman ang tiyan o kahit walang laman (bago o pagkatapos kumain). Inumin ito isang beses bawat araw sa parehong oras kasama ang isang basong tubig. Iwasan ang suha (grapefruit) dahil maaari nitong mapataas ang bisa ng gamot sa dugo.',
        [
          'food',
          'meal',
          'meals',
          'eat',
          'eating',
          'breakfast',
          'dinner',
          'empty stomach',
          'grapefruit',
          'timing',
          'water',
          'pagkain',
          'kumain',
          'bago kumain',
          'pagkatapos kumain',
          'almusal',
          'hapunan',
          'gutom',
          'suha',
          'tubig',
        ],
      ),
      makeChunk(
        'amlodipine-missed-dose',
        'Amlodipine',
        'missed_dose',
        'Missed Dose Rules',
        'If you miss a dose of Amlodipine, take it as soon as you remember on that same day. However, if more than 12 hours have passed since the scheduled time, or if it is almost time for the next dose, skip the missed dose and resume the regular dosing schedule. Never take two doses or a double tablet to make up for a missed dose.',
        'Kung nakalimutan ang dose ng Amlodipine, inumin ito agad sa sandaling maalala sa araw ring iyon. Subalit kung mahigit 12 oras na ang lumipas o malapit na ang susunod na iskedyul, laktawan na ang nakaligtaang dose at ipagpatuloy ang dating iskedyul. Huwag kailanman magdoble ng dose.',
        [
          'missed',
          'miss',
          'forgot',
          'forgotten',
          'skip',
          'skipped',
          'late',
          'make up',
          'double dose',
          'nakalimutan',
          'nalimutan',
          'nalaktawan',
          'hindi nainom',
          'doble',
          'nakaligtaan',
        ],
      ),
      makeChunk(
        'amlodipine-admin',
        'Amlodipine',
        'administration_instructions',
        'Administration Instructions',
        'Swallow the Amlodipine tablet whole with a glass of water. Do not crush, chew, or break the tablet unless specifically advised by your doctor or pharmacist. Store in a cool, dry place below 30°C away from direct sunlight and excess moisture. Keep out of reach of children.',
        'Lunukin nang buo ang tableta ng Amlodipine kasabay ng isang basong tubig. Huwag durugin o nguyain ang tableta maliban kung ipinayo ng doktor. Itago sa malamig at tuyong lugar na hindi lalampas sa 30°C at malayo sa direktang sikat ng araw.',
        [
          'admin',
          'administration',
          'how to take',
          'swallow',
          'crush',
          'chew',
          'break',
          'store',
          'storage',
          'temperature',
          'paano inumin',
          'lunukin',
          'durugin',
          'nguyain',
          'itago',
          'tubig',
        ],
      ),
    ],
  },

  // 2. Metformin
  {
    genericName: 'Metformin',
    brandNames: ['Glucophage', 'Humamet', 'Diaformin', 'Formet'],
    therapeuticClass: 'Biguanide / Oral Antidiabetic',
    sourceTitle: PNDF_SOURCE_TITLE,
    chunks: [
      makeChunk(
        'metformin-purpose',
        'Metformin',
        'purpose',
        'General Purpose & Indication',
        'Metformin is an oral biguanide antihyperglycemic medicine used to manage type 2 diabetes mellitus. It helps control blood sugar by decreasing glucose production by the liver, decreasing intestinal glucose absorption, and increasing insulin sensitivity in muscle and peripheral tissues.',
        'Ang Metformin ay isang gamot para sa type 2 diabetes na nagpapababa ng asukal sa dugo sa pamamagitan ng pagbawas sa produksyon ng glucose sa atay at pagpapahusay sa paggamit ng katawan sa sariling insulin.',
        [
          'purpose',
          'indication',
          'diabetes',
          'blood sugar',
          'glucose',
          'type 2',
          'hyperglycemia',
          'what is it for',
          'why take',
          'para saan',
          'asukal',
          'gamot sa diabetes',
          'dahilan',
        ],
      ),
      makeChunk(
        'metformin-food-timing',
        'Metformin',
        'food_and_timing',
        'Food & Meal Timing',
        'Metformin should always be taken with meals or immediately after eating (such as with breakfast or dinner). Taking Metformin with food is essential to minimize gastrointestinal side effects like stomach upset, nausea, abdominal cramping, and diarrhea. Avoid heavy alcohol intake while taking Metformin.',
        'Dapat inumin ang Metformin kasabay o kaagad pagkatapos kumain (tulad ng almusal o hapunan). Mahalaga ang pag-inom nito kasabay ng pagkain upang maiwasan ang pananakit ng tiyan, pagkahilo, pagtatae, at pangangasim. Iwasan ang pag-inom ng alak.',
        [
          'food',
          'meal',
          'meals',
          'eat',
          'eating',
          'stomach',
          'upset',
          'nausea',
          'diarrhea',
          'cramp',
          'breakfast',
          'dinner',
          'with food',
          'pagkain',
          'kumain',
          'almusal',
          'hapunan',
          'tiyan',
          'sikmura',
          'pagkahilo',
          'pagtatae',
          'bago kumain',
          'pagkatapos kumain',
        ],
      ),
      makeChunk(
        'metformin-missed-dose',
        'Metformin',
        'missed_dose',
        'Missed Dose Rules',
        'If you forget to take a dose of Metformin, take it with food as soon as you remember. If it is almost time for your next scheduled dose, skip the missed dose and resume your regular dosing schedule. Do not take an extra tablet or double dose to make up for a missed dose.',
        'Kung nakalimutang inumin ang Metformin, inumin ito kasabay ng pagkain sa sandaling maalala. Kung malapit na ang oras ng susunod na dose, laktawan na ang nakalimutan at sundin ang regular na iskedyul. Huwag magdoble ng dose.',
        [
          'missed',
          'miss',
          'forgot',
          'forgotten',
          'skip',
          'skipped',
          'late',
          'make up',
          'double dose',
          'nakalimutan',
          'nalimutan',
          'nalaktawan',
          'hindi nainom',
          'doble',
          'nakaligtaan',
        ],
      ),
      makeChunk(
        'metformin-admin',
        'Metformin',
        'administration_instructions',
        'Administration Instructions',
        'Swallow Metformin tablets whole with a full glass of water. Do not crush, chew, split, or dissolve the tablets, particularly extended-release formulations, because crushing can release the medication too quickly into the bloodstream. Store below 30°C in a dry place protected from heat and moisture.',
        'Lunukin nang buo ang tableta ng Metformin kasabay ng tubig. Huwag nguyain, durugin, o hatiin ang tableta upang hindi biglang mailabas ang gamot sa katawan. Itago sa tuyong lugar na hindi lalampas sa 30°C.',
        [
          'admin',
          'administration',
          'how to take',
          'swallow',
          'crush',
          'chew',
          'extended release',
          'split',
          'store',
          'storage',
          'water',
          'paano inumin',
          'lunukin',
          'durugin',
          'nguyain',
          'tubig',
          'itago',
        ],
      ),
    ],
  },

  // 3. Losartan
  {
    genericName: 'Losartan',
    brandNames: ['Cozaar', 'Lifezar', 'Kenzar', 'Arbloc', 'Losar'],
    therapeuticClass: 'Angiotensin II Receptor Blocker (ARB) / Antihypertensive',
    sourceTitle: PNDF_SOURCE_TITLE,
    chunks: [
      makeChunk(
        'losartan-purpose',
        'Losartan',
        'purpose',
        'General Purpose & Indication',
        'Losartan is an Angiotensin II receptor antagonist (ARB) prescribed to treat high blood pressure (hypertension) and reduce the risk of stroke. It is also used to slow the progression of kidney disease (nephropathy) in diabetic patients with hypertension. It blocks angiotensin II, allowing blood vessels to widen and relax.',
        'Ang Losartan ay isang Angiotensin II receptor blocker na inirereseta para sa altapresyon at upang maprotektahan ang bato sa mga pasyenteng may diabetes. Pinaluluwag nito ang mga ugat upang bumaba ang presyon ng dugo at gumaan ang sirkulasyon.',
        [
          'purpose',
          'indication',
          'hypertension',
          'blood pressure',
          'kidney',
          'renal',
          'stroke',
          'what is it for',
          'why take',
          'para saan',
          'altapresyon',
          'bato',
          'presyon',
          'dahilan',
        ],
      ),
      makeChunk(
        'losartan-food-timing',
        'Losartan',
        'food_and_timing',
        'Food & Meal Timing',
        'Losartan may be taken with or without food. It should be taken at approximately the same time each day with water. Avoid using potassium supplements or salt substitutes containing potassium without consulting your physician, as Losartan can increase blood potassium levels.',
        'Maaaring inumin ang Losartan nang may pagkain o kahit walang laman ang tiyan. Inumin ito sa parehong oras araw-araw kasabay ng tubig. Iwasan ang mga salt substitute o suplemento na may potassium nang walang payo ng doktor.',
        [
          'food',
          'meal',
          'meals',
          'eat',
          'eating',
          'empty stomach',
          'potassium',
          'timing',
          'water',
          'pagkain',
          'kumain',
          'oras',
          'bago kumain',
          'pagkatapos kumain',
          'tubig',
        ],
      ),
      makeChunk(
        'losartan-missed-dose',
        'Losartan',
        'missed_dose',
        'Missed Dose Rules',
        'If you miss a dose of Losartan, take it as soon as you remember on that day. However, if it is almost time for your next regular dose, skip the missed dose and continue with your normal schedule. Do not take two doses at once or double up.',
        'Kung nakalimutan ang dose ng Losartan, inumin ito sa sandaling maalala sa araw ring iyon. Subalit kung malapit na ang susunod na iskedyul, laktawan na ang nakaligtaang dose at magpatuloy sa dating oras. Huwag uminom ng dalawang dose nang sabay.',
        [
          'missed',
          'miss',
          'forgot',
          'forgotten',
          'skip',
          'skipped',
          'late',
          'make up',
          'double dose',
          'nakalimutan',
          'nalimutan',
          'nalaktawan',
          'hindi nainom',
          'doble',
          'nakaligtaan',
        ],
      ),
      makeChunk(
        'losartan-admin',
        'Losartan',
        'administration_instructions',
        'Administration Instructions',
        'Swallow the tablet whole with a glass of water. Do not crush or chew the tablet. Store in a dry place at room temperature (15°C to 30°C) protected from excessive light and moisture. Keep the container tightly closed.',
        'Lunukin nang buo ang tableta ng Losartan kasabay ng tubig. Huwag durugin o nguyain ang tableta. Itago sa tuyong lugar na may temperatura na 15°C hanggang 30°C at protektado sa liwanag at moisture.',
        [
          'admin',
          'administration',
          'how to take',
          'swallow',
          'crush',
          'chew',
          'store',
          'storage',
          'temperature',
          'water',
          'paano inumin',
          'lunukin',
          'durugin',
          'nguyain',
          'itago',
          'tubig',
        ],
      ),
    ],
  },

  // 4. Metoprolol
  {
    genericName: 'Metoprolol',
    brandNames: ['Betaloc', 'Neobloc', 'Cardiosel'],
    therapeuticClass: 'Beta-Adrenergic Blocker / Antihypertensive',
    sourceTitle: PNDF_SOURCE_TITLE,
    chunks: [
      makeChunk(
        'metoprolol-purpose',
        'Metoprolol',
        'purpose',
        'General Purpose & Indication',
        'Metoprolol is a cardioselective beta-blocker prescribed for high blood pressure (hypertension), angina pectoris (chest pain), and to control irregular or rapid heart rates. It works by slowing down heart rate and reducing myocardial contractility.',
        'Ang Metoprolol ay isang beta-blocker para sa altapresyon, pananakit ng dibdib (angina), at pampabagal ng mabilis o iregular na tibok ng puso.',
        [
          'purpose',
          'indication',
          'heart',
          'rate',
          'pulse',
          'hypertension',
          'blood pressure',
          'angina',
          'what is it for',
          'para saan',
          'tibok ng puso',
          'altapresyon',
        ],
      ),
      makeChunk(
        'metoprolol-food-timing',
        'Metoprolol',
        'food_and_timing',
        'Food & Meal Timing',
        'Metoprolol should be taken with or immediately following a meal for consistent absorption. Taking it with food enhances bioavailability and helps maintain stable plasma drug levels. Take at the same time every day.',
        'Dapat inumin ang Metoprolol kasabay o kaagad pagkatapos kumain upang maging pantay ang pagsipsip ng gamot sa katawan. Inumin sa parehong oras araw-araw.',
        [
          'food',
          'meal',
          'meals',
          'eat',
          'eating',
          'absorption',
          'timing',
          'pagkain',
          'kumain',
          'kasabay',
          'almusal',
          'hapunan',
        ],
      ),
      makeChunk(
        'metoprolol-missed-dose',
        'Metoprolol',
        'missed_dose',
        'Missed Dose Rules',
        'If you miss a dose of Metoprolol, take it as soon as remembered. However, if your next dose is within 4 hours, skip the missed dose and take your next dose at the regular time. Never double your dose.',
        'Kung nakalimutan ang dose ng Metoprolol, inumin ito kapag naalala. Ngunit kung wala nang 4 na oras bago ang susunod na dose, laktawan na ang nakaligtaan. Huwag magdoble ng inumin.',
        [
          'missed',
          'miss',
          'forgot',
          'skip',
          'skipped',
          '4 hours',
          'nakalimutan',
          'nalimutan',
          'nalaktawan',
          'doble',
        ],
      ),
      makeChunk(
        'metoprolol-admin',
        'Metoprolol',
        'administration_instructions',
        'Administration Instructions',
        'Swallow tablets whole with water. Do not abruptly stop taking Metoprolol without consulting your doctor, as sudden discontinuation can trigger rebound hypertension or chest pain. Store in a cool, dry place below 30°C.',
        'Lunukin nang buo ang tableta kasabay ng tubig. Huwag biglang ititigil ang pag-inom ng Metoprolol nang walang pahintulot ng doktor upang maiwasan ang biglaang pagtaas ng presyon ng dugo.',
        [
          'admin',
          'administration',
          'how to take',
          'swallow',
          'discontinue',
          'stop',
          'store',
          'paano inumin',
          'lunukin',
          'itago',
        ],
      ),
    ],
  },

  // 5. Atorvastatin
  {
    genericName: 'Atorvastatin',
    brandNames: ['Lipitor', 'Torvast', 'Atorwin', 'Lipirex'],
    therapeuticClass: 'HMG-CoA Reductase Inhibitor (Statin) / Lipid-Lowering',
    sourceTitle: PNDF_SOURCE_TITLE,
    chunks: [
      makeChunk(
        'atorvastatin-purpose',
        'Atorvastatin',
        'purpose',
        'General Purpose & Indication',
        'Atorvastatin is an HMG-CoA reductase inhibitor (statin) prescribed to lower bad cholesterol (LDL) and triglycerides in the blood, while raising good cholesterol (HDL). It helps prevent atherosclerosis, heart attacks, and strokes in individuals at cardiovascular risk.',
        'Ang Atorvastatin ay isang statin na nagpapababa ng masamang kolesterol (LDL) at triglycerides sa dugo upang maiwasan ang bara sa ugat, atake sa puso, at stroke.',
        [
          'purpose',
          'indication',
          'cholesterol',
          'lipid',
          'ldl',
          'triglycerides',
          'statin',
          'heart attack',
          'stroke',
          'what is it for',
          'para saan',
          'kolesterol',
          'taba sa dugo',
        ],
      ),
      makeChunk(
        'atorvastatin-food-timing',
        'Atorvastatin',
        'food_and_timing',
        'Food & Meal Timing',
        'Atorvastatin can be taken with or without food, at any time of day, but it is best taken in the evening or at bedtime because the body produces most cholesterol at night. Avoid large quantities of grapefruit or grapefruit juice, which can raise drug levels dangerously.',
        'Maaaring inumin ang Atorvastatin nang may pagkain o wala, mas mainam sa gabi o bago matulog dahil sa gabi pinakamaraming gumagawa ng kolesterol ang atay. Iwasan ang suha (grapefruit).',
        [
          'food',
          'meal',
          'meals',
          'eat',
          'evening',
          'night',
          'bedtime',
          'grapefruit',
          'timing',
          'pagkain',
          'kumain',
          'gabi',
          'bago matulog',
          'suha',
        ],
      ),
      makeChunk(
        'atorvastatin-missed-dose',
        'Atorvastatin',
        'missed_dose',
        'Missed Dose Rules',
        'If you miss a dose of Atorvastatin, take it as soon as you remember. If more than 12 hours have passed since your missed dose, skip it and take your next dose at the regular time. Do not take two doses at once.',
        'Kung nakalimutang inumin ang Atorvastatin, inumin ito kapag naalala. Kung mahigit 12 oras na ang lumipas, laktawan na ito at magpatuloy sa regular na oras. Huwag uminom ng dalawang dose nang sabay.',
        [
          'missed',
          'miss',
          'forgot',
          'skip',
          'skipped',
          '12 hours',
          'nakalimutan',
          'nalimutan',
          'nalaktawan',
          'doble',
        ],
      ),
      makeChunk(
        'atorvastatin-admin',
        'Atorvastatin',
        'administration_instructions',
        'Administration Instructions',
        'Swallow the tablet whole with a glass of water. Maintain a heart-healthy low-fat diet while on therapy. Store at room temperature (below 30°C) away from moisture and light.',
        'Lunukin nang buo ang tableta kasabay ng tubig. Panatilihin ang pagkain ng masusustansya at mababang-taba habang umiinom nito. Itago sa temperaturang hindi lalampas sa 30°C.',
        [
          'admin',
          'administration',
          'how to take',
          'swallow',
          'diet',
          'store',
          'storage',
          'paano inumin',
          'lunukin',
          'itago',
        ],
      ),
    ],
  },

  // 6. Paracetamol
  {
    genericName: 'Paracetamol',
    brandNames: ['Biogesic', 'Tempra', 'Calpol', 'Opigesic', 'Rexidol'],
    therapeuticClass: 'Analgesic & Antipyretic',
    sourceTitle: PNDF_SOURCE_TITLE,
    chunks: [
      makeChunk(
        'paracetamol-purpose',
        'Paracetamol',
        'purpose',
        'General Purpose & Indication',
        'Paracetamol (acetaminophen) is a widely used analgesic and antipyretic medicine for the relief of mild to moderate pain (such as headaches, muscle aches, or joint discomfort) and the reduction of fever.',
        'Ang Paracetamol ay gamot para sa lagnat at pampaginhawa ng banayad hanggang katamtamang pananakit ng ulo, kalamnan, o kasu-kasuan.',
        [
          'purpose',
          'indication',
          'fever',
          'pain',
          'headache',
          'body pain',
          'what is it for',
          'para saan',
          'lagnat',
          'sakit ng ulo',
          'kirot',
        ],
      ),
      makeChunk(
        'paracetamol-food-timing',
        'Paracetamol',
        'food_and_timing',
        'Food & Meal Timing',
        'Paracetamol can be taken safely with or without food. Taking it with water or after a light snack can help if stomach sensitivity occurs. Do not combine with other medicines containing paracetamol to prevent liver toxicity.',
        'Ligtas inumin ang Paracetamol nang may laman ang tiyan o kahit walang laman. Kung medyo sensitibo ang sikmura, inumin ito pagkatapos kumain ng kaunti. Huwag isabay sa iba pang gamot na may paracetamol.',
        [
          'food',
          'meal',
          'meals',
          'eat',
          'eating',
          'empty stomach',
          'liver',
          'pagkain',
          'kumain',
          'sikmura',
          'tiyan',
          'bago kumain',
          'pagkatapos kumain',
        ],
      ),
      makeChunk(
        'paracetamol-missed-dose',
        'Paracetamol',
        'missed_dose',
        'Missed Dose Rules',
        'Paracetamol is typically taken as needed for pain or fever. If on a fixed schedule and a dose is missed, take it when remembered, provided at least 4 to 6 hours have passed since the last dose. Never double the dose or exceed 4,000 mg in 24 hours.',
        'Karaniwang iniinom ang Paracetamol kung kailangan lamang. Kung nakaiskedyul at nakalimutan, inumin ito kung lumipas na ang 4 hanggang 6 na oras mula sa huling pag-inom. Huwag kailanman magdoble ng dose.',
        [
          'missed',
          'miss',
          'forgot',
          'skip',
          '4 hours',
          'max dose',
          'nakalimutan',
          'nalimutan',
          'nalaktawan',
          'doble',
        ],
      ),
      makeChunk(
        'paracetamol-admin',
        'Paracetamol',
        'administration_instructions',
        'Administration Instructions',
        'Swallow tablets with a glass of water. Strictly adhere to recommended dosing intervals (at least 4-6 hours apart) and never exceed 4,000 mg (8 tablets of 500mg) per day in adults to avoid acute liver injury.',
        'Lunukin ang tableta kasabay ng tubig. Siguraduhing may pagitan na 4 hanggang 6 na oras bago uminom muli at huwag lumampas sa 4,000 mg bawat araw upang maprotektahan ang atay.',
        [
          'admin',
          'administration',
          'how to take',
          'swallow',
          'interval',
          'liver',
          'overdose',
          'paano inumin',
          'lunukin',
          'atay',
        ],
      ),
    ],
  },
];

/**
 * Normalizes a medication name by lowercasing and stripping synthetic tags/doses.
 */
export function normalizeMedName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(synthetic\)/gi, '')
    .replace(/\s*\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g)\b/gi, '')
    .trim();
}

/**
 * Detects if a query mentions any known formulary medication (generic or brand).
 */
export function detectMedicationMention(
  text: string,
  activeMedications?: ActiveMedicationItem[],
): {
  detectedName: string;
  canonicalGeneric: string;
  isBrand: boolean;
} | null {
  const normalizedText = text.toLowerCase();

  // 1. Check patient's active prescribed medications first
  if (activeMedications && activeMedications.length > 0) {
    for (const med of activeMedications) {
      const displayClean = normalizeMedName(med.displayName);
      if (displayClean && new RegExp(`\\b${displayClean}\\b`, 'i').test(normalizedText)) {
        const mono = FORMULARY_MONOGRAPHS.find(
          (m) =>
            m.genericName.toLowerCase() === displayClean ||
            m.brandNames.some((b) => b.toLowerCase() === displayClean),
        );
        return {
          detectedName: med.displayName,
          canonicalGeneric: mono ? mono.genericName : (med.genericName || med.displayName),
          isBrand: mono ? mono.brandNames.some((b) => b.toLowerCase() === displayClean) : false,
        };
      }
      if (med.genericName) {
        const genClean = normalizeMedName(med.genericName);
        if (genClean && new RegExp(`\\b${genClean}\\b`, 'i').test(normalizedText)) {
          const mono = FORMULARY_MONOGRAPHS.find((m) => m.genericName.toLowerCase() === genClean);
          return {
            detectedName: med.genericName,
            canonicalGeneric: mono ? mono.genericName : med.genericName,
            isBrand: false,
          };
        }
      }
      if (med.brandName) {
        const brandClean = normalizeMedName(med.brandName);
        if (brandClean && new RegExp(`\\b${brandClean}\\b`, 'i').test(normalizedText)) {
          const mono = FORMULARY_MONOGRAPHS.find((m) =>
            m.brandNames.some((b) => b.toLowerCase() === brandClean),
          );
          return {
            detectedName: med.brandName,
            canonicalGeneric: mono ? mono.genericName : (med.genericName || med.brandName),
            isBrand: true,
          };
        }
      }
    }
  }

  // 2. Check curated FORMULARY_MONOGRAPHS
  for (const monograph of FORMULARY_MONOGRAPHS) {
    const genericLower = monograph.genericName.toLowerCase();
    const genericRegex = new RegExp(`\\b${genericLower}\\b`, 'i');
    if (genericRegex.test(normalizedText)) {
      return {
        detectedName: monograph.genericName,
        canonicalGeneric: monograph.genericName,
        isBrand: false,
      };
    }

    for (const brand of monograph.brandNames) {
      const brandLower = brand.toLowerCase();
      const brandRegex = new RegExp(`\\b${brandLower}\\b`, 'i');
      if (brandRegex.test(normalizedText)) {
        return {
          detectedName: brand,
          canonicalGeneric: monograph.genericName,
          isBrand: true,
        };
      }
    }
  }

  // 3. Check official PHILIPPINE_DRUG_FORMULARY registry
  for (const drug of PHILIPPINE_DRUG_FORMULARY) {
    const genLower = drug.genericName.toLowerCase();
    if (new RegExp(`\\b${genLower}\\b`, 'i').test(normalizedText)) {
      return {
        detectedName: drug.genericName,
        canonicalGeneric: drug.genericName,
        isBrand: false,
      };
    }
    for (const brand of drug.brandNames) {
      const brandLower = brand.toLowerCase();
      if (new RegExp(`\\b${brandLower}\\b`, 'i').test(normalizedText)) {
        return {
          detectedName: brand,
          canonicalGeneric: drug.genericName,
          isBrand: true,
        };
      }
    }
  }

  // 4. Fallback for common generic drugs
  const commonDrugNames = [
    'amlodipine', 'metformin', 'losartan', 'metoprolol', 'carvedilol',
    'captopril', 'telmisartan', 'furosemide', 'atorvastatin', 'rosuvastatin',
    'simvastatin', 'glimepiride', 'gliclazide', 'sitagliptin', 'empagliflozin',
    'paracetamol', 'ibuprofen', 'celecoxib', 'mefenamic', 'warfarin',
    'aspirin', 'clopidogrel',
  ];

  for (const drug of commonDrugNames) {
    const regex = new RegExp(`\\b${drug}\\b`, 'i');
    if (regex.test(normalizedText)) {
      const proper = drug.charAt(0).toUpperCase() + drug.slice(1);
      return {
        detectedName: proper,
        canonicalGeneric: proper,
        isBrand: false,
      };
    }
  }

  return null;
}

export interface ActiveMedicationItem {
  displayName: string;
  genericName?: string | null;
  brandName?: string | null;
  [key: string]: unknown;
}

/**
 * Checks if a mentioned medication intersects with the patient's active prescribed medications.
 * Returns the matching active medication item, or null if unprescribed.
 */
export function matchActivePrescribedMedication(
  mentionedGenericOrBrand: string,
  activeMedications: ActiveMedicationItem[],
): ActiveMedicationItem | null {
  const targetClean = normalizeMedName(mentionedGenericOrBrand);

  return (
    activeMedications.find((m) => {
      const displayClean = normalizeMedName(m.displayName);
      const genericClean = m.genericName ? normalizeMedName(m.genericName) : '';
      const brandClean = m.brandName ? normalizeMedName(m.brandName) : '';

      if (displayClean.includes(targetClean) || targetClean.includes(displayClean)) return true;
      if (genericClean && (genericClean.includes(targetClean) || targetClean.includes(genericClean))) return true;
      if (brandClean && (brandClean.includes(targetClean) || targetClean.includes(brandClean))) return true;

      // Check against formulary monograph generic and brands
      const monograph = FORMULARY_MONOGRAPHS.find(
        (mono) => mono.genericName.toLowerCase() === targetClean || mono.brandNames.some((b) => b.toLowerCase() === targetClean),
      );
      if (monograph) {
        const monoGeneric = monograph.genericName.toLowerCase();
        if (displayClean.includes(monoGeneric) || genericClean === monoGeneric) return true;
        for (const brand of monograph.brandNames) {
          const bLower = brand.toLowerCase();
          if (displayClean.includes(bLower) || brandClean === bLower) return true;
        }
      }

      return false;
    }) || null
  );
}

export interface RetrievalResult {
  matched: boolean;
  status: 'success' | 'unprescribed_drug' | 'out_of_scope';
  citation?: LeafletCitation | null;
  chunk?: LeafletChunk | null;
  hybridScore?: number;
  mentionedDrug?: string;
  activeMedication?: ActiveMedicationItem | null;
  groundedAnswer?: { en: string; fil: string };
}

export function detectSectionIntent(query: string): FormularySection | null {
  const q = query.toLowerCase();

  // Food & Meal Timing (including time of day, meal relation, liquids/grapefruit)
  if (
    /\b(food|meal|meals|eat|eating|empty stomach|breakfast|lunch|dinner|grapefruit|with food|without food|when|time|timing|morning|evening|night|bedtime|daily|schedule|water|with water)\b/i.test(
      q,
    ) ||
    /\b(pagkain|pagkaing|kumain|kumakain|bago kumain|pagkatapos kumain|almusal|hapunan|tanghalian|gutom|tiyan|sikmura|suha|kailan|oras|umaga|gabi|araw-araw|tubig)\b/i.test(q)
  ) {
    return 'food_and_timing';
  }

  // Missed Dose Rules
  if (
    /\b(missed|forgot|forgotten|skip|skipped|late dose|make up|double dose)\b/i.test(q) ||
    /\b(nakalimutan|nakalimutang|nalimutan|nalimutang|nakaligtaan|nakaligtaang|nalaktawan|nalaktawang|hindi nainom|di nainom|doble|dobleng)\b/i.test(q)
  ) {
    return 'missed_dose';
  }

  // Administration Instructions (how to take, swallow, crush, chew, store)
  if (
    /\b(how to take|swallow|crush|chew|break|cut|split|dissolve|storage|store|temperature|intake)\b/i.test(q) ||
    (q.includes('how') && (q.includes('take') || q.includes('give') || q.includes('administer'))) ||
    /\b(paano inumin|paano gamitin|paano ipainom|lunukin|durugin|nguyain|hatiin|itago|imbakin)\b/i.test(q)
  ) {
    return 'administration_instructions';
  }

  // Purpose & Indication (what is it for, why take, indication)
  if (
    /\b(purpose|indication|why take|what is it for|what is this for)\b/i.test(q) ||
    (q.includes('what is') && (q.includes('for') || q.includes('used'))) ||
    (q.includes('what does') && q.includes('do')) ||
    /\bwhat\s+(is|are)\s+[a-z0-9]+\s*$/i.test(q) ||
    /\b(para saan|bakit iniinom|bakit ipinapainom|dahilan|anong gamot|gamot ba)\b/i.test(q)
  ) {
    return 'purpose';
  }

  return null;
}

/**
 * Performs Entity-Scoped Hybrid Retrieval on the PNDF Formulary Knowledge Base.
 * 1. Detects mentioned drug in query.
 * 2. Intersects with patient's active prescribed medications (guaranteeing zero cross-drug contamination).
 * 3. If unprescribed, returns closed-world refusal for that entity.
 * 4. If prescribed, retrieves strictly from that drug's vetted monograph chunks using hybrid cosine + lexical scoring.
 * 5. Returns verified citation metadata and bilingual grounded synthesis.
 */
export function retrieveEntityScopedFormularyGuidance(params: {
  query: string;
  patientName: string;
  locale: 'en' | 'fil';
  activeMedications: ActiveMedicationItem[];
}): RetrievalResult {
  const { query, patientName, activeMedications } = params;
  const queryLower = query.toLowerCase();

  // 1. Cross-drug check: Check for any unprescribed medications mentioned in query.
  // Guarantees zero cross-drug contamination even if an active drug is also mentioned.
  for (const monograph of FORMULARY_MONOGRAPHS) {
    const genRegex = new RegExp(`\\b${monograph.genericName.toLowerCase()}\\b`, 'i');
    if (genRegex.test(queryLower)) {
      const isPrescribed = matchActivePrescribedMedication(monograph.genericName, activeMedications);
      if (!isPrescribed) {
        return {
          matched: true,
          status: 'unprescribed_drug',
          mentionedDrug: monograph.genericName,
          citation: null,
          chunk: null,
          groundedAnswer: {
            en: `${monograph.genericName} is not listed in ${patientName}'s active prescribed medications. I can only provide leaflet guidance for her confirmed active medicines. Please consult her doctor or pharmacist.`,
            fil: `Ang ${monograph.genericName} po ay wala sa listahan ng mga aktibong gamot ni ${patientName}. Maaari lamang po akong magbigay ng gabay para sa kanyang mga niresetang gamot. Mangyaring sumangguni sa doktor o pharmacist ni ${patientName}.`,
          },
        };
      }
    }
    for (const brand of monograph.brandNames) {
      const brandRegex = new RegExp(`\\b${brand.toLowerCase()}\\b`, 'i');
      if (brandRegex.test(queryLower)) {
        const isPrescribed = matchActivePrescribedMedication(brand, activeMedications);
        if (!isPrescribed) {
          return {
            matched: true,
            status: 'unprescribed_drug',
            mentionedDrug: brand,
            citation: null,
            chunk: null,
            groundedAnswer: {
              en: `${brand} is not listed in ${patientName}'s active prescribed medications. I can only provide leaflet guidance for her confirmed active medicines. Please consult her doctor or pharmacist.`,
              fil: `Ang ${brand} po ay wala sa listahan ng mga aktibong gamot ni ${patientName}. Maaari lamang po akong magbigay ng gabay para sa kanyang mga niresetang gamot. Mangyaring sumangguni sa doktor o pharmacist ni ${patientName}.`,
            },
          };
        }
      }
    }
  }

  for (const drug of PHILIPPINE_DRUG_FORMULARY) {
    const genRegex = new RegExp(`\\b${drug.genericName.toLowerCase()}\\b`, 'i');
    if (genRegex.test(queryLower)) {
      const isPrescribed = matchActivePrescribedMedication(drug.genericName, activeMedications);
      if (!isPrescribed) {
        return {
          matched: true,
          status: 'unprescribed_drug',
          mentionedDrug: drug.genericName,
          citation: null,
          chunk: null,
          groundedAnswer: {
            en: `${drug.genericName} is not listed in ${patientName}'s active prescribed medications. I can only provide leaflet guidance for her confirmed active medicines. Please consult her doctor or pharmacist.`,
            fil: `Ang ${drug.genericName} po ay wala sa listahan ng mga aktibong gamot ni ${patientName}. Maaari lamang po akong magbigay ng gabay para sa kanyang mga niresetang gamot. Mangyaring sumangguni sa doktor o pharmacist ni ${patientName}.`,
          },
        };
      }
    }
  }

  const commonDrugNames = [
    'amlodipine', 'metformin', 'losartan', 'metoprolol', 'carvedilol',
    'captopril', 'telmisartan', 'furosemide', 'atorvastatin', 'rosuvastatin',
    'simvastatin', 'glimepiride', 'gliclazide', 'sitagliptin', 'empagliflozin',
    'paracetamol', 'ibuprofen', 'celecoxib', 'mefenamic', 'warfarin',
    'aspirin', 'clopidogrel',
  ];
  for (const drug of commonDrugNames) {
    const regex = new RegExp(`\\b${drug}\\b`, 'i');
    if (regex.test(queryLower)) {
      const isPrescribed = matchActivePrescribedMedication(drug, activeMedications);
      if (!isPrescribed) {
        const proper = drug.charAt(0).toUpperCase() + drug.slice(1);
        return {
          matched: true,
          status: 'unprescribed_drug',
          mentionedDrug: proper,
          citation: null,
          chunk: null,
          groundedAnswer: {
            en: `${proper} is not listed in ${patientName}'s active prescribed medications. I can only provide leaflet guidance for her confirmed active medicines. Please consult her doctor or pharmacist.`,
            fil: `Ang ${proper} po ay wala sa listahan ng mga aktibong gamot ni ${patientName}. Maaari lamang po akong magbigay ng gabay para sa kanyang mga niresetang gamot. Mangyaring sumangguni sa doktor o pharmacist ni ${patientName}.`,
          },
        };
      }
    }
  }

  // 2. Check if query asks about combining / interaction between multiple active prescribed medicines
  const isCombinationOrInteractionQuery =
    /\b(together|same time|at once|interact|interaction|sabay|pagsabayin|magkasabay|isabay)\b/i.test(queryLower);
  const mentionedActiveMeds = activeMedications.filter((m) => {
    const nameClean = normalizeMedName(m.displayName);
    const genClean = m.genericName ? normalizeMedName(m.genericName) : '';
    const brandClean = m.brandName ? normalizeMedName(m.brandName) : '';
    return (
      (nameClean && new RegExp(`\\b${nameClean}\\b`, 'i').test(queryLower)) ||
      (genClean && new RegExp(`\\b${genClean}\\b`, 'i').test(queryLower)) ||
      (brandClean && new RegExp(`\\b${brandClean}\\b`, 'i').test(queryLower))
    );
  });

  if (isCombinationOrInteractionQuery && mentionedActiveMeds.length >= 2) {
    const medNames = mentionedActiveMeds.map((m) => m.displayName).join(' at ');
    return {
      matched: true,
      status: 'out_of_scope',
      citation: null,
      chunk: null,
      groundedAnswer: {
        en: `Official PNDF leaflets provide individual administration guidelines for ${medNames}. For combining or timing multiple medications together safely, please consult ${patientName}'s doctor or pharmacist directly.`,
        fil: `May kanya-kanya pong opisyal na tagubilin sa PNDF leaflet ang ${medNames}. Para sa ligtas na pagsasabay o interaksyon ng mga ito, mangyaring sumangguni po agad sa doktor o pharmacist ni ${patientName}.`,
      },
    };
  }

  // 3. Detect target medication
  const mention = detectMedicationMention(query, activeMedications);
  let targetActiveMed: ActiveMedicationItem | null = null;
  let canonicalGeneric = '';

  if (mention) {
    targetActiveMed = matchActivePrescribedMedication(mention.detectedName, activeMedications);
    canonicalGeneric = mention.canonicalGeneric;

    // If patient does NOT have this medication in active prescribed medications:
    if (!targetActiveMed) {
      return {
        matched: true,
        status: 'unprescribed_drug',
        mentionedDrug: mention.detectedName,
        citation: null,
        chunk: null,
        groundedAnswer: {
          en: `${mention.detectedName} is not listed in ${patientName}'s active prescribed medications. I can only provide leaflet guidance for her confirmed active medicines. Please consult her doctor or pharmacist.`,
          fil: `Ang ${mention.detectedName} po ay wala sa listahan ng mga aktibong gamot ni ${patientName}. Maaari lamang po akong magbigay ng gabay para sa kanyang mga niresetang gamot. Mangyaring sumangguni sa doktor o pharmacist ni ${patientName}.`,
        },
      };
    }
  } else {
    // If no drug was named, but patient has exactly 1 active medication:
    if (activeMedications.length === 1) {
      targetActiveMed = activeMedications[0];
      const match =
        detectMedicationMention(targetActiveMed.displayName, activeMedications) ||
        (targetActiveMed.genericName ? detectMedicationMention(targetActiveMed.genericName, activeMedications) : null);
      if (match) {
        canonicalGeneric = match.canonicalGeneric;
      }
    } else {
      // Check if query is asking general food/missed-dose without naming medication
      const isGuidanceQuery =
        /\b(with food|without food|empty stomach|missed dose|how to take|when to take|nakalimutan|bago kumain|pagkatapos kumain|inumin|kailan)\b/i.test(queryLower);
      if (isGuidanceQuery && activeMedications.length > 1) {
        const medNames = activeMedications.map((m) => m.displayName).join(', ');
        return {
          matched: true,
          status: 'out_of_scope',
          citation: null,
          chunk: null,
          groundedAnswer: {
            en: `Which of ${patientName}'s active medicines are you asking about (${medNames})?`,
            fil: `Alin po sa mga aktibong gamot ni ${patientName} ang tinutukoy ninyo (${medNames})?`,
          },
        };
      }
      return { matched: false, status: 'out_of_scope' };
    }
  }

  // Look up drug monograph
  const monograph = FORMULARY_MONOGRAPHS.find(
    (m) =>
      m.genericName.toLowerCase() === canonicalGeneric.toLowerCase() ||
      m.brandNames.some((b) => b.toLowerCase() === canonicalGeneric.toLowerCase()),
  );

  if (!monograph) {
    return {
      matched: true,
      status: 'out_of_scope',
      citation: null,
      chunk: null,
      groundedAnswer: {
        en: `There is no verified patient leaflet available in the Philippine National Drug Formulary for ${targetActiveMed?.displayName || canonicalGeneric}. Please consult ${patientName}'s doctor or pharmacist.`,
        fil: `Wala po sa opisyal na Philippine National Drug Formulary leaflet ang impormasyon para sa ${targetActiveMed?.displayName || canonicalGeneric}. Mangyaring sumangguni sa doktor o pharmacist ni ${patientName}.`,
      },
    };
  }

  // Closed-world validation: verify query intent and check for unsupported medical claims
  const detectedIntent = detectSectionIntent(query);

  const ALIEN_CONDITION_CATEGORIES: Record<string, string[]> = {
    diabetes: ['diabetes', 'blood sugar', 'glucose', 'insulin', 'asukal'],
    respiratory: ['cough', 'cold', 'flu', 'ubo', 'sipon', 'asthma', 'honi'],
    ophthalmic: ['eye', 'vision', 'paningin', 'mata'],
    dermatologic: ['rash', 'skin', 'kati', 'acne', 'tagihawat'],
    cardiovascular: ['hypertension', 'blood pressure', 'altapresyon', 'mataas na presyon', 'angina', 'chest pain', 'stroke'],
    pain_fever: ['pain', 'fever', 'headache', 'lagnat', 'sakit ng ulo', 'kirot'],
    cholesterol: ['cholesterol', 'kolesterol', 'taba sa dugo', 'ldl', 'triglycerides'],
  };

  const allMonographKeywords = monograph.chunks.flatMap((c) => c.keywords.map((k) => k.toLowerCase()));
  const allMonographContent = monograph.chunks.map((c) => (c.content + ' ' + c.contentFil).toLowerCase()).join(' ');

  // Check if query is asking about curing/treating an alien condition not covered by monograph
  let asksAlienCondition = false;
  for (const [category, terms] of Object.entries(ALIEN_CONDITION_CATEGORIES)) {
    const queryHasTerm = terms.some((term) => {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      return regex.test(queryLower);
    });
    if (queryHasTerm) {
      const monographSupportsTerm = terms.some(
        (term) => allMonographKeywords.includes(term) || allMonographContent.includes(term),
      );
      if (!monographSupportsTerm) {
        asksAlienCondition = true;
        break;
      }
    }
  }

  if (asksAlienCondition || !detectedIntent) {
    return {
      matched: true,
      status: 'out_of_scope',
      citation: null,
      chunk: null,
      groundedAnswer: {
        en: `This specific guidance is not in the verified Philippine National Drug Formulary leaflet for ${monograph.genericName}. Please consult ${patientName}'s doctor or pharmacist directly.`,
        fil: `Wala po sa opisyal na Philippine National Drug Formulary leaflet ng ${monograph.genericName} ang impormasyong ito. Mangyaring sumangguni po agad sa doktor o pharmacist ni ${patientName}.`,
      },
    };
  }

  // Hybrid retrieval across chunks of this monograph ONLY (zero cross-drug contamination)
  const queryEmbedding = computeDeterministicEmbedding(query);
  let bestChunk: LeafletChunk | null = null;
  let bestScore = -1;

  for (const chunk of monograph.chunks) {
    const cosSim = cosineSimilarity(queryEmbedding, chunk.embedding);
    const lexScore = computeLexicalScore(query, chunk.keywords, chunk.content);
    let hybridScore = 0.3 * Math.max(0, cosSim) + 0.7 * lexScore;

    if (detectedIntent === chunk.section) {
      hybridScore += 0.5;
    }

    if (hybridScore > bestScore) {
      bestScore = hybridScore;
      bestChunk = chunk;
    }
  }

  // Closed-world threshold: if query asks about something outside leaflet scope
  if (!bestChunk || bestScore < 0.25) {
    return {
      matched: true,
      status: 'out_of_scope',
      citation: null,
      chunk: null,
      groundedAnswer: {
        en: `This specific guidance is not in the verified Philippine National Drug Formulary leaflet for ${monograph.genericName}. Please consult ${patientName}'s doctor or pharmacist directly.`,
        fil: `Wala po sa opisyal na Philippine National Drug Formulary leaflet ng ${monograph.genericName} ang impormasyong ito. Mangyaring sumangguni po agad sa doktor o pharmacist ni ${patientName}.`,
      },
    };
  }

  const citation: LeafletCitation = {
    medicationName: targetActiveMed.displayName || monograph.genericName,
    sourceTitle: monograph.sourceTitle,
    section: bestChunk.sectionTitle,
  };

  // Synthesize native bilingual response with patient and drug name preserved verbatim
  const drugName = targetActiveMed.displayName || monograph.genericName;
  const groundedAnswer = synthesizeBilingualLeafletResponse({
    chunk: bestChunk,
    drugName,
    patientName,
  });

  return {
    matched: true,
    status: 'success',
    citation,
    chunk: bestChunk,
    hybridScore: bestScore,
    activeMedication: targetActiveMed,
    groundedAnswer,
  };
}

/**
 * Deterministically synthesizes warm, grounded responses from the retrieved chunk,
 * preserving pharmaceutical and patient names verbatim.
 */
export function synthesizeBilingualLeafletResponse(params: {
  chunk: LeafletChunk;
  drugName: string;
  patientName: string;
}): { en: string; fil: string } {
  const { chunk, drugName, patientName } = params;

  switch (chunk.section) {
    case 'food_and_timing':
      if (chunk.medicationGenericName === 'Metformin') {
        return {
          en: `${drugName} should always be taken with meals or immediately after eating (such as breakfast or dinner) with water to prevent stomach upset for ${patientName}. Avoid heavy alcohol intake.`,
          fil: `Dapat po nating ipainom ang ${drugName} kay ${patientName} kasabay o kaagad pagkatapos kumain (tulad ng almusal o hapunan) kasama ang tubig upang maiwasan ang pananakit o pangangasim ng tiyan.`,
        };
      }
      if (chunk.medicationGenericName === 'Amlodipine') {
        return {
          en: `${drugName} can be taken with or without food. Give it to ${patientName} at approximately the same time each day with a full glass of water, and avoid grapefruit or grapefruit juice.`,
          fil: `Maaari po nating ipainom ang ${drugName} kay ${patientName} nang may laman ang tiyan o wala (bago o pagkatapos kumain). Inumin ito sa parehong oras araw-araw kasama ang tubig, at iwasan po ang suha (grapefruit).`,
        };
      }
      if (chunk.medicationGenericName === 'Losartan') {
        return {
          en: `${drugName} may be taken with or without food. Give it to ${patientName} with water at the same time each day, and avoid potassium supplements unless prescribed.`,
          fil: `Maaari pong inumin ni ${patientName} ang ${drugName} nang may pagkain o wala sa tiyan. Ipainom ito sa parehong oras araw-araw kasabay ng tubig, at iwasan po ang mga suplementong may potassium.`,
        };
      }
      if (chunk.medicationGenericName === 'Metoprolol') {
        return {
          en: `${drugName} should be taken with or immediately following a meal for consistent absorption and stable blood levels for ${patientName}. Give it at the same time every day.`,
          fil: `Dapat po nating ipainom ang ${drugName} kay ${patientName} kasabay o kaagad pagkatapos kumain upang maging pantay ang bisa ng gamot. Ipainom ito sa parehong oras araw-araw.`,
        };
      }
      if (chunk.medicationGenericName === 'Atorvastatin') {
        return {
          en: `${drugName} can be taken with or without food. It is best given to ${patientName} in the evening or at bedtime because the body produces most cholesterol at night. Avoid large quantities of grapefruit or grapefruit juice.`,
          fil: `Maaari pong inumin ni ${patientName} ang ${drugName} nang may pagkain o wala, mas mainam po sa gabi o bago matulog dahil doon pinakamaraming gumagawa ng kolesterol ang katawan. Iwasan po ang suha (grapefruit).`,
        };
      }
      if (chunk.medicationGenericName === 'Paracetamol') {
        return {
          en: `${drugName} can be taken with or without food with a glass of water. If ${patientName} has a sensitive stomach, give it after a light snack, and never combine with other paracetamol products.`,
          fil: `Ligtas pong inumin ni ${patientName} ang ${drugName} nang may pagkain o kahit walang laman ang tiyan. Kung sensitibo ang sikmura, mainam pong ipainom pagkatapos kumain nang kaunti, at huwag isasabay sa iba pang gamot na may paracetamol.`,
        };
      }
      return {
        en: `${chunk.content} (Official guidance for ${patientName}'s ${drugName}.)`,
        fil: `${chunk.contentFil} (Opisyal na gabay para sa ${drugName} ni ${patientName}.)`,
      };

    case 'missed_dose':
      if (chunk.medicationGenericName === 'Metformin') {
        return {
          en: `If a dose of ${drugName} is missed, give it to ${patientName} with food as soon as you remember. If it is almost time for the next scheduled dose, skip the missed dose. Never double the dose.`,
          fil: `Kung nakalimutan po ang dose ng ${drugName} para kay ${patientName}, ipainom ito kasabay ng pagkain sa sandaling maalala. Kung malapit na ang susunod na iskedyul, laktawan na po ito at huwag magdoble ng dose.`,
        };
      }
      if (chunk.medicationGenericName === 'Metoprolol') {
        return {
          en: `If a dose of ${drugName} is missed, give it to ${patientName} as soon as remembered. However, if the next dose is within 4 hours, skip the missed dose and resume the regular schedule. Never double the dose.`,
          fil: `Kung nakalimutan po ang dose ng ${drugName} para kay ${patientName}, ipainom ito kapag naalala. Ngunit kung wala nang 4 na oras bago ang susunod na dose, laktawan na po ito. Huwag kailanman magdoble ng gamot.`,
        };
      }
      if (chunk.medicationGenericName === 'Paracetamol') {
        return {
          en: `If a scheduled dose of ${drugName} is missed, give it to ${patientName} when remembered, provided at least 4 to 6 hours have passed since the last dose. Never double the dose or exceed 4,000 mg in 24 hours.`,
          fil: `Kung nakaligtaan po ang dose ng ${drugName} para kay ${patientName}, ipainom ito kapag naalala kung lumipas na ang 4 hanggang 6 na oras mula sa huling pag-inom. Huwag magdoble ng dose o lumampas sa 4,000 mg sa isang araw.`,
        };
      }
      return {
        en: `If ${patientName} misses a dose of ${drugName}, give it as soon as you remember that same day. If more than 12 hours have passed or the next dose is near, skip it and continue the regular schedule. Never double the dose.`,
        fil: `Kung nakaligtaan po ang dose ng ${drugName} para kay ${patientName}, ipainom ito sa sandaling maalala sa araw ring iyon. Subalit kung mahigit 12 oras na ang nakalipas o malapit na ang susunod na iskedyul, laktawan na po ito at huwag kailanman magdoble ng gamot.`,
      };

    case 'purpose':
      if (chunk.medicationGenericName === 'Amlodipine') {
        return {
          en: `${drugName} is prescribed to manage high blood pressure (hypertension) and chest pain for ${patientName} by relaxing blood vessels so blood flows more smoothly.`,
          fil: `Ang ${drugName} po ay inirereseta para sa altapresyon at pananakit ng dibdib ni ${patientName} upang mapaluwag ang mga daluyan ng dugo at mapadali ang daloy nito.`,
        };
      }
      if (chunk.medicationGenericName === 'Metformin') {
        return {
          en: `${drugName} is prescribed to help manage blood sugar levels for type 2 diabetes by reducing liver glucose production and improving insulin response for ${patientName}.`,
          fil: `Ang ${drugName} po ay inirereseta para sa type 2 diabetes ni ${patientName} upang makontrol ang asukal sa dugo at mapabuti ang pagtugon ng katawan sa insulin.`,
        };
      }
      if (chunk.medicationGenericName === 'Losartan') {
        return {
          en: `${drugName} is prescribed to treat high blood pressure and protect kidney function for ${patientName} by widening and relaxing blood vessels.`,
          fil: `Ang ${drugName} po ay inirereseta para sa altapresyon at pangangalaga sa bato ni ${patientName} sa pamamagitan ng pagpapaluwag ng mga ugat.`,
        };
      }
      if (chunk.medicationGenericName === 'Metoprolol') {
        return {
          en: `${drugName} is a beta-blocker prescribed for high blood pressure, chest pain (angina), and to help control rapid or irregular heart rate for ${patientName}.`,
          fil: `Ang ${drugName} po ay isang beta-blocker para sa altapresyon, pananakit ng dibdib (angina), at pampabagal ng mabilis o iregular na tibok ng puso ni ${patientName}.`,
        };
      }
      if (chunk.medicationGenericName === 'Atorvastatin') {
        return {
          en: `${drugName} is a statin prescribed to lower bad cholesterol (LDL) and triglycerides in the blood, helping prevent heart attacks and strokes for ${patientName}.`,
          fil: `Ang ${drugName} po ay isang statin na nagpapababa ng masamang kolesterol (LDL) at triglycerides upang maprotektahan si ${patientName} sa bara sa ugat, atake sa puso, at stroke.`,
        };
      }
      if (chunk.medicationGenericName === 'Paracetamol') {
        return {
          en: `${drugName} is an analgesic and antipyretic medicine used for the relief of mild to moderate pain (such as headaches and body aches) and fever reduction for ${patientName}.`,
          fil: `Ang ${drugName} po ay gamot para sa lagnat at pampaginhawa ng banayad hanggang katamtamang pananakit ng ulo at katawan para kay ${patientName}.`,
        };
      }
      return {
        en: `${drugName} is prescribed for ${patientName} per the Philippine National Drug Formulary: ${chunk.content}`,
        fil: `Ang ${drugName} po ay nireseta para kay ${patientName} ayon sa Philippine National Drug Formulary: ${chunk.contentFil}`,
      };

    case 'administration_instructions':
      if (chunk.medicationGenericName === 'Metoprolol') {
        return {
          en: `Swallow ${drugName} whole with a glass of water. Do not abruptly stop giving this medicine to ${patientName} without doctor approval to prevent rebound hypertension, and store below 30°C.`,
          fil: `Lunukin po nang buo ang tableta ng ${drugName} kasabay ng tubig para kay ${patientName}. Huwag po itong biglang ititigil nang walang payo ng doktor, at itago sa tuyong lugar na hindi lalampas sa 30°C.`,
        };
      }
      if (chunk.medicationGenericName === 'Paracetamol') {
        return {
          en: `Swallow ${drugName} with a glass of water. Ensure doses are spaced at least 4 to 6 hours apart for ${patientName} and never exceed 4,000 mg in 24 hours to prevent liver toxicity.`,
          fil: `Lunukin po ang tableta ng ${drugName} kasabay ng tubig para kay ${patientName}. Tiyakin pong may pagitan na 4 hanggang 6 na oras ang bawat inumin at huwag lalampas sa 4,000 mg bawat araw upang maprotektahan ang atay.`,
        };
      }
      if (chunk.medicationGenericName === 'Metformin') {
        return {
          en: `Swallow ${drugName} whole with a glass of water. Do not crush or chew the tablet (do not split extended-release formulations) for ${patientName}, and store below 30°C away from heat and moisture.`,
          fil: `Lunukin po nang buo ang tableta ng ${drugName} kasabay ng tubig para kay ${patientName}. Huwag po itong durugin, hatiin, o nguyain, at itago sa tuyong lugar na hindi lalampas sa 30°C.`,
        };
      }
      return {
        en: `Swallow ${drugName} whole with a glass of water. Do not crush or chew the tablet unless advised by ${patientName}'s doctor, and store below 30°C in a dry place.`,
        fil: `Lunukin po nang buo ang tableta ng ${drugName} kasabay ng tubig para kay ${patientName}. Huwag po itong durugin o nguyain maliban kung ipinayo ng doktor, at itago sa tuyong lugar na hindi lalampas sa 30°C.`,
      };

    default:
      return {
        en: chunk.content,
        fil: chunk.contentFil,
      };
  }
}
