# Environment Variables:
# - OPENAI_API_KEY: Required for LLM improvements (optional — feature degrades gracefully without it)
# - RESUME_API_PORT: Defaults to 5001
# - FLASK_ENV: 'production' or 'development'
# - BLOB_READ_WRITE_TOKEN: Vercel Blob token (used by caller, not needed here)

import os
import re
import io
import json
import math
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
from typing import Dict, List, Optional, Tuple

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Constants & keyword lists
# ---------------------------------------------------------------------------

ACTUARIAL_KEYWORDS = [
    "actuarial", "actuary", "solvency", "reserving", "pricing", "underwriting",
    "reinsurance", "mortality", "morbidity", "lapse rate", "claim frequency",
    "loss ratio", "IFRS 17", "GAAP", "statutory", "capital model",
    "stochastic", "deterministic", "catastrophe model", "cat model",
    "predictive analytics", "machine learning", "python", "r programming",
    "sql", "excel", "vba", "tableau", "power bi", "data analysis",
    "risk management", "financial modeling", "life insurance", "health insurance",
    "property casualty", "p&c", "pension", "annuity", "investment",
    "liability", "asset", "duration", "convexity", "yield curve",
    "regression", "glm", "gradient boosting", "random forest", "neural network",
    "communication", "presentation", "problem solving", "analytical",
    "teamwork", "leadership", "project management", "stakeholder",
    "exam fellowship", "fellow", "associate", "cas", "soa", "cia", "iai",
    "probability", "statistics", "calculus", "linear algebra",
    "microsoft office", "powerpoint", "word",
]

SECTION_KEYWORDS = {
    "summary": ["summary", "objective", "profile", "about", "introduction", "overview"],
    "experience": ["experience", "work history", "employment", "career", "professional background"],
    "education": ["education", "academic", "qualification", "degree", "university", "college"],
    "skills": ["skills", "technical skills", "competencies", "expertise", "proficiencies"],
}

# ---------------------------------------------------------------------------
# Resume Parsing
# ---------------------------------------------------------------------------

def parse_pdf(file_bytes: bytes) -> str:
    """Parse PDF using PyMuPDF (fitz)."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        return "\n".join(text_parts)
    except ImportError:
        raise RuntimeError("PyMuPDF (fitz) is not installed. Run: pip install PyMuPDF")
    except Exception as e:
        raise RuntimeError(f"Failed to parse PDF: {str(e)}")


def parse_docx(file_bytes: bytes) -> str:
    """Parse DOCX using python-docx."""
    try:
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
        return "\n".join(paragraphs)
    except ImportError:
        raise RuntimeError("python-docx is not installed. Run: pip install python-docx")
    except Exception as e:
        raise RuntimeError(f"Failed to parse DOCX: {str(e)}")


def extract_sections(raw_text: str) -> Dict[str, str]:
    """Attempt to split resume text into sections."""
    sections: Dict[str, str] = {
        "summary": "",
        "experience": "",
        "education": "",
        "skills": "",
        "other": "",
    }

    lines = raw_text.split("\n")
    current_section = "other"
    section_content: Dict[str, List[str]] = {k: [] for k in sections}

    for line in lines:
        line_lower = line.strip().lower()
        matched = False
        for section_key, keywords in SECTION_KEYWORDS.items():
            if any(kw in line_lower for kw in keywords) and len(line.strip()) < 60:
                current_section = section_key
                matched = True
                break
        if not matched:
            section_content[current_section].append(line)

    for key in sections:
        sections[key] = "\n".join(section_content[key]).strip()

    return sections


def parse_resume(file_bytes: bytes, file_name: str) -> Dict:
    """Parse resume file and return raw text + sections."""
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if ext == "pdf":
        raw_text = parse_pdf(file_bytes)
    elif ext in ("doc", "docx"):
        raw_text = parse_docx(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: .{ext}. Only PDF and DOCX are supported.")

    sections = extract_sections(raw_text)
    word_count = len(raw_text.split())

    return {
        "raw_text": raw_text,
        "sections": sections,
        "word_count": word_count,
    }


# ---------------------------------------------------------------------------
# ATS Score Engine
# ---------------------------------------------------------------------------

def score_contact_info(text: str) -> Tuple[int, List[str]]:
    """Check for email and phone patterns. Max 15 pts."""
    score = 0
    feedback = []
    email_pattern = r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
    phone_pattern = r"(\+?\d[\d\s\-().]{7,}\d)"

    if re.search(email_pattern, text):
        score += 8
    else:
        feedback.append("No email address detected — add a professional email.")

    if re.search(phone_pattern, text):
        score += 7
    else:
        feedback.append("No phone number detected — include a contact number.")

    return score, feedback


def score_sections(text: str) -> Tuple[int, List[str]]:
    """Check for presence of key section headings. Max 20 pts."""
    text_lower = text.lower()
    score = 0
    feedback = []
    pts_each = 5  # 4 sections × 5 = 20

    section_map = {
        "experience/work history": ["experience", "work history", "employment"],
        "education": ["education", "academic", "degree"],
        "skills": ["skills", "technical skills", "competencies"],
        "summary/objective": ["summary", "objective", "profile"],
    }

    for section_label, keywords in section_map.items():
        if any(kw in text_lower for kw in keywords):
            score += pts_each
        else:
            feedback.append(f"Missing section: {section_label} — add a dedicated heading.")

    return score, feedback


def score_bullet_points(text: str) -> Tuple[int, List[str]]:
    """Check for bullet-point formatting. Max 15 pts."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    bullet_lines = [l for l in lines if l and l[0] in ("-", "•", "*", "▪", "◦", "–")]
    ratio = len(bullet_lines) / max(len(lines), 1)
    feedback = []

    if ratio >= 0.3:
        score = 15
    elif ratio >= 0.15:
        score = 10
        feedback.append("Consider using more bullet points to improve readability.")
    elif ratio >= 0.05:
        score = 5
        feedback.append("Very few bullet points detected — use bullets to list achievements.")
    else:
        score = 0
        feedback.append("No bullet points detected — restructure experience using bullet points.")

    return score, feedback


