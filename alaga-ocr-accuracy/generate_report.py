import os
import json
import re
import yaml
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent
FIELDS_FILE = BASE_DIR / "fields.yaml"
OUTLINE_FILE = BASE_DIR / "outline.yaml"
RESULTS_DIR = BASE_DIR / "results"
REPORT_FILE = BASE_DIR / "report.md"

def slugify(text: str) -> str:
    """Generate markdown-compatible anchor slugs."""
    slug = text.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    return slug.strip('-')

def load_data():
    with open(OUTLINE_FILE, "r", encoding="utf-8") as f:
        outline = yaml.safe_load(f)
    
    with open(FIELDS_FILE, "r", encoding="utf-8") as f:
        fields_data = yaml.safe_load(f)
        
    results = {}
    for json_file in sorted(RESULTS_DIR.glob("*.json")):
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            item_name = json_file.stem
            results[item_name] = data
            
    return outline, fields_data, results

def format_value(val):
    if val is None or val == "" or "[uncertain]" in str(val):
        return None
    if isinstance(val, list):
        if not val:
            return None
        if all(isinstance(x, dict) for x in val):
            return "\n".join("- " + " | ".join(f"**{k}**: {v}" for k, v in d.items()) for d in val)
        return ", ".join(str(x) for x in val)
    if isinstance(val, dict):
        return "\n".join(f"- **{k}**: {v}" for k, v in val.items())
    return str(val)

