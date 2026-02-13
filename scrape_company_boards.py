#!/usr/bin/env python3
import argparse
import json
import os
import re
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any, Tuple
from urllib.parse import urlparse

import requests

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

@dataclass
class Salary:
    min: Optional[int] = None
    max: Optional[int] = None
    currency: str = "USD"

@dataclass
class Job:
    id: str
    title: str
    company: str
    location: str
    description: str
    salary: Optional[Salary]
    job_type: Optional[str]
    experience_level: Optional[str]
    skills: List[str]
    certifications: List[str]
    posted_date: Optional[str]  # ISO
    url: str            # detail page
    apply_url: Optional[str]    # direct apply link
    source: str
    featured: bool = False

def normalize(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()

def gen_id(title: str, company: str, location: str, url: str) -> str:
    seed = f"{title}|{company}|{location}|{url}"
    return re.sub(r"[^a-zA-Z0-9]", "", seed)[:64]

def matches_filters(job: Job, keywords: List[str], locations: List[str], remote_only: bool) -> bool:
    text = f"{job.title} {job.company} {job.description}".lower()
    if keywords and not any(k.lower() in text for k in keywords):
        return False
    if locations:
        loc = (job.location or "").lower()
        if not any(loc_sub.lower() in loc for loc_sub in locations):
            return False
    if remote_only and "remote" not in (job.location or "").lower():
        return False
    return True

# -------- Token autodetection --------
def extract_greenhouse_token(entry: str) -> Optional[str]:
    # Accept either token or full URL like https://boards.greenhouse.io/lemonade
    if "boards.greenhouse.io" in entry:
        parsed = urlparse(entry)
        path = parsed.path.strip("/").split("/")
        if len(path) >= 1:
            return path[-1]  # token
        return None
    # If entry looks like a token (letters, hyphens), assume token
    if re.fullmatch(r"[a-z0-9-]+", entry):
        return entry
    return None

def extract_lever_token(entry: str) -> Optional[str]:
    # Accept either token or full URL like https://jobs.lever.co/oscar
    if "jobs.lever.co" in entry:
        parsed = urlparse(entry)
        path = parsed.path.strip("/").split("/")
        if len(path) >= 1:
            return path[0]  # company token
        return None
    # token fallback
    if re.fullmatch(r"[a-z0-9-]+", entry):
        return entry
    return None

# -------- Scrapers --------
def scrape_greenhouse_board(token: str, keywords: List[str], locations: List[str], remote_only: bool) -> List[Job]:
    # Docs: https://developers.greenhouse.io/board
    # GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs
    base = f"https://boards-api.greenhouse.io/v1/boards/{token}"
    jobs_url = f"{base}/jobs"
    r = requests.get(jobs_url, headers=DEFAULT_HEADERS, timeout=20)
    if r.status_code == 404:
        raise RuntimeError(f"Greenhouse board token '{token}' not found")
    r.raise_for_status()
    data = r.json()
    jobs: List[Job] = []
    for item in data.get("jobs", []):
        title = normalize(item.get("title"))
        absolute_url = item.get("absolute_url") or ""
        location_obj = item.get("location") or {}
        location = normalize(location_obj.get("name"))
        company = token  # Board token typically the company slug
        description = normalize(item.get("content"))
        apply_url = absolute_url or ""

        job = Job(
            id=gen_id(title, company, location, absolute_url),
            title=title,
            company=company,
            location=location,
            description=description,
            salary=None,
            job_type=None,
            experience_level=None,
            skills=[],
            certifications=[],
            posted_date=None,
            url=absolute_url,
            apply_url=apply_url,
            source=f"Greenhouse:{token}",
            featured=False,
        )
        if title and matches_filters(job, keywords, locations, remote_only):
            jobs.append(job)
    return jobs

def scrape_lever_board(token: str, keywords: List[str], locations: List[str], remote_only: bool) -> List[Job]:
    # Docs: https://github.com/lever/postings-api
    # GET https://api.lever.co/v0/postings/{token}?mode=json
    url = f"https://api.lever.co/v0/postings/{token}?mode=json"
    r = requests.get(url, headers=DEFAULT_HEADERS, timeout=20)
    if r.status_code == 404:
        raise RuntimeError(f"Lever postings token '{token}' not found")
    r.raise_for_status()
    data = r.json()
    jobs: List[Job] = []
    for item in data:
        title = normalize(item.get("text"))
        description = normalize(item.get("description"))
        categories = item.get("categories") or {}
        location = normalize(categories.get("location") or item.get("location") or "")
        company = token
        url_detail = item.get("hostedUrl") or item.get("applyUrl") or ""
        apply_url = item.get("applyUrl") or url_detail

        job = Job(
            id=gen_id(title, company, location, url_detail),
            title=title,
            company=company,
            location=location,
            description=description,
            salary=None,
            job_type=None,
            experience_level=None,
            skills=[],
            certifications=[],
            posted_date=None,
            url=url_detail,
            apply_url=apply_url,
            source=f"Lever:{token}",
            featured=False,
        )
        if title and matches_filters(job, keywords, locations, remote_only):
            jobs.append(job)
    return jobs

def scrape_workday_endpoint(endpoint_url: str, keywords: List[str], locations: List[str], remote_only: bool, limit: int = 50, pages: int = 2) -> List[Job]:
    """
    Workday 'cxs' JSON endpoint scraper.
    endpoint_url example:
      https://wtw.wd1.myworkdayjobs.com/wday/cxs/wtw/WTW_Careers/jobs
      https://mercer.wd3.myworkdayjobs.com/wday/cxs/mercer/Mercer_Careers/jobs
    We POST JSON payload with limit/offset and optional searchText.
    """
    jobs: List[Job] = []
    company = urlparse(endpoint_url).hostname or "workday"
    for page in range(pages):
        payload = {
            "limit": limit,
            "offset": page * limit,
            "searchText": " ".join(keywords) if keywords else ""
        }
        r = requests.post(endpoint_url, headers={
            **DEFAULT_HEADERS,
            "Content-Type": "application/json"
        }, json=payload, timeout=20)
        if r.status_code == 404:
            # Endpoint invalid or blocked
            raise RuntimeError(f"Workday endpoint not found: {endpoint_url}")
        r.raise_for_status()
        data = r.json()
        items = data.get("jobPostings", []) or data.get("jobs", [])
        if not items:
            break
        for item in items:
            # Workday fields vary; best-effort mapping
            title = normalize(item.get("title") or item.get("jobPostingInfo", {}).get("title"))
            locs = item.get("locations", []) or item.get("location", []) or item.get("locationList", [])
            location = normalize(", ".join(locs) if isinstance(locs, list) else locs or "")
            # Detail URL might be in externalUrl or 'deepLink'
            url_detail = item.get("externalUrl") or item.get("jobReqUrl") or item.get("deepLink") or ""
            description = normalize(item.get("jobPostingInfo", {}).get("jobDescription") or "")
            apply_url = url_detail

            job = Job(
                id=gen_id(title, company, location, url_detail),
                title=title,
                company=company,
                location=location,
                description=description,
                salary=None,
                job_type=None,
                experience_level=None,
                skills=[],
                certifications=[],
                posted_date=None,
                url=url_detail,
                apply_url=apply_url,
                source=f"Workday:{company}",
                featured=False,
            )
            if title and matches_filters(job, keywords, locations, remote_only):
                jobs.append(job)
    return jobs

# -------- Aggregation & I/O --------
def dedupe(jobs: List[Job]) -> List[Job]:
    seen = set()
    uniq = []
    for j in jobs:
        if j.id in seen:
            continue
        seen.add(j.id)
        uniq.append(j)
    return uniq

def sort_jobs(jobs: List[Job]) -> List[Job]:
    return sorted(jobs, key=lambda j: (j.source, j.company, j.title))

def save_output(jobs: List[Job], out_path: str) -> None:
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    data = [asdict(j) for j in jobs]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Saved {len(jobs)} jobs to {out_path}")

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Scrape company job boards (Greenhouse/Lever/Workday) for actuarial roles.")
    # You can pass tokens OR full board URLs; we'll autodetect
    p.add_argument("--greenhouse", nargs="*", default=[], help="Greenhouse board tokens or URLs (e.g., lemonade or https://boards.greenhouse.io/lemonade)")
    p.add_argument("--lever", nargs="*", default=[], help="Lever company tokens or URLs (e.g., oscar or https://jobs.lever.co/oscar)")
    p.add_argument("--workday-endpoints", nargs="*", default=[], help="Workday cxs jobs endpoints (full URL), e.g., https://wtw.wd1.myworkdayjobs.com/wday/cxs/wtw/WTW_Careers/jobs")
    p.add_argument("--keywords", "-k", nargs="*", default=["actuary", "actuarial"], help="Keywords filter")
    p.add_argument("--locations", "-l", nargs="*", default=[], help="Locations filter (partial matching)")
    p.add_argument("--remote-only", action="store_true", help="Only include remote jobs")
    p.add_argument("--out", "-o", default="public/jobs.json", help="Output JSON path")
    return p.parse_args()

def main():
    args = parse_args()
    all_jobs: List[Job] = []

    # Greenhouse
    for entry in args.greenhouse:
        token = extract_greenhouse_token(entry)
        if not token:
            print(f"Skipping Greenhouse entry (cannot detect token): {entry}")
            continue
        try:
            print(f"Scraping Greenhouse board: {token} ...")
            jobs = scrape_greenhouse_board(token, args.keywords, args.locations, args.remote_only)
            print(f"  Found {len(jobs)} from {token}")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"  Error {token}: {e}")

    # Lever
    for entry in args.lever:
        token = extract_lever_token(entry)
        if not token:
            print(f"Skipping Lever entry (cannot detect token): {entry}")
            continue
        try:
            print(f"Scraping Lever board: {token} ...")
            jobs = scrape_lever_board(token, args.keywords, args.locations, args.remote_only)
            print(f"  Found {len(jobs)} from {token}")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"  Error {token}: {e}")

    # Workday
    for endpoint in args.workday_endpoints:
        try:
            print(f"Scraping Workday endpoint: {endpoint} ...")
            jobs = scrape_workday_endpoint(endpoint, args.keywords, args.locations, args.remote_only)
            print(f"  Found {len(jobs)} from Workday endpoint")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"  Error Workday endpoint: {e}")

    all_jobs = dedupe(all_jobs)
    all_jobs = sort_jobs(all_jobs)
    save_output(all_jobs, args.out)

if __name__ == "__main__":
    main()