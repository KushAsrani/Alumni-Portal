import json
import os
import re
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, jsonify, request
from pymongo import MongoClient


ai_alumni_bp = Blueprint("ai_alumni", __name__)

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is not None:
        return _db

    mongo_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    _client = MongoClient(mongo_uri)
    _db = _client["alumni_portal"]
    return _db


def alumni_collection():
    return get_db()["alumni_registrations"]


def to_string_array(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join([str(item).strip() for item in value if str(item).strip()])
    return str(value).strip()


def generate_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9\s-]", "", (name or "").lower()).strip()
    return re.sub(r"\s+", "-", slug)


def get_openai_client():
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    from openai import OpenAI

    return OpenAI(api_key=api_key)


def parse_json_response(content: str) -> Optional[Dict[str, Any]]:
    if not content:
        return None

    try:
        loaded = json.loads(content)
        return loaded if isinstance(loaded, dict) else None
    except Exception:
        pass

    match = re.search(r"\{.*\}", content, flags=re.DOTALL)
    if not match:
        return None

    try:
        loaded = json.loads(match.group(0))
        return loaded if isinstance(loaded, dict) else None
    except Exception:
        return None


def openai_json_call(system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens: int = 600) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    try:
        client = get_openai_client()
        if client is None:
            return None, "OPENAI_API_KEY not set"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        parsed = parse_json_response(content)
        if parsed is None:
            return None, "Model returned invalid JSON"
        return parsed, None
    except Exception:
        return None, "OpenAI request failed"


def profile_text(record: Dict[str, Any]) -> str:
    skills = " ".join(to_string_array(record.get("skills")))
    return " ".join(
        [
            skills,
            to_text(record.get("short_bio")),
            to_text(record.get("faculty")),
            to_text(record.get("company")),
            to_text(record.get("location")),
        ]
    ).strip()


def fallback_bio_classification(short_bio: str) -> Tuple[str, List[str], float]:
    text = (short_bio or "").lower()

    category_keywords = {
        "Passionate about Technology": ["software", "engineering", "tech", "developer", "ai", "machine learning", "data"],
        "Leadership & Management": ["leader", "management", "manager", "strategy", "team"],
        "Research & Academia": ["research", "academia", "professor", "phd", "publication"],
        "Entrepreneurship": ["startup", "entrepreneur", "founder", "venture"],
        "Finance & Actuarial": ["finance", "actuarial", "risk", "insurance", "investment"],
        "Social Impact": ["ngo", "social", "community", "impact", "sustainability"],
    }

    best_category = "General Professional"
    best_score = 0
    for category, words in category_keywords.items():
        score = sum(1 for keyword in words if keyword in text)
        if score > best_score:
            best_score = score
            best_category = category

    tokens = re.findall(r"[a-zA-Z]{4,}", text)
    token_counts = Counter(tokens)
    stop_words = {
        "about",
        "with",
        "from",
        "that",
        "this",
        "have",
        "been",
        "their",
        "they",
        "into",
        "across",
        "years",
        "experience",
        "professional",
    }
    keywords = [token for token, _ in token_counts.most_common(6) if token not in stop_words][:3]

    confidence = 0.85 if best_score > 0 else 0.6
    return best_category, keywords, confidence


