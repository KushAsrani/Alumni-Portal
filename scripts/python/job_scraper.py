import requests
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import hashlib
from urllib.parse import urlencode, quote_plus
from email.utils import parsedate_to_datetime
import random
import asyncio
try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    print("⚠ Playwright not installed. Naukri and Indeed scraping will be limited.")
    print("  Install with: pip install playwright && playwright install chromium")
try:
    import lxml
    HAS_LXML = True
except ImportError:
    HAS_LXML = False

# Rotate through these User-Agent strings when retrying LinkedIn requests so
# that repeated attempts from Docker IPs are less likely to be blocked.
_LINKEDIN_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
]

class ActuarialJobScraper:
    """
    Comprehensive web scraper for actuarial job listings from multiple sources
    """

    INDIAN_CITIES = [
        'Mumbai', 'Delhi', 'Bangalore', 'Bengaluru', 'Hyderabad',
        'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur',
        'Gurugram', 'Gurgaon', 'Noida', 'Lucknow', 'Kochi',
        'Surat', 'Chandigarh', 'Indore',
    ]
    
    def __init__(self, location: str = "India", keywords: List[str] = None):
        """
        Initialize the scraper
        
        Args:
            location: Geographic location for job search (default: India)
            keywords: List of keywords to search for (default: actuarial-related)
        """
        self.location = location
        self.keywords = keywords or [
            "actuarial", "actuary", "actuarial analyst", 
            "actuarial scientist", "pricing actuary", "reserving actuary",
            "risk analyst", "insurance analyst"
        ]
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        })
        self.jobs = []
        self.seen_ids = set()
        
    def generate_job_id(self, title: str, company: str, location: str) -> str:
        """Generate unique ID for job posting"""
        combined = f"{title}|{company}|{location}".lower()
        return hashlib.md5(combined.encode()).hexdigest()[:16]
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        if not text:
            return ""
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        # Remove special characters but keep Indian rupee symbol
        text = re.sub(r'[^\w\s\-.,/$()&₹]', '', text)
        return text

    def _enhance_location(self, location: str, title: str, description: str) -> str:
        """Enhance location by detecting remote work and extracting city names"""
        combined_text = f"{title} {description} {location}".lower()
        
        is_remote = any(keyword in combined_text for keyword in [
            'remote', 'work from home', 'wfh', 'work-from-home',
            'anywhere', 'telecommute', 'virtual'
        ])
        
        is_hybrid = any(keyword in combined_text for keyword in [
            'hybrid', 'flexible location', 'partially remote'
        ])
        
        # Known Indian cities to look for in the text
        indian_cities = [
            'Mumbai', 'Delhi', 'Bangalore', 'Bengaluru', 'Hyderabad',
            'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur',
            'Gurugram', 'Gurgaon', 'Noida', 'Lucknow', 'Kochi',
            'Chandigarh', 'Indore', 'Nagpur', 'Coimbatore', 'Vadodara',
            'Thiruvananthapuram', 'Trivandrum', 'Mysore', 'Bhopal',
            'Visakhapatnam', 'Vizag', 'Surat', 'Navi Mumbai', 'Thane',
            'Greater Noida', 'Faridabad', 'Ghaziabad',
        ]
        
        # Extract city from location or description
        found_city = None
        for city in indian_cities:
            if city.lower() in location.lower():
                found_city = city
                break
        
        # If location is just "India", try to find city in description
        if not found_city and location.strip().lower() in ['india', '']:
            for city in indian_cities:
                if city.lower() in description.lower():
                    found_city = city
                    break
        
        # Build enhanced location string
        parts = []
        
        if found_city:
            # Use the original location if it has more detail than just the city
            if found_city.lower() != location.strip().lower() and location.strip().lower() != 'india':
                parts.append(location.strip())
            else:
                parts.append(found_city)
                parts.append('India')
        else:
            parts.append(location.strip() if location.strip() else 'India')
        
        if is_remote:
            if 'Remote' not in parts and 'remote' not in location.lower():
                parts.append('Remote')
        elif is_hybrid:
            if 'Hybrid' not in parts and 'hybrid' not in location.lower():
                parts.append('Hybrid')
        
        result = ', '.join(parts)
        
        # Clean up duplicates like "India, India"
        seen = []
        for part in result.split(', '):
            if part.strip() and part.strip() not in seen:
                seen.append(part.strip())
        
        return ', '.join(seen)
    
    def extract_salary(self, text: str) -> Optional[Dict[str, any]]:
        """
        Extract salary information from text (Indian Rupees)
        Handles formats like:
        - ₹5,00,000 - ₹10,00,000
        - Rs. 5 LPA - 10 LPA
        - 5-10 Lakhs
        - ₹50000 - ₹100000 per month
        """
        text = text.replace(',', '')  # Remove commas for easier parsing
        
        # Pattern 1: ₹X - ₹Y or Rs. X - Y (in actual numbers)
        pattern1 = r'[₹Rs\.]+\s*(\d+(?:\.\d+)?)\s*(?:L|Lakh|Lakhs|LPA|K)?\s*-\s*[₹Rs\.]*\s*(\d+(?:\.\d+)?)\s*(L|Lakh|Lakhs|LPA|K)?'
        match = re.search(pattern1, text, re.IGNORECASE)
        
        if match:
            min_sal = float(match.group(1))
            max_sal = float(match.group(2))
            unit = match.group(3) if match.group(3) else ''
            
            # Convert to annual rupees
            if unit and unit.upper() in ['L', 'LAKH', 'LAKHS', 'LPA']:
                min_sal = int(min_sal * 100000)  # Lakhs to Rupees
                max_sal = int(max_sal * 100000)
            elif unit and unit.upper() == 'K':
                min_sal = int(min_sal * 1000)
                max_sal = int(max_sal * 1000)
            else:
                min_sal = int(min_sal)
                max_sal = int(max_sal)
            
            # Assume monthly if less than 50000
            if max_sal < 50000:
                min_sal *= 12
                max_sal *= 12
            
            return {
                "min": min_sal,
                "max": max_sal,
                "currency": "INR"
            }
        
        # Pattern 2: X-Y Lakhs or X-Y LPA
        pattern2 = r'(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(Lakhs?|LPA|Crores?)'
        match = re.search(pattern2, text, re.IGNORECASE)
        
        if match:
            min_sal = float(match.group(1))
            max_sal = float(match.group(2))
            unit = match.group(3).lower()
            
            if 'crore' in unit:
                min_sal = int(min_sal * 10000000)  # Crores to Rupees
                max_sal = int(max_sal * 10000000)
            else:  # Lakhs or LPA
                min_sal = int(min_sal * 100000)
                max_sal = int(max_sal * 100000)
            
            return {
                "min": min_sal,
                "max": max_sal,
                "currency": "INR"
            }
        
        # Pattern 3: Single value with unit
        pattern3 = r'[₹Rs\.]+\s*(\d+(?:\.\d+)?)\s*(L|Lakh|Lakhs|LPA|Crore|Crores)'
        match = re.search(pattern3, text, re.IGNORECASE)
        
        if match:
            sal = float(match.group(1))
            unit = match.group(2).lower()
            
            if 'crore' in unit:
                sal = int(sal * 10000000)
            else:
                sal = int(sal * 100000)
            
            # Assume ±20% range
            return {
                "min": int(sal * 0.8),
                "max": int(sal * 1.2),
                "currency": "INR"
            }
        
        return None
    
    def determine_experience_level(self, title: str, description: str) -> str:
        """Determine experience level from job title and description"""
        text = f"{title} {description}".lower()
        
        if any(word in text for word in ['senior', 'lead', 'principal', '10+ years', '8+ years', 'sr.']):
            return 'senior'
        elif any(word in text for word in ['manager', 'director', 'vp', 'chief', 'head']):
            return 'executive'
        elif any(word in text for word in ['mid-level', '3-5 years', '4-7 years', 'experienced', '2-4 years']):
            return 'mid'
        elif any(word in text for word in ['entry', 'junior', 'associate', '0-2 years', 'graduate', 'fresher', 'trainee']):
            return 'entry'
        else:
            return 'mid'
    
    def determine_job_type(self, title: str, description: str) -> str:
        """Determine job type from title and description"""
        text = f"{title} {description}".lower()
        
        if 'intern' in text:
            return 'internship'
        elif any(word in text for word in ['contract', 'contractor', 'temp', 'temporary', 'freelance']):
            return 'contract'
        elif any(word in text for word in ['part-time', 'part time', 'parttime']):
            return 'part-time'
        else:
            return 'full-time'
    
    def extract_skills(self, description: str) -> List[str]:
        """Extract skills from job description"""
        skills_keywords = [
            'excel', 'sql', 'python', 'tableau', 'power bi', 'powerpoint', 'vba', 'sas', 'stata', 'looker', 'access', 'matlab', 'java', 'javascript', 'json', 'hadoop', 'hive', 'impala', 'snowflake', 'spark', 'kafka', 'azure', 'aws', 'devops', 'microsoft 365', 'google analytics', 'gcp', 'artificial intelligence', 'machine learning', 'ai', 'ml', 'aiml', 'prophet', 'moses', 'emblem', 'axis', 'igloo', 'graphql', 'deep learning', 'data visualization', 'data analysis', 'data science', 'data loss prevention', 'dataloss prevention', 'data mining', 'data scrapping', 'cloud computing', 'cloud security', 'statistical analysis', 'predictive modeling', 'data modeling', 'data warehousing', 'etl', 'big data', 'oracle', 'redshift', 'databricks', 'airflow', 'market research', 'research', 'financial reporting', 'communication', 'presentation', 'problem-solving', 'critical thinking', 'teamwork', 'leadership', 'collaboration', 'multitasking', 'interpersonal skills'
        ]
        
        description_lower = description.lower()
        found_skills = []
        
        for skill in skills_keywords:
            if len(skill) <= 2:
                match = re.search(rf'\b{re.escape(skill)}\b', description_lower)
            else:
                match = skill in description_lower
            if match:
                # Capitalize properly
                if skill in ['sql', 'vba', 'sas', 'aws', 'gcp', 'ai', 'ml', 'etl']:
                    found_skills.append(skill.upper())
                else:
                    found_skills.append(skill.title())
        
        # Remove duplicates while preserving order
        return list(dict.fromkeys(found_skills))
    
    def extract_certifications(self, description: str) -> List[str]:
        """Extract certifications from job description"""
        # Indian and international actuarial certifications
        cert_keywords = [
            'FSA', 'ASA', 'FCAS', 'ACAS', 'EA', 'MAAA', 'CERA', 
            'FIA', 'CIA', 'FIAI', 'AIAI',  # Indian certifications
            'ACII', 'FCII'  # UK certifications common in India
        ]
        
        found_certs = []
        for cert in cert_keywords:
            if cert in description:
                found_certs.append(cert)
        
        return found_certs

    def extract_qualifications(self, description: str) -> List[str]:
        """Extract qualifications/education requirements from job description"""
        qualification_keywords = [
            # Degrees
            ("bachelor", "Bachelor's Degree"),
            ("master", "Master's Degree"),
            ("mba", "MBA"),
            ("phd", "PhD"),
            ("b.tech", "B.Tech"),
            ("btech", "B.Tech"),
            ("m.tech", "M.Tech"),
            ("mtech", "M.Tech"),
            ("b.sc", "B.Sc"),
            ("bsc", "B.Sc"),
            ("m.sc", "M.Sc"),
            ("msc", "M.Sc"),
            ("b.com", "B.Com"),
            ("bcom", "B.Com"),
            ("m.com", "M.Com"),
            ("mcom", "M.Com"),
            ("b.e.", "B.E."),
            (r"\bca\b", "CA"),
            ("cpa", "CPA"),
            ("cfa", "CFA"),
            ("frm", "FRM"),
            # Fields
            ("mathematics", "Mathematics"),
            ("statistics", "Statistics"),
            ("actuarial science", "Actuarial Science"),
            ("computer science", "Computer Science"),
            ("data science", "Data Science"),
            ("finance", "Finance"),
            ("economics", "Economics"),
            ("engineering", "Engineering"),
            ("accounting", "Accounting"),
        ]

        description_lower = description.lower()
        found_quals = []

        for keyword, display_name in qualification_keywords:
            if keyword.startswith(r'\b'):
                match = bool(re.search(keyword, description_lower))
            else:
                match = keyword in description_lower
            if match and display_name not in found_quals:
                found_quals.append(display_name)

        return found_quals

    def _find_job_details(self, obj, depth: int = 0):
        """Recursively search a nested dict/list for a 'jobDetails' list (max depth 5)."""
        if depth > 5:
            return None
        if isinstance(obj, dict):
            if 'jobDetails' in obj and isinstance(obj['jobDetails'], list):
                return obj['jobDetails']
            for v in obj.values():
                result = self._find_job_details(v, depth + 1)
                if result:
                    return result
        return None

    def scrape_naukri(self, max_pages: int = 5) -> List[Dict]:
        """Scrape jobs from Naukri.com using Playwright (required - Naukri is client-side rendered)"""
        print(f"\n🔍 Scraping Naukri.com for actuarial jobs in {self.location}...")
        jobs = []

        if not HAS_PLAYWRIGHT:
            print("  ⚠ Playwright not installed - skipping Naukri")
            print("  Install with: pip install playwright && playwright install chromium")
            return jobs

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=[
                        '--headless=new',
                        '--disable-blink-features=AutomationControlled',
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                    ]
                )
                context = browser.new_context(
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    viewport={'width': 1920, 'height': 1080},
                    locale='en-IN',
                    timezone_id='Asia/Kolkata',
                )

                page = context.new_page()

                # Stealth: hide webdriver detection
                page.add_init_script("""
                    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                    Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
                    Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en', 'hi']});
                    window.chrome = { runtime: {} };
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters) => (
                        parameters.name === 'notifications' ?
                            Promise.resolve({ state: Notification.permission }) :
                            originalQuery(parameters)
                    );
                """)

                for keyword in self.keywords[:4]:
                    try:
                        keyword_slug = keyword.replace(' ', '-')
                        url = f"https://www.naukri.com/{keyword_slug}-jobs-in-{self.location.lower()}"

                        print(f"  📄 Loading: {keyword}...")

                        try:
                            page.goto(url, wait_until='networkidle', timeout=30000)
                        except Exception:
                            try:
                                page.goto(url, wait_until='domcontentloaded', timeout=30000)
                                time.sleep(3)
                            except Exception as e:
                                print(f"    ⚠ Could not load page: {str(e)}")
                                continue

                        # Wait for job cards to render
                        try:
                            page.wait_for_selector('article.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple, [class*="jobTuple"], .styles_jlc__main', timeout=10000)
                        except Exception:
                            for i in range(5):
                                page.evaluate('window.scrollBy(0, 500)')
                                time.sleep(0.5)
                            time.sleep(2)

                        # Approach 1: Try to extract __NEXT_DATA__ JSON
                        try:
                            next_data_text = page.evaluate("""
                                () => {
                                    const el = document.getElementById('__NEXT_DATA__');
                                    return el ? el.textContent : null;
                                }
                            """)
                            if next_data_text:
                                next_data = json.loads(next_data_text)
                                props = next_data.get('props', {}).get('pageProps', {})

                                job_details = None
                                if 'initialState' in props:
                                    job_details = props['initialState'].get('searchResult', {}).get('jobDetails', [])
                                elif 'jobDetails' in props:
                                    job_details = props['jobDetails']
                                elif 'searchResult' in props:
                                    job_details = props['searchResult'].get('jobDetails', [])

                                if not job_details:
                                    job_details = self._find_job_details(next_data)

                                if job_details:
                                    print(f"    📊 Found {len(job_details)} jobs in __NEXT_DATA__")
                                    for job_data in job_details:
                                        try:
                                            title = job_data.get('title', '').strip()
                                            if not title:
                                                continue

                                            company = job_data.get('companyName', 'Unknown Company').strip()

                                            loc = self.location
                                            exp_text = ""
                                            salary_text = ""
                                            for ph in job_data.get('placeholders', []):
                                                ph_type = ph.get('type', '').lower()
                                                ph_label = ph.get('label', '')
                                                if 'location' in ph_type:
                                                    loc = ph_label
                                                elif 'experience' in ph_type:
                                                    exp_text = ph_label
                                                elif 'salary' in ph_type or 'ctc' in ph_type:
                                                    salary_text = ph_label

                                            desc_html = job_data.get('jobDescription', '')
                                            if desc_html:
                                                desc_soup = BeautifulSoup(desc_html, 'html.parser')
                                                desc_text = desc_soup.get_text(' ', strip=True)
                                            else:
                                                snippets = job_data.get('snippets', [])
                                                desc_text = snippets[0] if snippets else f"{title} position at {company}"

                                            tags_skills = job_data.get('tagsAndSkills', '')
                                            full_text = f"{title} {desc_text} {tags_skills} {exp_text} {salary_text}"

                                            jd_url = job_data.get('jdURL', '')
                                            if jd_url and not jd_url.startswith('http'):
                                                job_link = f"https://www.naukri.com{jd_url}"
                                            elif jd_url:
                                                job_link = jd_url
                                            else:
                                                job_link = url

                                            job_id = self.generate_job_id(title, company, loc)
                                            if job_id in self.seen_ids:
                                                continue
                                            self.seen_ids.add(job_id)

                                            location_str = self._enhance_location(loc, title, full_text)

                                            job = {
                                                'id': job_id,
                                                'title': title,
                                                'company': company,
                                                'location': location_str,
                                                'description': desc_text[:500] if desc_text else f"{title} at {company}",
                                                'url': job_link,
                                                'source': 'Naukri',
                                                'jobType': self.determine_job_type(title, full_text),
                                                'experienceLevel': self.determine_experience_level(title, full_text),
                                                'skills': self.extract_skills(full_text),
                                                'qualifications': self.extract_qualifications(full_text),
                                                'certifications': self.extract_certifications(full_text),
                                                'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                                'featured': False
                                            }

                                            salary = self.extract_salary(salary_text + " " + desc_text)
                                            if salary:
                                                job['salary'] = salary

                                            jobs.append(job)
                                            skills_str = ', '.join(job['skills']) if job['skills'] else 'none'
                                            print(f"  ✓ Found: {title} at {company} - {location_str} [skills: {skills_str}]")

                                        except Exception:
                                            continue
                        except Exception as e:
                            print(f"    ⚠ Could not extract __NEXT_DATA__: {str(e)}")

                        # Approach 2: If __NEXT_DATA__ didn't work, try DOM extraction
                        if not any(j.get('source') == 'Naukri' for j in jobs):
                            try:
                                job_elements = page.query_selector_all('article.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple, [class*="jobTuple"]')

                                if not job_elements:
                                    job_elements = page.query_selector_all('[class*="job-tuple"], [class*="jobCard"], .styles_jlc__main')

                                print(f"    📊 Found {len(job_elements)} job cards in DOM")

                                for el in job_elements:
                                    try:
                                        title_el = el.query_selector('a.title, [class*="title"] a, a[class*="title"]')
                                        title = title_el.inner_text().strip() if title_el else None
                                        if not title:
                                            continue

                                        comp_el = el.query_selector('a.subTitle, [class*="companyInfo"], [class*="company"]')
                                        company = comp_el.inner_text().strip() if comp_el else "Unknown Company"

                                        loc_el = el.query_selector('.location, [class*="location"], .locWdth')
                                        loc = loc_el.inner_text().strip() if loc_el else self.location

                                        job_link = title_el.get_attribute('href') if title_el else url
                                        if job_link and not job_link.startswith('http'):
                                            job_link = f"https://www.naukri.com{job_link}"

                                        desc_el = el.query_selector('.job-description, [class*="description"], .ellipsis')
                                        desc_text = desc_el.inner_text().strip() if desc_el else f"{title} position at {company}"

                                        tags_el = el.query_selector('.tags-gt, [class*="tags"], [class*="skills"]')
                                        tags_text = tags_el.inner_text().strip() if tags_el else ""

                                        full_text = f"{title} {desc_text} {tags_text}"

                                        job_id = self.generate_job_id(title, company, loc)
                                        if job_id in self.seen_ids:
                                            continue
                                        self.seen_ids.add(job_id)

                                        location_str = self._enhance_location(loc, title, full_text)

                                        job = {
                                            'id': job_id,
                                            'title': title,
                                            'company': company,
                                            'location': location_str,
                                            'description': desc_text[:500],
                                            'url': job_link,
                                            'source': 'Naukri',
                                            'jobType': self.determine_job_type(title, full_text),
                                            'experienceLevel': self.determine_experience_level(title, full_text),
                                            'skills': self.extract_skills(full_text),
                                            'qualifications': self.extract_qualifications(full_text),
                                            'certifications': self.extract_certifications(full_text),
                                            'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                            'featured': False
                                        }

                                        jobs.append(job)
                                        skills_str = ', '.join(job['skills']) if job['skills'] else 'none'
                                        print(f"  ✓ Found: {title} at {company} - {location_str} [skills: {skills_str}]")

                                    except Exception:
                                        continue

                            except Exception as e:
                                print(f"    ⚠ DOM extraction failed: {str(e)}")

                        time.sleep(random.uniform(2, 4))

                    except Exception as e:
                        print(f"  ✗ Error: {str(e)}")
                        continue

                browser.close()

        except Exception as e:
            print(f"  ✗ Naukri scraper error: {str(e)}")

        print(f"✅ Naukri: Found {len(jobs)} jobs")
        return jobs
    
    def scrape_indeed_india(self, max_pages: int = 3) -> List[Dict]:
        """Scrape jobs from Indeed India using RSS feeds (avoids Cloudflare blocks)"""
        print(f"\n🔍 Scraping Indeed India for actuarial jobs in {self.location}...")
        jobs = []

        for keyword in self.keywords:
            try:
                # Indeed provides RSS feeds that bypass Cloudflare
                rss_url = f"https://in.indeed.com/rss?q={quote_plus(keyword)}&l={quote_plus(self.location)}&sort=date"

                print(f"  📄 Loading RSS: {keyword}...")

                response = self.session.get(rss_url, timeout=15)

                if response.status_code != 200:
                    print(f"    ⚠ Indeed RSS returned status {response.status_code}")
                    continue

                parser = 'lxml-xml' if HAS_LXML else 'html.parser'
                soup = BeautifulSoup(response.content, parser)
                items = soup.find_all('item')

                if not items:
                    # Fallback: try parsing as HTML in case RSS returns HTML
                    soup = BeautifulSoup(response.content, 'html.parser')
                    items = soup.find_all('item')

                if not items:
                    print(f"    ⚠ No jobs found in RSS for '{keyword}'")
                    continue

                for item in items:
                    try:
                        title = item.find('title')
                        title = title.get_text(strip=True) if title else None
                        if not title:
                            continue

                        # Extract company from title (Indeed RSS format: "Job Title - Company")
                        company = "Unknown Company"
                        if ' - ' in title:
                            parts = title.rsplit(' - ', 1)
                            title = parts[0].strip()
                            company = parts[1].strip()

                        # Get link
                        link = item.find('link')
                        job_link = link.get_text(strip=True) if link else ""
                        if not job_link:
                            guid = item.find('guid')
                            job_link = guid.get_text(strip=True) if guid else rss_url

                        # Get description
                        description_el = item.find('description')
                        description = ""
                        if description_el:
                            desc_html = description_el.get_text()
                            desc_soup = BeautifulSoup(desc_html, 'html.parser')
                            description = desc_soup.get_text(' ', strip=True)

                        if not description or len(description) < 10:
                            description = f"{title} position at {company}"

                        # Extract location from description or use default
                        loc = self.location
                        source_el = item.find('source')
                        if source_el:
                            source_text = source_el.get_text(strip=True)
                            if source_text and source_text != 'Indeed':
                                loc = source_text

                        # Try to extract location from description
                        loc_match = re.match(r'^([A-Za-z\s,]+(?:India|Remote|Hybrid))\s*[-–]', description)
                        if loc_match:
                            loc = loc_match.group(1).strip()

                        # Also check for Indian city names in the description
                        if loc == self.location:
                            for city in self.INDIAN_CITIES:
                                if city.lower() in description.lower():
                                    loc = f"{city}, India"
                                    break

                        job_id = self.generate_job_id(title, company, loc)
                        if job_id in self.seen_ids:
                            continue
                        self.seen_ids.add(job_id)

                        full_text = f"{title} {description}"
                        location = self._enhance_location(loc, title, full_text)

                        # Get published date
                        pub_date = item.find('pubDate')
                        posted_date = datetime.now().strftime('%Y-%m-%d')
                        if pub_date:
                            try:
                                dt = parsedate_to_datetime(pub_date.get_text(strip=True))
                                posted_date = dt.strftime('%Y-%m-%d')
                            except Exception:
                                pass

                        job = {
                            'id': job_id,
                            'title': title,
                            'company': company,
                            'location': location,
                            'description': description[:500],
                            'url': job_link,
                            'source': 'Indeed',
                            'jobType': self.determine_job_type(title, full_text),
                            'experienceLevel': self.determine_experience_level(title, full_text),
                            'skills': self.extract_skills(full_text),
                            'qualifications': self.extract_qualifications(full_text),
                            'certifications': self.extract_certifications(full_text),
                            'posted_date': posted_date,
                            'featured': False
                        }

                        salary = self.extract_salary(description)
                        if salary:
                            job['salary'] = salary

                        jobs.append(job)
                        skills_str = ', '.join(job['skills']) if job['skills'] else 'none detected'
                        print(f"  ✓ Found: {title} at {company} - {location} [skills: {skills_str}]")

                    except Exception:
                        continue

                time.sleep(random.uniform(1, 2))

            except Exception as e:
                print(f"  ✗ Error on Indeed RSS for '{keyword}': {str(e)}")
                continue

        print(f"✅ Indeed India: Found {len(jobs)} jobs")
        return jobs
    
    def scrape_linkedin_india(self, max_pages: int = 3) -> List[Dict]:
        """Scrape jobs from LinkedIn India"""
        print(f"\n🔍 Scraping LinkedIn India for actuarial jobs in {self.location}...")
        jobs = []
        
        for keyword in self.keywords[:2]:  # Limit keywords for LinkedIn
            try:
                params = {
                    'keywords': keyword,
                    'location': self.location,
                    'f_WT': '2'  # Remote filter
                }
                
                url = f"https://www.linkedin.com/jobs/search?{urlencode(params)}"
                
                response = self.session.get(url, timeout=15)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                job_cards = soup.find_all('div', class_='base-card')
                
                for card in job_cards[:20]:  # Limit per keyword
                    try:
                        title_elem = card.find('h3', class_='base-search-card__title')
                        title = self.clean_text(title_elem.get_text()) if title_elem else None
                        
                        company_elem = card.find('h4', class_='base-search-card__subtitle')
                        company = self.clean_text(company_elem.get_text()) if company_elem else "Unknown Company"
                        
                        location_elem = card.find('span', class_='job-search-card__location')
                        location = self.clean_text(location_elem.get_text()) if location_elem else self.location
                        
                        link_elem = card.find('a', class_='base-card__full-link')
                        job_link = link_elem['href'] if link_elem and link_elem.get('href') else url
                        
                        if not title:
                            continue
                        
                        job_id = self.generate_job_id(title, company, location)
                        
                        if job_id in self.seen_ids:
                            continue
                        
                        self.seen_ids.add(job_id)

                        # Extract any snippet text available on the search results page.
                        # This gives us a meaningful fallback when the detail page is
                        # blocked in Docker/container environments.
                        snippet_elem = (
                            card.find('p', class_='job-search-card__snippet') or
                            card.find('div', class_='base-search-card__metadata') or
                            card.find('p', {'class': lambda c: c and 'snippet' in str(c).lower()})
                        )
                        snippet = self.clean_text(snippet_elem.get_text()) if snippet_elem else ""

                        # --- Fetch the full job description with retry + UA rotation ---
                        description = f"{title} position at {company}"
                        job_certs = []
                        detail_location = location  # Start with search page location
                        detail_fetched = False

                        for attempt in range(3):
                            try:
                                if attempt == 0:
                                    time.sleep(random.uniform(1, 2))
                                else:
                                    # Exponential backoff and rotate User-Agent on retries
                                    time.sleep(2 ** attempt + random.uniform(0, 1))
                                    self.session.headers.update({
                                        'User-Agent': random.choice(_LINKEDIN_USER_AGENTS)
                                    })

                                detail_response = self.session.get(job_link, timeout=15)
                                if detail_response.status_code == 200:
                                    detail_soup = BeautifulSoup(detail_response.content, 'html.parser')

                                    # Extract job location from detail page
                                    detail_loc_elem = (
                                        detail_soup.find('span', class_='topcard__flavor--bullet') or
                                        detail_soup.find('span', class_='top-card-layout__bullet') or
                                        detail_soup.find('span', {'class': lambda c: c and 'location' in str(c).lower()})
                                    )
                                    if detail_loc_elem:
                                        parsed_loc = self.clean_text(detail_loc_elem.get_text())
                                        if parsed_loc and len(parsed_loc) > 2:
                                            detail_location = parsed_loc

                                    # Extract description
                                    desc_elem = (
                                        detail_soup.find('div', class_='description__text') or
                                        detail_soup.find('div', class_='show-more-less-html__markup') or
                                        detail_soup.find('section', class_='description') or
                                        detail_soup.find('div', {'class': lambda c: c and 'description' in c})
                                    )

                                    if desc_elem:
                                        description = self.clean_text(desc_elem.get_text())
                                        detail_fetched = True
                                    # A 200 response is terminal — the page either has
                                    # the description element or it doesn't; retrying
                                    # would return the same HTML structure.
                                    break
                                elif detail_response.status_code in (429, 403):
                                    print(f"    ⚠ LinkedIn rate-limited ({detail_response.status_code}) for {title}, attempt {attempt + 1}/3")
                                else:
                                    break  # Non-retriable error
                            except Exception as detail_err:
                                print(f"    ⚠ Could not fetch details for {title} (attempt {attempt + 1}/3): {str(detail_err)}")

                        if not detail_fetched:
                            print(f"    ℹ Using search page text for skill extraction: {title}")

                        # Always extract from the richest available text so that skills
                        # and qualifications are populated even when the detail page is
                        # blocked (e.g. inside Docker/container environments).
                        combined_text = " ".join(filter(None, [title, company, description, snippet]))
                        job_certs = self.extract_certifications(combined_text)

                        # --- Enhance location with Remote detection ---
                        location = self._enhance_location(detail_location, title, description)

                        job = {
                            'id': job_id,
                            'title': title,
                            'company': company,
                            'location': location,
                            'description': description[:500] if len(description) > 500 else description,
                            'url': job_link,
                            'source': 'LinkedIn',
                            'jobType': self.determine_job_type(title, description),
                            'experienceLevel': self.determine_experience_level(title, description),
                            'skills': self.extract_skills(combined_text),
                            'qualifications': self.extract_qualifications(combined_text),
                            'certifications': job_certs,
                            'posted_date': datetime.now().strftime('%Y-%m-%d'),
                            'featured': True
                        }

                        jobs.append(job)
                        skills_str = ', '.join(job['skills']) if job['skills'] else 'none detected'
                        print(f"  ✓ Found: {title} at {company} [skills: {skills_str}]")
                        
                    except Exception as e:
                        print(f"  ✗ Error parsing job card: {str(e)}")
                        continue
                
                time.sleep(random.uniform(3, 5))
                
            except Exception as e:
                print(f"  ✗ Error scraping LinkedIn: {str(e)}")
                continue
        
        print(f"✅ LinkedIn India: Found {len(jobs)} jobs")
        return jobs
    
    def scrape_all(self) -> List[Dict]:
        """Scrape jobs from all sources"""
        print("\n" + "="*60)
        print("🚀 ACTUARIAL JOB SCRAPER - INDIA")
        print("="*60)
        print(f"📍 Location: {self.location}")
        print(f"🔑 Keywords: {', '.join(self.keywords)}")
        print(f"💰 Currency: Indian Rupees (INR)")
        print("="*60)
        
        # Scrape from all sources
        naukri_jobs = self.scrape_naukri(max_pages=5)
        indeed_jobs = self.scrape_indeed_india(max_pages=3)
        linkedin_jobs = self.scrape_linkedin_india(max_pages=2)
        
        # Combine all jobs
        all_jobs = naukri_jobs + indeed_jobs + linkedin_jobs
        
        print("\n" + "="*60)
        print(f"📊 SCRAPING SUMMARY")
        print("="*60)
        print(f"  Naukri:    {len(naukri_jobs)} jobs")
        print(f"  Indeed:    {len(indeed_jobs)} jobs")
        print(f"  LinkedIn:  {len(linkedin_jobs)} jobs")
        print(f"  TOTAL:     {len(all_jobs)} jobs")
        print("="*60)
        
        self.jobs = all_jobs
        return all_jobs
    
    def save_to_json(self, filename: str = 'actuarial_jobs_india.json'):
        """Save scraped jobs to JSON file"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(self.jobs, f, indent=2, ensure_ascii=False)
            print(f"\n✅ Saved {len(self.jobs)} jobs to {filename}")
        except Exception as e:
            print(f"\n❌ Error saving to JSON: {str(e)}")
    
    def save_individual_files(self, output_dir: str = '../src/content/jobs'):
        """Save each job as individual JSON file for Astro content collection"""
        import os
        
        try:
            os.makedirs(output_dir, exist_ok=True)
            
            for job in self.jobs:
                # Create filename from job title and company
                filename = f"{job['title']}-{job['company']}".lower()
                filename = re.sub(r'[^a-z0-9]+', '-', filename)
                filename = filename.strip('-')[:50] + '.json'
                
                filepath = os.path.join(output_dir, filename)
                
                # Clean up the job data
                cleaned_job = {
                    'id': job['id'],
                    'title': job['title'],
                    'company': job['company'],
                    'location': job['location'],
                    'description': job['description'],
                    'url': job['url'],
                    'source': job['source'],
                    'jobType': job['jobType'],
                    'experienceLevel': job['experienceLevel'],
                    'skills': job['skills'],
                    'qualifications': job.get('qualifications', []),
                    'posted_date': job['posted_date'],
                    'featured': job.get('featured', False)
                }
                
                # Only include salary if it exists
                if job.get('salary'):
                    cleaned_job['salary'] = job['salary']
                
                # Only include certifications if they exist
                if job.get('certifications'):
                    cleaned_job['certifications'] = job['certifications']
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(cleaned_job, f, indent=2, ensure_ascii=False)
            
            print(f"\n✅ Saved {len(self.jobs)} individual job files to {output_dir}")
        except Exception as e:
            print(f"\n❌ Error saving individual files: {str(e)}")
    
    def filter_by_location(self, cities: List[str]) -> List[Dict]:
        """Filter jobs by specific Indian cities"""
        filtered = []
        for job in self.jobs:
            if any(city.lower() in job['location'].lower() for city in cities):
                filtered.append(job)
        return filtered
    
    def filter_by_experience(self, level: str) -> List[Dict]:
        """Filter jobs by experience level"""
        return [job for job in self.jobs if job['experienceLevel'] == level]
    
    def filter_by_salary_range(self, min_salary_lakhs: float) -> List[Dict]:
        """Filter jobs with salary above minimum (in Lakhs)"""
        min_salary_inr = int(min_salary_lakhs * 100000)
        filtered = []
        for job in self.jobs:
            if job.get('salary') and job['salary']['min'] >= min_salary_inr:
                filtered.append(job)
        return filtered


def main():
    """Main execution function"""
    # Configuration for India
    LOCATION = "India"
    KEYWORDS = [
        "actuarial analyst",
        "actuary",
        "actuarial scientist",
        "risk analyst",
        "insurance analyst",
        "pricing analyst"
    ]
    
    # Initialize scraper
    scraper = ActuarialJobScraper(location=LOCATION, keywords=KEYWORDS)
    
    # Scrape jobs
    jobs = scraper.scrape_all()
    
    # Save to files
    scraper.save_to_json('actuarial_jobs_india.json')
    scraper.save_individual_files('../src/content/jobs')
    
    # Example: Filter by major Indian cities
    # major_cities = ['Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Hyderabad', 'Chennai']
    # filtered_jobs = scraper.filter_by_location(major_cities)
    # print(f"\n🔍 Filtered to major cities: {len(filtered_jobs)} jobs")
    
    # Example: Filter by salary
    # high_salary_jobs = scraper.filter_by_salary_range(min_salary_lakhs=8.0)
    # print(f"\n💰 Jobs with salary ≥ 8 LPA: {len(high_salary_jobs)} jobs")
    
    print("\n✨ Scraping completed successfully!")


if __name__ == "__main__":
    main()