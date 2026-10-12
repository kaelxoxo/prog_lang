import type { AssistantLocale } from './types';

/**
 * Bantay only helps with the patient's care inside Alaga: recorded medicines,
 * schedules, dose history, medication summaries, information about a recorded
 * medicine, adding medicines, and how to use the app.
 *
 * This deterministic pre-check declines clearly out-of-scope requests before
 * any model is called. It runs on the device (instant, offline) and on the
 * server (authoritative, cannot be bypassed by a modified client). The model's
 * system instruction enforces the same scope for phrasings not listed here.
 */
export type OffTopicCategory =
  | 'prompt_injection'
  | 'roleplay'
  | 'code'
  | 'creative_writing'
  | 'personal'
  | 'unrelated';

const CODE_LANGUAGES =
  'python|javascript|typescript|java|kotlin|swift|c\\+\\+|c#|php|ruby|golang|rust|html|css|sql|bash|powershell|regex';

const OFF_TOPIC_PATTERNS: ReadonlyArray<readonly [OffTopicCategory, RegExp]> = [
  // Attempts to override or extract Bantay's instructions.
  ['prompt_injection', /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instructions?|rules?|prompts?|guidelines?|restrictions?)\b/i],
  ['prompt_injection', /\b(system|hidden|initial|original|developer)\s+(prompt|instructions?|message)\b/i],
  ['prompt_injection', /\byour\s+(instructions|prompt|programming)\b/i],
  ['prompt_injection', /\b(jailbreak|developer mode|dan mode)\b/i],

  // Persona changes, impersonation and role-play.
  ['roleplay', /\brole[\s-]?play/i],
  ['roleplay', /\b(pretend|imagine)\b.{0,20}\b(to be|you(?:'re| are)|yourself|that you)\b/i],
  ['roleplay', /\b(?:you|u)\s+(?:will\s+|to\s+|should\s+|must\s+)?(?:act|behave|respond|talk|speak|reply|answer)\s+(?:as|like)\b/i],
  ['roleplay', /^\s*(?:please\s+|pls\s+|now\s+)?(?:act|behave|talk|speak|respond|reply)\s+(?:as|like)\b/i],
  ['roleplay', /\b(?:you are|you're)\s+now\b|\bfrom now on\b/i],
  ['roleplay', /\b(?:impersonate|imitate)\b/i],
  ['roleplay', /\bbe\s+my\s+(?:girlfriend|boyfriend|wife|husband|partner|friend|bestie|therapist|lawyer|teacher|tutor|doctor|nurse)\b/i],
  ['roleplay', /\b(?:magpanggap|magkunwari|kunwari(?:ng)?\s+ikaw|umarte\s+ka|gumanap\s+(?:ka\s+)?(?:na\s+)?bilang)\b/i],

  // Writing or explaining code.
  ['code', /```/],
  ['code', new RegExp(`\\b(?:${CODE_LANGUAGES})\\b`, 'i')],
  ['code', /\b(?:write|generate|create|build|code|implement|debug|refactor|fix|gumawa|sumulat|isulat|magsulat)\b.{0,40}\b(?:code|coding|script|program(?:ming)?|function|algorithm|website|webpage|software)\b/i],
  ['code', /(?:console\.log|#include|public\s+static\s+void|\bdef\s+\w+\s*\(|\bfunction\s+\w+\s*\(|\bimport\s+\w+\s+from\b)/],

  // Essays, stories, poems and other long-form or creative writing.
  ['creative_writing', /\b(?:essays?|poems?|poetry|haiku|limerick|lyrics|novel|fanfic(?:tion)?|screenplay|thesis|sanaysay|talumpati)\b/i],
  ['creative_writing', /\b(?:write|compose|draft|create|generate|make|give me|tell me)\b.{0,40}\b(?:stor(?:y|ies)|songs?|articles?|blog(?:\s+post)?|speech|jokes?|rap|letter|paragraphs?)\b/i],
  ['creative_writing', /\b(?:sumulat|isulat|magsulat|gumawa|gawan|gawin)\b.{0,40}\b(?:tula|kuwento|kwento|awit|kanta|liham|talata)\b/i],

  // Personal conversation about Bantay or the user.
  ['personal', /\b(?:are you (?:single|married|human|real|alive|a robot|lonely|happy)|do you (?:love|like) me|do you have (?:feelings|a (?:girlfriend|boyfriend|family))|how old are you|will you marry|date me|i love you|tell me about yourself|who (?:made|created|built) you)\b/i],
  ['personal', /\bwhat(?:'s| is) your (?:age|name|favou?rite|religion|opinion|political|zodiac)\b/i],
  ['personal', /\b(?:love life|dating advice|break ?up with|crush on|jowa|syota|ilang taon ka na|mahal kita|mahal mo ba ako|may (?:jowa|syota) ka)\b/i],

  // General-purpose requests unrelated to the patient's medicines.
  ['unrelated', /\b(?:homework|math problem|solve (?:this|the|for)|equation|capital of|recipe for|lottery|horoscope|zodiac|crypto(?:currency)?|bitcoin|politics|election)\b/i],
  ['unrelated', /\btranslate (?:this|the following)\b/i],
];

export function detectOffTopicRequest(query: string): OffTopicCategory | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  for (const [category, pattern] of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) return category;
  }
  return null;
}

export function offTopicDecline(patientName: string, locale: AssistantLocale): string {
  return locale === 'fil'
    ? `Ang matutulungan ko lang po ay ang mga gamot at pangangalaga ni ${patientName} sa Alaga, gaya ng iskedyul, mga dose ngayong araw, buod ng mga gamot, o impormasyon tungkol sa isang naitalang gamot. Hindi po ako makakatulong sa pagsulat ng code, sanaysay o kuwento, pagpapanggap bilang ibang tao, o mga personal na usapin.`
    : `I can only help with ${patientName}'s medicines and care in Alaga, like schedules, today's doses, medication summaries, or details about a recorded medicine. I can't help with writing code, essays or stories, role-play, or personal topics.`;
}

const CODE_OUTPUT_PATTERNS = [
  /```/,
  /(?:console\.log|#include|public\s+static\s+void|<\/?(?:script|div|html|body)\b)/i,
  /^\s*(?:def|function|class|import|from|const|let|var)\s+\w+.*[({=:]\s*$/m,
];

/** Output-side check: a model reply containing code is never shown to the caregiver. */
export function containsCodeOutput(text: string): boolean {
  return CODE_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}