@ai_alumni_bp.route("/api/ai/similar-alumni", methods=["POST"])
def similar_alumni():
    try:
        data = request.get_json(silent=True) or {}
        alumni_id = (data.get("alumni_id") or "").strip()
        if not alumni_id:
            return jsonify({"success": False, "message": "alumni_id is required"}), 400

        try:
            object_id = ObjectId(alumni_id)
        except (InvalidId, Exception):
            return jsonify({"success": False, "message": "Invalid alumni_id"}), 400

        collection = alumni_collection()
        target = collection.find_one({"_id": object_id})
        if not target:
            return jsonify({"success": False, "message": "Alumni not found"}), 404

        target_text = profile_text(target)
        if not target_text.strip() or (not to_string_array(target.get("skills")) and not to_text(target.get("short_bio"))):
            return jsonify({"alumni": [], "message": "Insufficient profile data"}), 200

        candidates = list(
            collection.find(
                {
                    "status": "approved",
                    "_id": {"$ne": object_id},
                }
            )
        )

        valid_candidates = []
        candidate_texts = []
        for candidate in candidates:
            combined = profile_text(candidate)
            if combined.strip():
                valid_candidates.append(candidate)
                candidate_texts.append(combined)

        if not valid_candidates:
            return jsonify({"alumni": []}), 200

        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer = TfidfVectorizer(stop_words="english")
        matrix = vectorizer.fit_transform([target_text] + candidate_texts)
        scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()

        ranked = sorted(enumerate(scores), key=lambda item: item[1], reverse=True)[:5]

        result = []
        for idx, score in ranked:
            alum = valid_candidates[idx]
            result.append(
                {
                    "_id": str(alum.get("_id", "")),
                    "name": alum.get("name", ""),
                    "slug": alum.get("slug") or generate_slug(alum.get("name", "")),
                    "faculty": alum.get("faculty"),
                    "year": alum.get("year"),
                    "skills": to_string_array(alum.get("skills")),
                    "company": alum.get("company"),
                    "photo_blob_url": alum.get("photo_blob_url"),
                    "similarity_score": round(float(score), 4),
                }
            )

        return jsonify({"alumni": result}), 200
    except Exception:
        return jsonify({"success": False, "message": "Failed to fetch similar alumni"}), 500


@ai_alumni_bp.route("/api/ai/nl-search", methods=["POST"])
def nl_search():
    try:
        payload = request.get_json(silent=True) or {}
        query = (payload.get("query") or "").strip()
        if not query:
            return jsonify({"success": False, "message": "query is required"}), 400

        if not os.environ.get("OPENAI_API_KEY"):
            return jsonify({"success": False, "message": "NL search requires OPENAI_API_KEY"}), 200

        system_prompt = (
            "You are a search query parser for an alumni directory. "
            "Extract structured filters from the user's natural language query. "
            "Return ONLY valid JSON with keys: q (keyword string), faculty (array), skills (array), "
            "location (array), company (array), year (array). Use empty arrays if not mentioned."
        )
        user_prompt = f"User query: {query}"

        parsed, error = openai_json_call(system_prompt, user_prompt, temperature=0.0, max_tokens=400)
        if error or parsed is None:
            return jsonify({"success": False, "message": "Failed to parse NL search query"}), 500

        filters = {
            "q": str(parsed.get("q") or "").strip(),
            "faculty": [str(v).strip() for v in (parsed.get("faculty") or []) if str(v).strip()],
            "skills": [str(v).strip() for v in (parsed.get("skills") or []) if str(v).strip()],
            "location": [str(v).strip() for v in (parsed.get("location") or []) if str(v).strip()],
            "company": [str(v).strip() for v in (parsed.get("company") or []) if str(v).strip()],
            "year": [str(v).strip() for v in (parsed.get("year") or []) if str(v).strip()],
        }

        return jsonify({"success": True, "filters": filters}), 200
    except Exception:
        return jsonify({"success": False, "message": "Failed to parse natural language query"}), 500