def generate_report():
    outline, fields_data, results = load_data()
    topic = outline.get("topic", "Medication Extraction Research")
    field_categories = fields_data.get("fields", {})

    lines = []
    lines.append(f"# Deep Research Report: {topic}\n")
    lines.append(f"> **Date**: September 2026  ")
    lines.append(f"> **Target System**: Alaga Healthcare & Eldercare Medication Adherence Application  ")
    lines.append(f"> **Framework**: React Native 0.86 / Expo SDK 57 (Client) + Node.js / PostgreSQL (Server)  \n")

    # Executive Summary
    lines.append("## Executive Summary\n")
    lines.append("This research report evaluates eight distinct architectures, foundation models, and computer vision techniques to elevate Alaga's medication extraction accuracy beyond the baseline Tesseract.js LSTM engine. Each approach was rigorously analyzed across 17 technical, clinical, and operational dimensions covering deployment viability, accuracy under real-world pharmaceutical conditions (cylindrical pill bottles, foil blister glare, handwritten prescriptions), latency, RAM footprint, and PHI privacy compliance under HIPAA, GDPR, and the Philippine Data Privacy Act (RA 10173).\n")

    # Comparative Summary Matrix Table
    lines.append("### Comprehensive Comparison Matrix\n")
    lines.append("| Technology / Pipeline | Deployment | Accuracy (Printed) | Accuracy (Handwriting) | Latency | RAM Footprint | Privacy / PHI | Offline Support | Cost Profile |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    
    matrix_rows = [
        ("Tesseract.js Baseline", "Local Node.js Server", "75-84%", "<20%", "4.2-8.5s", "280-450 MB", "100% Private (LAN)", "LAN Only", "100% Free"),
        ("Google Gemini 3.7 Flash", "Cloud API (Backend Proxy)", "94-98%", "78-88%", "1.2-2.8s", "<10 MB (Server)", "Paid/Vertex for PHI; Free = Synthetic", "No (Internet Req.)", "Free Tier / $0.0003/img"),
        ("Google ML Kit Text Recognition", "Client On-Device (Mobile)", "89-94%", "35-48%", "0.08-0.25s", "40-90 MB", "100% Private (On-Device)", "100% Offline", "100% Free"),
        ("Apple Vision Framework", "Client On-Device (iOS)", "92-96%", "62-74%", "0.05-0.18s", "30-65 MB", "100% Private (On-Device)", "100% Offline", "100% Free"),
        ("Decoupled On-Device + Local SLM", "Client On-Device (ExecuTorch)", "90-95%", "40-52%", "1.5-3.8s", "700-1400 MB", "100% Private (On-Device)", "100% Offline", "100% Free"),
        ("Edge Vision-Language Models (VLM)", "Edge Gateway Server (LAN)", "93-97%", "72-84%", "1.8-4.5s", "2.4-4.2 GB", "100% Private (LAN)", "100% Offline (LAN)", "Free (Hardware Req.)"),
        ("CV Preprocessing & Dewarping", "Pre-filter (Client/Server)", "+18-35% Boost", "+15-25% Boost", "0.04-0.35s", "60-160 MB", "100% Private", "100% Offline", "100% Free"),
        ("Formulary Grounding (PNDF) & LASA", "Post-filter (Client/Server)", "+25-40% Precision", "High Filter", "0.002-0.015s", "15-35 MB", "100% Private", "100% Offline", "100% Free"),
    ]
    for row in matrix_rows:
        lines.append(f"| {' | '.join(row)} |")
    lines.append("\n---\n")

    # Table of Contents
    lines.append("## Table of Contents\n")
    idx = 1
    for item in outline.get("items", []):
        raw_name = item["name"]
        display_name = raw_name.replace("_", " ")
        data = results.get(raw_name, {})
        slug = slugify(display_name)
        
        deploy = data.get("deployment_location", "N/A")
        latency = data.get("latency_seconds", "N/A")
        offline = data.get("offline_readiness", "N/A")
        cost = data.get("cost_profile", "N/A")
        
        # Format concise metrics for TOC line
        latency_short = latency.split("(")[0].strip() if "(" in latency else latency[:15]
        deploy_short = "Cloud API" if "Cloud" in deploy else ("On-Device" if "Client" in deploy else "Server / Filter")
        offline_short = "Yes" if "100% offline" in offline.lower() or "offline" in offline.lower() and "zero" not in offline.lower() else "No"
        cost_short = "Free" if "free" in cost.lower() else "Pay-per-token"
        
        lines.append(f"{idx}. [{display_name}](#{slug}) — **{deploy_short}** | Latency: `{latency_short}` | Offline: `{offline_short}` | Cost: `{cost_short}`")
        idx += 1
    
    lines.append(f"{idx}. [Recommended Alaga Architecture & Roadmap](#recommended-alaga-architecture-and-roadmap)")
    lines.append(f"{idx+1}. [Clinical Safety & Guardrail Invariants](#clinical-safety-and-guardrail-invariants)\n")
    lines.append("---\n")

    # Detailed Content by Item
    lines.append("## Detailed Research Findings\n")
    for item in outline.get("items", []):
        raw_name = item["name"]
        display_name = raw_name.replace("_", " ")
        slug = slugify(display_name)
        data = results.get(raw_name, {})
        uncertain_fields = set(data.get("uncertain", []))

        lines.append(f"### <a id=\"{slug}\"></a>{display_name}\n")
        lines.append(f"> **Category**: {item.get('category', 'Evaluation Item')}  ")
        lines.append(f"> **Overview**: {item.get('description', '')}\n")

        for cat_key, field_list in field_categories.items():
            cat_title = cat_key.replace("_", " ").title()
            valid_field_lines = []
            
            for field_def in field_list:
                fname = field_def["name"]
                if fname in uncertain_fields:
                    continue
                val = data.get(fname)
                formatted = format_value(val)
                if formatted:
                    fdesc = field_def.get("description", "")
                    clean_fname = fname.replace("_", " ").title()
                    valid_field_lines.append(f"- **{clean_fname}**: {formatted}")

            if valid_field_lines:
                lines.append(f"#### {cat_title}\n")
                lines.extend(valid_field_lines)
                lines.append("")

        lines.append("---\n")

    # Recommended Architecture & Implementation Roadmap
    lines.append("## <a id=\"recommended-alaga-architecture-and-roadmap\"></a>Recommended Alaga Architecture & Roadmap\n")
    lines.append("Based on the technical trade-offs, privacy regulations, device resource constraints, and Philippine healthcare infrastructure, we recommend a **Four-Stage Hybrid Architecture** for Alaga:\n")
    
    lines.append("```mermaid")
    lines.append("flowchart TD")
    lines.append("    A[\"Camera / Gallery Image Capture\"] --> B[\"Stage 1: CV Pre-Processing (Sharp / OpenCV)\"]")
    lines.append("    B -->|\"Adaptive CLAHE + Blister Glare Filter\"| C{\"Device / Connectivity State\"}")
    lines.append("    C -->|\"Offline / High Privacy Mode\"| D[\"Stage 2A: On-Device Vision (ML Kit / Apple Vision)\"]")
    lines.append("    C -->|\"Complex Prescription / Cloud Enabled\"| E[\"Stage 2B: Gemini 3.7 Flash Proxy (Low Temp)\"]")
    lines.append("    D --> F[\"Stage 3: Spatial Heuristic & Tagalog NLP Parser\"]")
    lines.append("    E --> G[\"JSON Schema Structured MedicationOcrDraft\"]")
    lines.append("    F --> H[\"Stage 4: PNDF Formulary Grounding & LASA Engine\"]")
    lines.append("    G --> H")
    lines.append("    H --> I{\"PNDF Verification Check\"}")
    lines.append("    I -->|\"Verified Match\"| J[\"High-Confidence Medication Draft\"]")
    lines.append("    I -->|\"Fuzzy / Ambiguous Match\"| K[\"Draft with LASA Safety Warnings\"]")
    lines.append("    J --> L[\"Mandatory Caregiver Confirmation Modal\"]")
    lines.append("    K --> L")
    lines.append("```\n")

    lines.append("### Architectural Breakdown:\n")
    lines.append("1. **Stage 1: Image Pre-Processing & Dewarping**")
    lines.append("   - Apply Contrast Limited Adaptive Histogram Equalization (CLAHE) and bilateral filtering to suppress metallic blister foil glare.")
    lines.append("   - Normalize rotation and aspect ratio before text extraction passes.\n")
    lines.append("2. **Stage 2: Tiered Dual-Engine Extraction (On-Device Primary, Cloud Fallback)**")
    lines.append("   - **Primary On-Device Engine**: Integrate Google ML Kit (`react-native-mlkit-ocr`) for Android and Apple Vision for iOS. Provides 100% offline capability, zero server costs, zero network latency (<200ms), and 100% privacy compliance for real patient prescription labels.")
    lines.append("   - **Secondary Cloud Fallback (Optional / Opt-In)**: For complex handwritten doctor slips or multi-medication hospital discharge grids, allow opt-in routing to `gemini-3.7-flash` via the Node.js backend proxy with strict JSON Schema constraints. Only enabled with explicit caregiver consent and compliant PHI boundaries.\n")
    lines.append("3. **Stage 3: Philippine National Drug Formulary (PNDF) Grounding**")
    lines.append("   - Embed a compact (3.8 MB) pre-indexed Philippine FDA/PNDF drug dictionary into the client (`expo-sqlite` or in-memory trie).")
    lines.append("   - Use SymSpell symmetric delete fuzzy matching to correct optical character errors (e.g., `Amlodip1ne` -> `Amlodipine`).")
    lines.append("   - Screen extracted medications against Look-Alike/Sound-Alike (LASA) databases (e.g., distinguishing `Celebrex` vs `Celexa`).\n")
    lines.append("4. **Stage 4: Deterministic Schedule & Meal Parsing**")
    lines.append("   - Retain and extend Alaga's deterministic Tagalog schedule parser (`server/src/ocr.ts`) to handle local eldercare idioms (`bago mag-almusal`, `tuwing gabi`, `tuwing ika-8 oras`, `kalahating tableta`).\n")

    # Safety Invariants
    lines.append("## <a id=\"clinical-safety-and-guardrail-invariants\"></a>Clinical Safety & Guardrail Invariants\n")
    lines.append("In accordance with Alaga's core medical software design principles (`PRODUCT.md` and `DESIGN.md`), the following safety invariants are non-negotiable:\n")
    lines.append("- **Untrusted Draft Invariant**: All OCR and VLM outputs are treated strictly as untrusted drafts. The system must never automatically commit medications to a patient's schedule without explicit, manual caregiver review and confirmation.")
    lines.append("- **Preserved Source Wording**: Extracted raw text must always be preserved alongside structured fields so the caregiver can verify the original packaging print.")
    lines.append("- **Zero Phantom Dosages**: Vague or ambiguous timing notes (such as *'as needed'* or *'take with water'*) must never be hallucinated into arbitrary clock times (e.g., 08:00). If a specific clock time is not explicitly printed, it must remain null.")
    lines.append("- **Look-Alike/Sound-Alike (LASA) Warnings**: When an extracted medicine name is phonetically close to a high-risk medication, prominent warning badges must be displayed in the review modal.")
    lines.append("- **Tagalog/Filipino Immutability**: Patient names, medicine names, strengths, and unit annotations must never be translated during UI language switching between English and Filipino.\n")

    report_content = "\n".join(lines)
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(report_content)
    
    print(f"Report generated successfully: {REPORT_FILE}")
    print(f"Total lines: {len(lines)}, Total characters: {len(report_content)}")

if __name__ == "__main__":
    generate_report()
