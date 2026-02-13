#!/usr/bin/env python3
# scrape_actuarial_jobs.py v6
import argparse
import json
import os
import re
import time
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_random


# -------------------------------
# Debug HTML saving (for selector inspection)
# -------------------------------
DEBUG_DIR = "debug_html"

def save_debug_html(source: str, page_label: str, html: str):
    try:
        os.makedirs(DEBUG_DIR, exist_ok=True)
        path = os.path.join(DEBUG_DIR, f"{source}-{page_label}.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"[debug] saved {path}")
    except Exception:
        pass


# -------------------------------
# Data structures
# -------------------------------
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
    job_type: Optional[str]            # 'full-time' | 'part-time' | 'contract' | 'internship'
    experience_level: Optional[str]    # 'entry' | 'mid' | 'senior' | 'executive'
    skills: List[str]
    certifications: List[str]
    posted_date: Optional[str]         # ISO string, if available
    url: str                           # job detail page
    apply_url: Optional[str]           # direct apply link if available
    source: str
    featured: bool = False


# -------------------------------
# Constants and utilities
# -------------------------------
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

COMMON_SKILLS = ["Excel", "SQL", "Python", "R", "SAS", "Tableau", "Power BI", "VBA"]
CERTS = ["FSA", "ASA", "EA", "MAAA", "CERA", "CAS"]


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def gen_id(title: str, company: str, location: str, url: str) -> str:
    seed = f"{title}|{company}|{location}|{url}"
    return re.sub(r"[^a-zA-Z0-9]", "", seed)[:64]


def parse_salary(text: str) -> Optional[Salary]:
    if not text:
        return None
    m = re.search(r"(\$|USD\s*)?([\d,]+)\s*(?:-|to)\s*(\$|USD\s*)?([\d,]+)", text, re.I)
    if m:
        try:
            mn = int(m.group(2).replace(",", ""))
            mx = int(m.group(4).replace(",", ""))
            return Salary(min=mn, max=mx, currency="USD")
        except Exception:
            return None
    return None


def infer_experience(text: str) -> Optional[str]:
    t = text.lower()
    if any(x in t for x in ["executive", "manager", "lead", "director"]):
        return "executive"
    if "senior" in t or re.search(r"(\b10\+|\b8\+|\b7\+)\s*years", t):
        return "senior"
    if re.search(r"(\b3-5|\b4-6|\b3\+|\b5\+)\s*years", t) or "mid" in t:
        return "mid"
    if "entry" in t or re.search(r"(\b0-2|\b1-2|\b0-1)\s*years", t) or "junior" in t:
        return "entry"
    return None


def extract_skills(text: str) -> List[str]:
    found = set()
    t = text.lower()
    for s in COMMON_SKILLS:
        if s.lower() in t:
            found.add(s)
    return sorted(found)


def extract_certs(text: str) -> List[str]:
    found = set()
    for c in CERTS:
        if re.search(rf"\b{re.escape(c)}\b", text):
            found.add(c)
    return sorted(found)


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


def text_of(el: BeautifulSoup, selector: str) -> str:
    node = el.select_one(selector)
    return normalize_whitespace(node.get_text()) if node else ""


def href_of(el: BeautifulSoup, selector: str) -> Optional[str]:
    node = el.select_one(selector)
    if node and node.has_attr("href"):
        return node["href"]
    return None


def safe_urljoin(base: str, href: Optional[str]) -> str:
    return urljoin(base, href) if href else base


# -------------------------------
# Network
# -------------------------------
@retry(stop=stop_after_attempt(3), wait=wait_random(min=1, max=4))
def fetch(url: str, params: Dict[str, Any] = None, headers: Dict[str, str] = None) -> requests.Response:
    h = DEFAULT_HEADERS.copy()
    if headers:
        h.update(headers)
    resp = requests.get(url, params=params or {}, headers=h, timeout=20)
    resp.raise_for_status()
    return resp


# -------------------------------
# Scrapers
# -------------------------------
def scrape_soa(keywords: List[str], locations: List[str], remote_only: bool, max_pages: int = 2) -> List[Job]:
    """
    Society of Actuaries job board (public HTML). Selectors may change;
    debug HTML is saved to inspect markup when results are 0.
    """
    base = "https://jobs.soa.org/jobs/"
    jobs: List[Job] = []
    for page in range(1, max_pages + 1):
        url = base if page == 1 else f"{base}?page={page}"
        try:
            resp = fetch(url)
            html = resp.text
            save_debug_html("SOA", f"page-{page}", html)

            soup = BeautifulSoup(html, "html.parser")
            listings = soup.select(".job-listing, .list-group-item, .media")
            for el in listings:
                title = text_of(el, ".job-title, .media-heading, a")
                company = text_of(el, ".company-name, .text-muted, .company")
                location = text_of(el, ".job-location, .location")
                job_url = safe_urljoin(base, href_of(el, "a[href]"))
                desc = normalize_whitespace(el.get_text())
                sal = parse_salary(desc)
                exp = infer_experience(desc)
                apply_url = job_url

                if not title or not company:
                    continue

                job = Job(
                    id=gen_id(title, company, location or "", job_url),
                    title=title,
                    company=company or "",
                    location=location or "",
                    description=desc,
                    salary=sal,
                    job_type=None,
                    experience_level=exp,
                    skills=extract_skills(desc),
                    certifications=extract_certs(desc),
                    posted_date=None,
                    url=job_url,
                    apply_url=apply_url,
                    source="SOA",
                    featured=True
                )
                if matches_filters(job, keywords, locations, remote_only):
                    jobs.append(job)
        except Exception:
            continue
    return jobs


def scrape_cas(keywords: List[str], locations: List[str], remote_only: bool, max_pages: int = 1) -> List[Job]:
    """
    Casualty Actuarial Society job board (public HTML). Single page.
    """
    base = "https://www.casact.org/career-center/job-board"
    jobs: List[Job] = []
    try:
        resp = fetch(base)
        html = resp.text
        save_debug_html("CAS", "page-1", html)

        soup = BeautifulSoup(html, "html.parser")
        items = soup.select(".job-item, article, li a")
        for el in items:
            title = text_of(el, ".job-title, h3, a")
            location = text_of(el, ".location")
            company = text_of(el, ".employer-name") or "Company"
            job_url = safe_urljoin(base, href_of(el, "a[href]"))
            desc = normalize_whitespace(el.get_text())
            sal = parse_salary(desc)
            exp = infer_experience(desc)
            apply_url = job_url

            if not title:
                continue

            job = Job(
                id=gen_id(title, company, location or "", job_url),
                title=title,
                company=company or "",
                location=location or "",
                description=desc,
                salary=sal,
                job_type=None,
                experience_level=exp,
                skills=extract_skills(desc),
                certifications=extract_certs(desc),
                posted_date=None,
                url=job_url,
                apply_url=apply_url,
                source="CAS",
                featured=True
            )
            if matches_filters(job, keywords, locations, remote_only):
                jobs.append(job)
    except Exception:
        pass
    return jobs


def scrape_indeed(keywords: List[str], locations: List[str], remote_only: bool, max_pages: int = 2) -> List[Job]:
    """
    Indeed query-based scraping (HTML).
    Note: Respect robots.txt and TOS. These selectors can break or be blocked.
    """
    jobs: List[Job] = []
    kw_q = " ".join(keywords) if keywords else "actuarial"
    base = "https://www.indeed.com/jobs"
    locs = locations or [""]
    for loc in locs:
        params = {"q": kw_q}
        if loc:
            params["l"] = loc
        if remote_only:
            params["sc"] = "0kf%3Aattr(DSQF7)%3B"  # best-effort remote flag

        for page in range(max_pages):
            params["start"] = page * 10
            try:
                resp = fetch(base, params=params)
                html = resp.text
                save_debug_html("Indeed", f"page-{page}-loc-{loc or 'any'}", html)

                soup = BeautifulSoup(html, "html.parser")
                cards = soup.select(".job_seen_beacon, .resultContent, .jobsearch-SerpJobCard")
                for c in cards:
                    title_el = c.select_one("h2 a, a[data-jk]")
                    title = normalize_whitespace(title_el.get_text()) if title_el else ""
                    company = text_of(c, ".companyName, .company")
                    location = text_of(c, ".companyLocation, .location")
                    job_url = safe_urljoin("https://www.indeed.com",
                                           title_el["href"] if (title_el and title_el.has_attr("href")) else None)
                    snippet = text_of(c, ".job-snippet, .summary")
                    sal = parse_salary(c.get_text())
                    exp = infer_experience(snippet)
                    apply_url = job_url

                    if not title or not company:
                        continue

                    job = Job(
                        id=gen_id(title, company, location or "", job_url),
                        title=title,
                        company=company or "",
                        location=location or "",
                        description=snippet,
                        salary=sal,
                        job_type=None,
                        experience_level=exp,
                        skills=extract_skills(snippet),
                        certifications=extract_certs(snippet),
                        posted_date=None,
                        url=job_url,
                        apply_url=apply_url,
                        source="Indeed",
                        featured=False
                    )
                    if matches_filters(job, keywords, locations, remote_only):
                        jobs.append(job)
                time.sleep(1.5)  # be respectful
            except Exception:
                continue
    return jobs


# -------------------------------
# Aggregation and I/O
# -------------------------------
def dedupe(jobs: List[Job]) -> List[Job]:
    seen = set()
    unique = []
    for j in jobs:
        if j.id in seen:
            continue
        seen.add(j.id)
        unique.append(j)
    return unique


def sort_jobs(jobs: List[Job]) -> List[Job]:
    return sorted(jobs, key=lambda j: (j.source, j.company, j.title))


def run_scrape(keywords: List[str], locations: List[str], remote_only: bool, max_pages: int) -> List[Job]:
    all_jobs: List[Job] = []
    sources = [
        ("SOA", scrape_soa),
        ("CAS", scrape_cas),
        ("Indeed", scrape_indeed),
    ]
    for name, fn in sources:
        print(f"Scraping {name}...")
        try:
            jobs = fn(keywords, locations, remote_only, max_pages=max_pages)
            print(f"  Found {len(jobs)} from {name}")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"  Error scraping {name}: {e}")
    all_jobs = dedupe(all_jobs)
    all_jobs = sort_jobs(all_jobs)
    return all_jobs


def save_output(jobs: List[Job], out_path: str) -> None:
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    data = [asdict(j) for j in jobs]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Saved {len(jobs)} jobs to {out_path}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Scrape actuarial jobs with filters.")
    p.add_argument("--keywords", "-k", nargs="*", default=["actuary", "actuarial"],
                   help="Search keywords")
    p.add_argument("--locations", "-l", nargs="*", default=[],
                   help="Location filters (partial match, e.g., 'Toronto', 'Remote', 'New York')")
    p.add_argument("--remote-only", action="store_true",
                   help="Only include remote jobs")
    p.add_argument("--max-pages", type=int, default=2,
                   help="Max pages per source")
    # Output to public so Astro serves at /jobs.json
    p.add_argument("--out", "-o", default="public/jobs.json",
                   help="Output JSON path")
    return p.parse_args()


def main():
    args = parse_args()
    jobs = run_scrape(args.keywords, args.locations, args.remote_only, args.max_pages)
    save_output(jobs, args.out)


if __name__ == "__main__":
    main()