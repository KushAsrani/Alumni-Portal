import argparse
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

from pymongo import MongoClient


def to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join([str(item).strip() for item in value if str(item).strip()])
    return str(value).strip()


def get_collection():
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    client = MongoClient(uri)
    db = client["alumni_portal"]
    return db["alumni_registrations"]


def suggest_skills_with_openai(work_experience: str, short_bio: str) -> Optional[List[str]]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    prompt = (
        "Extract up to 10 concise professional skill tags from the profile details. "
        "Return JSON with key suggested_skills as an array.\n\n"
        f"Work Experience: {work_experience}\n"
        f"Short Bio: {short_bio}"
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You generate structured skill tags for alumni profiles."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=250,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content or "{}"
    import json

    parsed = json.loads(content)
    skills = []
    for item in parsed.get("suggested_skills") or []:
        skill = str(item).strip()
        if skill and skill not in skills:
            skills.append(skill)
        if len(skills) >= 10:
            break
    return skills


def main():
    parser = argparse.ArgumentParser(description="Batch enrich alumni with AI skill tags")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to MongoDB")
    parser.add_argument("--limit", type=int, default=0, help="Process only N alumni")
    args = parser.parse_args()

    collection = get_collection()

    query: Dict[str, Any] = {
        "status": "approved",
        "$or": [
            {"ai_suggested_skills": {"$exists": False}},
            {"ai_suggested_skills": []},
        ],
    }

    cursor = collection.find(query)
    if args.limit and args.limit > 0:
        cursor = cursor.limit(args.limit)

    records = list(cursor)
    total = len(records)
    if total == 0:
        print("No alumni records require enrichment.")
        return

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("OPENAI_API_KEY is not set. Cannot run batch enrichment.")
        sys.exit(1)

    enriched = 0
    skipped = 0

    for index, alum in enumerate(records, start=1):
        try:
            work_experience = to_text(alum.get("work_experience"))
            short_bio = to_text(alum.get("short_bio"))
            if not work_experience and not short_bio:
                skipped += 1
                print(f"Skipped {index}/{total} alumni (insufficient text)...")
                continue

            suggested_skills = suggest_skills_with_openai(work_experience, short_bio) or []

            if args.dry_run:
                print(f"[DRY RUN] {alum.get('name', 'Unknown')} -> {suggested_skills}")
            else:
                collection.update_one(
                    {"_id": alum.get("_id")},
                    {
                        "$set": {
                            "ai_suggested_skills": suggested_skills,
                            "updated_at": datetime.utcnow(),
                        }
                    },
                )

            enriched += 1
            print(f"Enriched {index}/{total} alumni...")
        except Exception as exc:
            skipped += 1
            print(f"Failed {index}/{total} for {alum.get('name', 'Unknown')}: {exc}")

    print(f"Done. Enriched: {enriched}, Skipped/Failed: {skipped}, Total: {total}")


if __name__ == "__main__":
    main()