def score_length(word_count: int) -> Tuple[int, List[str]]:
    """Score based on resume word count. Optimal 400-800. Max 15 pts."""
    feedback = []
    if 400 <= word_count <= 800:
        score = 15
    elif 300 <= word_count < 400:
        score = 10
        feedback.append(f"Resume is slightly short ({word_count} words). Aim for 400–800 words.")
    elif 800 < word_count <= 1000:
        score = 10
        feedback.append(f"Resume is slightly long ({word_count} words). Aim for 400–800 words.")
    elif 200 <= word_count < 300 or 1000 < word_count <= 1200:
        score = 5
        if word_count < 300:
            feedback.append(f"Resume is too short ({word_count} words). Add more detail to your experience.")
        else:
            feedback.append(f"Resume is too long ({word_count} words). Condense to 1–2 pages.")
    else:
        score = 2
        if word_count < 200:
            feedback.append(f"Resume is very short ({word_count} words). Significantly expand your content.")
        else:
            feedback.append(f"Resume is very long ({word_count} words). Reduce to 1–2 pages maximum.")

    return score, feedback


def score_keywords_density(text: str) -> Tuple[int, List[str]]:
    """Overlap with built-in actuarial/professional keyword list. Max 20 pts."""
    text_lower = text.lower()
    matched = [kw for kw in ACTUARIAL_KEYWORDS if kw in text_lower]
    ratio = len(matched) / len(ACTUARIAL_KEYWORDS)
    feedback = []

    if ratio >= 0.35:
        score = 20
    elif ratio >= 0.25:
        score = 15
    elif ratio >= 0.15:
        score = 10
        feedback.append("Low keyword density — include more industry-relevant keywords.")
    elif ratio >= 0.08:
        score = 5
        feedback.append("Very low keyword density — add technical skills and industry terms.")
    else:
        score = 0
        feedback.append("Almost no industry keywords detected — significantly improve keyword coverage.")

    return score, feedback


def score_formatting(text: str) -> Tuple[int, List[str]]:
    """Check for excessive caps and reasonable line lengths. Max 15 pts."""
    lines = [l for l in text.split("\n") if l.strip()]
    feedback = []
    deductions = 0

    # Check for excessive all-caps lines
    caps_lines = [l for l in lines if l.isupper() and len(l) > 15]
    if len(caps_lines) > 5:
        deductions += 5
        feedback.append("Too many all-caps lines — use normal title case for headings.")

    # Check for extremely long lines
    long_lines = [l for l in lines if len(l) > 200]
    if len(long_lines) > 3:
        deductions += 5
        feedback.append("Some lines are very long — break up dense paragraphs.")

    # Check for very short lines (possible OCR or formatting issues)
    very_short = [l for l in lines if len(l.strip()) <= 2]
    if len(very_short) > 10:
        deductions += 5
        feedback.append("Possible formatting issues — check for stray characters or OCR artifacts.")

    score = max(0, 15 - deductions)
    return score, feedback