@ai_alumni_bp.route("/api/ai/enrich-profile", methods=["POST"])
def enrich_profile():
    try:
        payload = request.get_json(silent=True) or {}
        alumni_id = (payload.get("alumni_id") or "").strip()
        admin_key = (payload.get("admin_key") or "").strip()

        expected_admin_key = (os.environ.get("ADMIN_API_KEY") or "").strip()
        if not expected_admin_key or admin_key != expected_admin_key:
            return jsonify({"success": False, "message": "Unauthorized"}), 401

        if not alumni_id:
            return jsonify({"success": False, "message": "alumni_id is required"}), 400

        try:
            object_id = ObjectId(alumni_id)
        except (InvalidId, Exception):
            return jsonify({"success": False, "message": "Invalid alumni_id"}), 400

        collection = alumni_collection()
        alumni = collection.find_one({"_id": object_id})
        if not alumni:
            return jsonify({"success": False, "message": "Alumni not found"}), 404

        if not os.environ.get("OPENAI_API_KEY"):
            return jsonify({"success": False, "message": "Profile enrichment requires OPENAI_API_KEY"}), 200

        system_prompt = (
            "You enrich alumni profiles. "
            "Return JSON with keys suggested_skills (array of max 10 concise skill tags) and enriched_bio "
            "(2-3 sentence professional summary)."
        )
        user_prompt = (
            "Alumni profile:\n"
            f"Company: {to_text(alumni.get('company'))}\n"
            f"Designation: {to_text(alumni.get('job_designation'))}\n"
            f"Work Experience: {to_text(alumni.get('work_experience'))}\n"
            f"Short Bio: {to_text(alumni.get('short_bio'))}\n"
        )

        parsed, error = openai_json_call(system_prompt, user_prompt, temperature=0.3, max_tokens=500)
        if error or parsed is None:
            return jsonify({"success": False, "message": "Failed to enrich profile"}), 500

        suggested_skills = []
        for item in parsed.get("suggested_skills") or []:
            skill = str(item).strip()
            if skill and skill not in suggested_skills:
                suggested_skills.append(skill)
            if len(suggested_skills) >= 10:
                break

        enriched_bio = str(parsed.get("enriched_bio") or "").strip() or to_text(alumni.get("short_bio"))

        collection.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "ai_suggested_skills": suggested_skills,
                    "ai_enriched_bio": enriched_bio,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

        return jsonify({"success": True, "suggested_skills": suggested_skills, "enriched_bio": enriched_bio}), 200
    except Exception:
        return jsonify({"success": False, "message": "Failed to enrich profile"}), 500


def mentorship_reason(goals: str, skills_wanted: List[str], mentor: Dict[str, Any]) -> Optional[str]:
    if not os.environ.get("OPENAI_API_KEY"):
        return None

    system_prompt = "You explain alumni mentorship matches in one concise sentence. Return JSON: {\"reason\": \"...\"}."
    user_prompt = (
        f"Mentee goals: {goals}\n"
        f"Skills wanted: {', '.join(skills_wanted)}\n"
        f"Mentor profile: {to_text(mentor.get('short_bio'))} | {to_text(mentor.get('work_experience'))} | Skills: {', '.join(to_string_array(mentor.get('skills')))}"
    )

    parsed, _ = openai_json_call(system_prompt, user_prompt, temperature=0.2, max_tokens=120)
    if parsed and parsed.get("reason"):
        return str(parsed.get("reason")).strip()
    return None


@ai_alumni_bp.route("/api/ai/mentorship-match", methods=["POST"])
def mentorship_match():
    try:
        payload = request.get_json(silent=True) or {}
        goals = (payload.get("goals") or "").strip()
        skills_wanted = to_string_array(payload.get("skills_wanted"))
        faculty = (payload.get("faculty") or "").strip()

        query_text = " ".join([goals, " ".join(skills_wanted)]).strip()
        if not query_text:
            return jsonify({"success": False, "message": "goals or skills_wanted is required"}), 400

        collection = alumni_collection()
        mentors = list(collection.find({"status": "approved", "open_to_mentorship": True}))
        if not mentors:
            return jsonify({"mentors": []}), 200

        mentor_texts = []
        valid_mentors = []
        for mentor in mentors:
            combined = " ".join(
                [
                    " ".join(to_string_array(mentor.get("skills"))),
                    to_text(mentor.get("short_bio")),
                    to_text(mentor.get("work_experience")),
                ]
            ).strip()
            if combined:
                mentor_texts.append(combined)
                valid_mentors.append(mentor)

        if not valid_mentors:
            return jsonify({"mentors": []}), 200

        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer = TfidfVectorizer(stop_words="english")
        matrix = vectorizer.fit_transform([query_text] + mentor_texts)
        scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()

        ranked = sorted(enumerate(scores), key=lambda item: item[1], reverse=True)[:5]

        response_mentors = []
        for idx, score in ranked:
            mentor = valid_mentors[idx]
            adjusted_score = float(score)
            if faculty and str(mentor.get("faculty") or "").strip().lower() == faculty.lower():
                adjusted_score = min(1.0, adjusted_score + 0.05)

            result = {
                "_id": str(mentor.get("_id", "")),
                "name": mentor.get("name", ""),
                "slug": mentor.get("slug") or generate_slug(mentor.get("name", "")),
                "faculty": mentor.get("faculty"),
                "year": mentor.get("year"),
                "skills": to_string_array(mentor.get("skills")),
                "company": mentor.get("company"),
                "job_designation": mentor.get("job_designation"),
                "photo_blob_url": mentor.get("photo_blob_url"),
                "email": mentor.get("email"),
                "match_score": round(adjusted_score * 100, 1),
            }

            reason = mentorship_reason(goals, skills_wanted, mentor)
            if reason:
                result["match_reason"] = reason

            response_mentors.append(result)

        return jsonify({"mentors": response_mentors}), 200
    except Exception:
        return jsonify({"success": False, "message": "Failed to match mentors"}), 500


