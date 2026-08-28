# Gemini Flash for Alaga OCR testing

Checked against official Google documentation on 2026-08-28.

## Recommendation

**Yes, the Gemini Developer API free tier is reasonable for a small Alaga OCR comparison using synthetic images only.** It is not appropriate for real medicine labels, prescriptions, patient names, or other personal health information on the unpaid tier.

Do not build against `gemini-2.0-flash`. Google shut down the Gemini 2.0 Flash and Flash-Lite endpoints on 2026-06-01. For a new experiment, use the current stable `gemini-3.7-flash`; `gemini-3.5-flash` also remains available. Google identifies `gemini-3.6-flash` as the direct replacement for the retired 2.0 Flash endpoints. ([release notes](https://ai.google.dev/gemini-api/docs/changelog), [deprecation table](https://ai.google.dev/gemini-api/docs/deprecations), [current models](https://ai.google.dev/gemini-api/docs/models))

This should be an optional benchmark against the existing local Tesseract.js path, not a replacement decision yet. Keep Alaga's existing invariant: extraction creates an untrusted draft, preserves source wording, never converts vague instructions into exact times, and requires explicit human review before confirmation.

## Why it fits the experiment

- Gemini accepts image input by URL, inline bytes, or the Files API. The documented formats include PNG, JPEG, WebP, HEIC, and HEIF. Its PDF document-understanding path can extract structured information and transcribe document content while considering layout. This is broader than conventional OCR, but it is still a generative vision model rather than a deterministic OCR guarantee. ([image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [document understanding](https://ai.google.dev/gemini-api/docs/document-processing))
- Structured outputs can constrain the response to a JSON Schema, which maps well to Alaga's medication draft fields. Google explicitly warns that schema-valid JSON can still contain semantically wrong values, so server-side validation and user confirmation remain mandatory. ([structured outputs](https://ai.google.dev/gemini-api/docs/structured-output))
- The pricing page lists standard input and output for `gemini-3.7-flash` as free of charge on the free tier. Free access is limited: quotas are measured across RPM, TPM, and RPD, apply per project, vary by model/tier/account, and are not guaranteed. The current exact allowance must be checked in the signed-in AI Studio rate-limit dashboard rather than hard-coded into project documentation. ([pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits))
- Google lists both the Philippines and Taiwan as supported regions for Google AI Studio and the Gemini API. ([available regions](https://ai.google.dev/gemini-api/docs/available-regions))

## The important privacy boundary

Google classifies direct AI Studio use and unpaid Gemini API quota as **Unpaid Services**. For those services, Google says submitted content and generated responses may be used to improve its products; human reviewers may read, annotate, and process inputs and outputs; and developers must not submit sensitive, confidential, or personal information. ([Gemini API Additional Terms, "Unpaid Services"](https://ai.google.dev/gemini-api/terms))

That makes the free tier acceptable only under Alaga's current synthetic-data boundary. A cropped real medicine label may still expose a person's name, prescription number, prescriber, pharmacy, or medication details, so "crop it first" is not a sufficient privacy control.

The same terms prohibit using the service in clinical practice, providing medical advice, or using it in a way that requires medical-device regulatory clearance. Alaga's synthetic portfolio experiment and mandatory correction flow are consistent with a testing tool, but this research does not establish that a future real-data product is legally or clinically acceptable. ([Gemini API Additional Terms, "Use Restrictions"](https://ai.google.dev/gemini-api/terms))

## Free Developer API, paid Developer API, and Vertex AI are different

| Route | Suitable Alaga use | Data-use position | Cost/operations |
| --- | --- | --- | --- |
| AI Studio / Gemini Developer API free tier | Synthetic benchmark and prompt/schema iteration | Inputs and outputs may be used for product improvement and reviewed by humans; no sensitive/personal data | Free within variable project quotas |
| Gemini Developer API paid tier | A later controlled technical evaluation, subject to product/legal review | Google says prompts, files, and responses are not used to improve its products; limited safety logging and feature-specific retention can still apply | Requires an active billing account; higher limits and token charges |
| Vertex AI | A future Google Cloud production architecture if its governance controls are needed | Google Cloud says customer data is not used to train or fine-tune models without permission; retention exceptions and configuration still need review | Separate Google Cloud service, IAM, regional deployment, billing, and operational setup; it is not the AI Studio free tier |

Sources: [Gemini pricing and tier comparison](https://ai.google.dev/gemini-api/docs/pricing), [Gemini Additional Terms](https://ai.google.dev/gemini-api/terms), [Gemini Developer API retention details](https://ai.google.dev/gemini-api/docs/zdr), [Vertex AI data governance](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention).

## Minimal evaluation plan

1. Keep Tesseract.js as the baseline and add Gemini behind a development-only server adapter. Store `GEMINI_API_KEY` in the local server environment, never in the Expo client or Git; Google recommends a backend proxy for mobile/web clients. ([API key guidance](https://ai.google.dev/gemini-api/docs/api-key))
2. Use 20-50 deliberately synthetic samples covering clear labels, glare, rotation, small print, mixed English/Filipino wording, handwritten-looking schedules, and ambiguous "after meals" instructions.
3. Ask for a narrow JSON schema matching the current `MedicationOcrDraft`, with nullable unknown fields and both `rawText` and warnings. Never ask the model to infer missing medication instructions.
4. Score exact field accuracy separately for medicine name, strength, dose quantity/unit, explicit clock times, and raw-text transcription. Also record invented values, dropped text, latency, rate-limit failures, and how often manual correction is required.
5. Accept Gemini only if it materially improves the difficult cases without increasing unsafe invented fields. Regardless of the result, retain the review-and-confirm UI and deterministic schedule rules.

## Decision

Run the experiment with `gemini-3.7-flash` on synthetic images. Do not call it "Google OCR" in the architecture: describe it as a multimodal extraction experiment. Do not upload real Alaga or patient data to the free tier, and do not make Gemini availability a requirement for the local portfolio demo.