def calculate_ats_score(resume: Dict) -> Dict:
    """
    Rule-based ATS scoring. Returns score, breakdown, and feedback list.
    """
    raw_text = resume["raw_text"]
    word_count = resume["word_count"]

    c_score, c_fb = score_contact_info(raw_text)
    s_score, s_fb = score_sections(raw_text)
    b_score, b_fb = score_bullet_points(raw_text)
    l_score, l_fb = score_length(word_count)
    k_score, k_fb = score_keywords_density(raw_text)
    f_score, f_fb = score_formatting(raw_text)

    total = c_score + s_score + b_score + l_score + k_score + f_score
    feedback = c_fb + s_fb + b_fb + l_fb + k_fb + f_fb

    if not feedback:
        feedback.append("Great job! Your resume covers all the key ATS requirements.")

    return {
        "score": total,
        "breakdown": {
            "contact_info": c_score,
            "sections": s_score,
            "bullet_points": b_score,
            "length": l_score,
            "keywords_density": k_score,
            "formatting": f_score,
        },
        "feedback": feedback,
    }


# ---------------------------------------------------------------------------
# Job Matching (TF-IDF cosine similarity)
# ---------------------------------------------------------------------------

def load_jobs() -> List[Dict]:
    """Load jobs from jobs.json and actuarial_jobs.json."""
    jobs = []
    for path in ["/app/jobs.json", "/app/actuarial_jobs.json"]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        jobs.extend(data)
                    elif isinstance(data, dict) and "jobs" in data:
                        jobs.extend(data["jobs"])
            except Exception:
                pass
    return jobs


def _get_job_description(job: Dict) -> str:
    """Extract a usable description string from a job dict."""
    parts = []
    for field in ("description", "title", "company", "skills", "qualifications", "requirements"):
        val = job.get(field, "")
        if isinstance(val, list):
            parts.append(" ".join(str(v) for v in val))
        elif isinstance(val, str):
            parts.append(val)
    return " ".join(parts)


def match_against_jobs(resume_text: str, jobs: List[Dict], top_n: int = 5) -> List[Dict]:
    """TF-IDF cosine similarity matching against job descriptions."""
    if not jobs:
        return []

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        import numpy as np

        corpus = [_get_job_description(j) for j in jobs]
        corpus_with_resume = corpus + [resume_text]

        vectorizer = TfidfVectorizer(
            max_features=5000,
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
        )
        tfidf_matrix = vectorizer.fit_transform(corpus_with_resume)

        # Resume vector is the last row
        resume_vec = tfidf_matrix[-1]
        job_vecs = tfidf_matrix[:-1]

        # Cosine similarity
        norms = np.array(job_vecs.multiply(job_vecs).sum(axis=1)).flatten()
        resume_norm = float(resume_vec.multiply(resume_vec).sum())
        dot_products = np.array(job_vecs.dot(resume_vec.T).todense()).flatten()

        scores = []
        for i, (dot, norm) in enumerate(zip(dot_products, norms)):
            denom = math.sqrt(norm) * math.sqrt(resume_norm)
            cosine_sim = float(dot) / denom if denom > 0 else 0.0
            scores.append((i, cosine_sim))

        scores.sort(key=lambda x: x[1], reverse=True)
        top_matches = scores[:top_n]

        # Get feature names for keyword extraction
        feature_names = vectorizer.get_feature_names_out()
        resume_arr = resume_vec.toarray().flatten()
        resume_keywords = set(
            feature_names[i] for i in resume_arr.argsort()[-50:][::-1] if resume_arr[i] > 0
        )

        results = []
        for idx, sim in top_matches:
            job = jobs[idx]
            job_desc = corpus[idx]
            job_tokens = set(re.findall(r"\b\w{4,}\b", job_desc.lower()))
            missing = sorted(list(job_tokens - resume_keywords))[:10]

            results.append({
                "job_title": job.get("title", "Unknown Title"),
                "company": job.get("company", "Unknown Company"),
                "location": job.get("location", ""),
                "match_score": round(sim * 100, 1),
                "missing_keywords": missing,
                "apply_url": job.get("url", job.get("apply_url", job.get("link", ""))),
            })

        return results

    except ImportError:
        return []
    except Exception:
        return []