@ai_alumni_bp.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    try:
        payload = request.get_json(silent=True) or {}
        message = (payload.get("message") or "").strip()
        conversation_history = payload.get("conversation_history") or []

        if not message:
            return jsonify({"success": False, "message": "message is required"}), 400

        if not os.environ.get("OPENAI_API_KEY"):
            return jsonify({"success": False, "message": "Chatbot requires AI configuration"}), 200

        collection = alumni_collection()
        approved_query = {"status": "approved"}
        total_alumni = collection.count_documents(approved_query)

        skill_counter = Counter()
        for record in collection.find(approved_query, {"skills": 1}).limit(1000):
            for skill in to_string_array(record.get("skills")):
                skill_counter[skill] += 1

        top_skills = [skill for skill, _ in skill_counter.most_common(5)]

        company_pipeline = [
            {"$match": {"status": "approved", "company": {"$type": "string", "$ne": ""}}},
            {"$group": {"_id": "$company", "count": {"$sum": 1}}},
            {"$sort": {"count": -1, "_id": 1}},
            {"$limit": 5},
        ]
        top_companies = [row["_id"] for row in collection.aggregate(company_pipeline)]
        faculties = sorted([value for value in collection.distinct("faculty", approved_query) if isinstance(value, str) and value.strip()])

        context_stats = {
            "total_alumni": total_alumni,
            "top_skills": top_skills,
            "top_companies": top_companies,
            "faculties": faculties,
        }

        client = get_openai_client()
        if client is None:
            return jsonify({"success": False, "message": "Chatbot requires AI configuration"}), 200

        system_prompt = (
            "You are an alumni directory assistant. "
            f"You have access to the following alumni data: {json.dumps(context_stats)}. "
            "Answer questions about alumni. For specific alumni details, tell users to use the search feature. Keep responses concise."
        )

        messages = [{"role": "system", "content": system_prompt}]
        for item in conversation_history[-10:]:
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and isinstance(content, str):
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message})

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.4,
            max_tokens=350,
        )

        answer = response.choices[0].message.content or ""
        suggestions = []

        return jsonify({"success": True, "response": answer.strip(), "suggestions": suggestions}), 200
    except Exception:
        return jsonify({"success": False, "message": "Failed to generate chat response"}), 500


def default_profile_suggestion(field: str) -> str:
    mapping = {
        "photo_blob_url": "Upload a profile photo to increase trust and visibility.",
        "linkedin": "Add your LinkedIn URL for better visibility.",
        "github": "Add your GitHub profile to showcase technical work.",
        "short_bio": "Write a concise short bio to help others understand your background.",
        "skills": "List your top skills so peers can discover your expertise.",
        "work_experience": "Add your work experience to improve profile credibility.",
        "company": "Include your current company to help with networking.",
        "location": "Add your location so alumni nearby can connect.",
        "faculty": "Add your faculty/department for better discoverability.",
        "year": "Add your graduation year to appear in year-based searches.",
    }
    return mapping.get(field, f"Complete your {field.replace('_', ' ')} field.")