# ---------------------------------------------------------------------------
# LLM Improvements (OpenAI)
# ---------------------------------------------------------------------------

def generate_improvements(resume: Dict, top_job: Optional[Dict]) -> Dict:
    """Use OpenAI to generate resume improvements. Degrades gracefully without API key."""
    empty_result = {
        "missing_keywords": [],
        "weak_bullets": [],
        "summary_rewrite": "",
        "formatting_tips": [],
        "note": "",
    }

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        empty_result["note"] = "LLM improvements unavailable: OPENAI_API_KEY not set."
        return empty_result

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)

        job_context = ""
        if top_job:
            job_context = (
                f"Top matched job: {top_job.get('job_title', '')} at {top_job.get('company', '')}.\n"
                f"Missing keywords for this job: {', '.join(top_job.get('missing_keywords', []))}."
            )

        resume_snippet = resume["raw_text"][:3000]  # limit tokens

        prompt = f"""You are a professional resume coach specializing in actuarial and finance careers.

Analyze the following resume and provide improvement suggestions in JSON format.

RESUME:
{resume_snippet}

{job_context}

Respond ONLY with valid JSON matching this exact structure:
{{
  "missing_keywords": ["keyword1", "keyword2"],
  "weak_bullets": [
    {{"original": "original bullet text", "improved": "improved bullet text"}}
  ],
  "summary_rewrite": "Rewritten professional summary",
  "formatting_tips": ["tip1", "tip2"]
}}

Focus on:
1. missing_keywords: 5-10 important keywords missing from the resume
2. weak_bullets: up to 5 weak bullet points with improved versions using action verbs and quantified achievements
3. summary_rewrite: A compelling 2-3 sentence professional summary
4. formatting_tips: 3-5 practical formatting improvements
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1200,
        )

        content = response.choices[0].message.content or ""
        # Extract JSON from response
        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            # Ensure all fields exist
            for key in empty_result:
                if key not in result:
                    result[key] = empty_result[key]
            return result
        else:
            empty_result["note"] = "LLM returned non-JSON response."
            return empty_result

    except Exception as e:
        empty_result["note"] = f"LLM improvement generation failed: {str(e)}"
        return empty_result


# ---------------------------------------------------------------------------
# Flask Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "resume-api",
    })


@app.route("/api/resume/analyze", methods=["POST"])
def analyze_resume():
    """
    Main analysis endpoint.
    Accepts JSON body: { resume_url, email, file_name }
    Downloads the resume from the URL, parses it, runs ATS + job match + LLM.
    """
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No JSON body provided"}), 400

    resume_url = data.get("resume_url", "")
    file_name = data.get("file_name", "resume.pdf")

    if not resume_url:
        return jsonify({"success": False, "error": "resume_url is required"}), 400

    # Download the resume file
    try:
        resp = requests.get(resume_url, timeout=30)
        resp.raise_for_status()
        file_bytes = resp.content
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to download resume: {str(e)}"}), 400

    # Parse resume
    try:
        resume = parse_resume(file_bytes, file_name)
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to parse resume: {str(e)}"}), 422

    # ATS Score
    ats_result = calculate_ats_score(resume)

    # Job Matching
    jobs = load_jobs()
    job_matches = match_against_jobs(resume["raw_text"], jobs)

    # LLM Improvements
    top_job = job_matches[0] if job_matches else None
    improvements = generate_improvements(resume, top_job)

    # Overall match score (average of top 3 if available)
    overall_match = 0.0
    if job_matches:
        top_scores = [m["match_score"] for m in job_matches[:3]]
        overall_match = round(sum(top_scores) / len(top_scores), 1)

    return jsonify({
        "success": True,
        "ats": ats_result,
        "job_matches": job_matches,
        "improvements": improvements,
        "word_count": resume["word_count"],
        "overall_match_score": overall_match,
    })


if __name__ == "__main__":
    port = int(os.environ.get("RESUME_API_PORT", os.environ.get("FLASK_PORT", 5001)))
    debug = os.environ.get("FLASK_ENV", "production") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