@ai_alumni_bp.route("/api/ai/profile-completeness", methods=["POST"])
def profile_completeness():
    try:
        payload = request.get_json(silent=True) or {}
        alumni_id = (payload.get("alumni_id") or "").strip()
        if not alumni_id:
            return jsonify({"success": False, "message": "alumni_id is required"}), 400

        try:
            object_id = ObjectId(alumni_id)
        except (InvalidId, Exception):
            return jsonify({"success": False, "message": "Invalid alumni_id"}), 400

        collection = alumni_collection()
        alumni = collection.find_one({"_id": object_id})
        if not alumni:
            return jsonify({"success": False, "message": "Alumni not found"}), 404

        weights = {
            "name": 5,
            "email": 5,
            "photo_blob_url": 10,
            "short_bio": 10,
            "skills": 15,
            "work_experience": 15,
            "linkedin": 10,
            "company": 10,
            "location": 5,
            "faculty": 5,
            "year": 5,
            "github": 5,
        }

        score = 0.0
        missing_fields = []
        for field, weight in weights.items():
            value = alumni.get(field)
            is_present = False
            if field == "skills":
                is_present = len(to_string_array(value)) > 0
            elif field == "year":
                is_present = value is not None and str(value).strip() != ""
            else:
                is_present = bool(to_text(value))

            if is_present:
                score += weight
            else:
                missing_fields.append(field)

        suggestions = [default_profile_suggestion(field) for field in missing_fields][:5]

        if os.environ.get("OPENAI_API_KEY") and missing_fields:
            prompt = (
                "Generate concise actionable suggestions for improving an alumni profile completeness score. "
                "Return JSON with key suggestions as an array of strings."
            )
            context = (
                f"Missing fields: {missing_fields}. "
                f"Current profile: name={to_text(alumni.get('name'))}, faculty={to_text(alumni.get('faculty'))}, company={to_text(alumni.get('company'))}"
            )
            parsed, _ = openai_json_call(prompt, context, temperature=0.2, max_tokens=200)
            if parsed and isinstance(parsed.get("suggestions"), list):
                generated = [str(item).strip() for item in parsed.get("suggestions") if str(item).strip()]
                if generated:
                    suggestions = generated[:5]

        mapped_missing = ["photo" if field == "photo_blob_url" else field for field in missing_fields]

        return jsonify(
            {
                "score": int(round(score)),
                "missing_fields": mapped_missing,
                "suggestions": suggestions,
            }
        ), 200
    except Exception:
        return jsonify({"success": False, "message": "Failed to calculate profile completeness"}), 500


@ai_alumni_bp.route("/api/ai/analyze-bio", methods=["POST"])
def analyze_bio():
    try:
        payload = request.get_json(silent=True) or {}
        alumni_id = (payload.get("alumni_id") or "").strip()
        if not alumni_id:
            return jsonify({"success": False, "message": "alumni_id is required"}), 400

        try:
            object_id = ObjectId(alumni_id)
        except (InvalidId, Exception):
            return jsonify({"success": False, "message": "Invalid alumni_id"}), 400

        collection = alumni_collection()
        alumni = collection.find_one({"_id": object_id}, {"short_bio": 1})
        if not alumni:
            return jsonify({"success": False, "message": "Alumni not found"}), 404

        short_bio = to_text(alumni.get("short_bio"))
        if not short_bio:
            return jsonify({"success": False, "message": "short_bio is empty"}), 400

        categories = [
            "Passionate about Technology",
            "Leadership & Management",
            "Research & Academia",
            "Entrepreneurship",
            "Finance & Actuarial",
            "Social Impact",
            "General Professional",
        ]

        category = "General Professional"
        keywords: List[str] = []
        confidence = 0.6

        if os.environ.get("OPENAI_API_KEY"):
            system_prompt = (
                "Classify alumni bio tone. Return JSON with keys: category, keywords, confidence. "
                f"category must be one of: {categories}. keywords must contain 2-3 words. confidence 0-1."
            )
            user_prompt = f"Bio: {short_bio}"
            parsed, _ = openai_json_call(system_prompt, user_prompt, temperature=0.2, max_tokens=250)
            if parsed:
                parsed_category = str(parsed.get("category") or "").strip()
                if parsed_category in categories:
                    category = parsed_category
                parsed_keywords = [str(item).strip() for item in (parsed.get("keywords") or []) if str(item).strip()]
                keywords = parsed_keywords[:3]
                parsed_conf = parsed.get("confidence")
                try:
                    confidence = float(parsed_conf)
                except Exception:
                    confidence = 0.8

        if not keywords:
            category, keywords, confidence = fallback_bio_classification(short_bio)

        collection.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "bio_category": category,
                    "bio_keywords": keywords,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

        return jsonify({"category": category, "keywords": keywords, "confidence": round(float(confidence), 2)}), 200
    except Exception:
        return jsonify({"success": False, "message": "Failed to analyze bio"}), 500
