import requests
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import hashlib
from urllib.parse import urlencode, quote_plus
import random
import asyncio
try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    print("⚠ Playwright not installed. Naukri and Indeed scraping will be limited.")
    print("  Install with: pip install playwright && playwright install chromium")

class ActuarialJobScraper:
    """
    Comprehensive web scraper for actuarial job listings from multiple sources
    """
    
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

    def scrape_naukri(self, max_pages: int = 5) -> List[Dict]:
        """Scrape jobs from Naukri.com using Playwright (headless browser)"""
        print(f"\n🔍 Scraping Naukri.com for actuarial jobs in {self.location}...")
        jobs = []
        
        if not HAS_PLAYWRIGHT:
            print("  ⚠ Playwright not installed - skipping Naukri")
            print("  Install: pip install playwright && playwright install chromium")
            print(f"✅ Naukri: Found 0 jobs")
            return jobs
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    viewport={'width': 1920, 'height': 1080},
                    locale='en-IN',
                )
                page = context.new_page()
                
                for keyword in self.keywords[:3]:  # Limit keywords
                    for page_num in range(1, min(max_pages + 1, 4)):
                        try:
                            keyword_slug = keyword.replace(' ', '-')
                            url = f"https://www.naukri.com/{keyword_slug}-jobs-in-{self.location.lower()}"
                            if page_num > 1:
                                url += f"-{page_num}"
                            
                            print(f"  📄 Loading: {keyword} (page {page_num})...")
                            page.goto(url, wait_until='networkidle', timeout=30000)
                            
                            # Wait for job cards to render
                            try:
                                page.wait_for_selector('.srp-jobtuple-wrapper, .cust-job-tuple, [class*="jobTuple"]', timeout=10000)
                            except Exception:
                                print(f"    ⚠ No job cards found for '{keyword}' page {page_num}")
                                break
                            
                            # Scroll down to load more
                            for _ in range(3):
                                page.evaluate('window.scrollBy(0, 800)')
                                time.sleep(0.5)
                            
                            # Get job cards
                            cards = page.query_selector_all('.srp-jobtuple-wrapper, .cust-job-tuple, [class*="jobTuple"]')
                            
                            if not cards:
                                break
                            
                            for card in cards:
                                try:
                                    # Extract title
                                    title_el = card.query_selector('a.title, a[class*="title"], .title')
                                    title = title_el.inner_text().strip() if title_el else None
                                    
                                    if not title:
                                        continue
                                    
                                    # Extract company
                                    comp_el = card.query_selector('a.subTitle, a[class*="comp-name"], .comp-name, .companyInfo a')
                                    company = comp_el.inner_text().strip() if comp_el else "Unknown Company"
                                    
                                    # Extract location
                                    loc_el = card.query_selector('.locWdth, .loc-wrap, .location, [class*="location"]')
                                    loc = loc_el.inner_text().strip() if loc_el else self.location
                                    
                                    # Extract experience
                                    exp_el = card.query_selector('.expwdth, .exp-wrap, .experience, [class*="experience"]')
                                    experience = exp_el.inner_text().strip() if exp_el else ""
                                    
                                    # Extract salary
                                    sal_el = card.query_selector('.sal-wrap, .salary, [class*="salary"]')
                                    salary_text = sal_el.inner_text().strip() if sal_el else ""
                                    
                                    # Extract description snippet
                                    desc_el = card.query_selector('.job-desc, .job-description, [class*="job-desc"]')
                                    desc_text = desc_el.inner_text().strip() if desc_el else f"{title} at {company}"
                                    
                                    # Extract link
                                    link_el = card.query_selector('a.title, a[class*="title"]')
                                    job_link = link_el.get_attribute('href') if link_el else url
                                    if job_link and not job_link.startswith('http'):
                                        job_link = f"https://www.naukri.com{job_link}"
                                    
                                    job_id = self.generate_job_id(title, company, loc)
                                    if job_id in self.seen_ids:
                                        continue
                                    self.seen_ids.add(job_id)
                                    
                                    full_text = f"{title} {desc_text} {experience} {salary_text}"
                                    location = self._enhance_location(loc, title, full_text)
                                    
                                    job = {
                                        'id': job_id,
                                        'title': title,
                                        'company': company,
                                        'location': location,
                                        'description': desc_text[:500],
                                        'url': job_link,
                                        'source': 'Naukri',
                                        'jobType': self.determine_job_type(title, full_text),
                                        'experienceLevel': self.determine_experience_level(title, full_text),
                                        'skills': self.extract_skills(full_text),
                                        'qualifications': [],
                                        'certifications': self.extract_certifications(full_text),
                                        'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                        'featured': False
                                    }
                                    
                                    salary = self.extract_salary(salary_text + " " + desc_text)
                                    if salary:
                                        job['salary'] = salary
                                    
                                    jobs.append(job)
                                    print(f"  ✓ Found: {title} at {company} - {location}")
                                    
                                except Exception as e:
                                    continue
                            
                            time.sleep(random.uniform(2, 4))
                            
                        except Exception as e:
                            print(f"  ✗ Error on Naukri page {page_num}: {str(e)}")
                            continue
                
                browser.close()
                
        except Exception as e:
            print(f"  ✗ Naukri scraper error: {str(e)}")
        
        print(f"✅ Naukri: Found {len(jobs)} jobs")
        return jobs
    
    def scrape_indeed_india(self, max_pages: int = 3) -> List[Dict]:
        """Scrape jobs from Indeed India using Playwright (headless browser)"""
        print(f"\n🔍 Scraping Indeed India for actuarial jobs in {self.location}...")
        jobs = []
        
        if not HAS_PLAYWRIGHT:
            print("  ⚠ Playwright not installed - skipping Indeed")
            print("  Install: pip install playwright && playwright install chromium")
            print(f"✅ Indeed India: Found 0 jobs")
            return jobs
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    viewport={'width': 1920, 'height': 1080},
                    locale='en-IN',
                )
                page = context.new_page()
                
                for keyword in self.keywords[:3]:
                    for page_num in range(max_pages):
                        try:
                            url = f"https://in.indeed.com/jobs?q={keyword.replace(' ', '+')}&l={self.location}&start={page_num * 10}"
                            
                            print(f"  📄 Loading: {keyword} (page {page_num + 1})...")
                            page.goto(url, wait_until='domcontentloaded', timeout=30000)
                            
                            # Wait for content
                            try:
                                page.wait_for_selector('.job_seen_beacon, .resultContent, [class*="result"]', timeout=10000)
                            except Exception:
                                print(f"    ⚠ No job cards found for '{keyword}' page {page_num + 1}")
                                break
                            
                            # Scroll to load
                            for _ in range(3):
                                page.evaluate('window.scrollBy(0, 600)')
                                time.sleep(0.3)
                            
                            cards = page.query_selector_all('.job_seen_beacon, .resultContent')
                            
                            if not cards:
                                break
                            
                            for card in cards:
                                try:
                                    title_el = card.query_selector('h2.jobTitle a, h2.jobTitle span, .jobTitle')
                                    title = title_el.inner_text().strip() if title_el else None
                                    
                                    if not title:
                                        continue
                                    
                                    comp_el = card.query_selector('[data-testid="company-name"], .companyName')
                                    company = comp_el.inner_text().strip() if comp_el else "Unknown Company"
                                    
                                    loc_el = card.query_selector('[data-testid="text-location"], .companyLocation')
                                    loc = loc_el.inner_text().strip() if loc_el else self.location
                                    
                                    link_el = card.query_selector('h2.jobTitle a, a[href*="/viewjob"], a[href*="clk"]')
                                    job_link = link_el.get_attribute('href') if link_el else url
                                    if job_link and job_link.startswith('/'):
                                        job_link = f"https://in.indeed.com{job_link}"
                                    
                                    snippet_el = card.query_selector('.job-snippet, [class*="snippet"]')
                                    snippet = snippet_el.inner_text().strip() if snippet_el else ""
                                    
                                    job_id = self.generate_job_id(title, company, loc)
                                    if job_id in self.seen_ids:
                                        continue
                                    self.seen_ids.add(job_id)
                                    
                                    description = snippet or f"{title} at {company}"
                                    full_text = f"{title} {description}"
                                    location = self._enhance_location(loc, title, full_text)
                                    
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
                                        'qualifications': [],
                                        'certifications': self.extract_certifications(full_text),
                                        'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                        'featured': False
                                    }
                                    
                                    jobs.append(job)
                                    print(f"  ✓ Found: {title} at {company} - {location}")
                                    
                                except Exception as e:
                                    continue
                            
                            time.sleep(random.uniform(2, 4))
                            
                        except Exception as e:
                            print(f"  ✗ Error on Indeed page {page_num + 1}: {str(e)}")
                            continue
                
                browser.close()
                
        except Exception as e:
            print(f"  ✗ Indeed scraper error: {str(e)}")
        
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
                        
                        # --- Fetch the full job description ---
                        description = f"{title} position at {company}"
                        job_skills = []
                        job_certs = []
                        detail_location = location  # Start with search page location
                        
                        try:
                            time.sleep(random.uniform(1, 2))
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
                                    job_skills = self.extract_skills(description)
                                    job_certs = self.extract_certifications(description)
                                else:
                                    job_skills = self.extract_skills(f"{title} {company}")
                            else:
                                job_skills = self.extract_skills(f"{title} {company}")
                        except Exception as detail_err:
                            print(f"    ⚠ Could not fetch details for {title}: {str(detail_err)}")
                            job_skills = self.extract_skills(f"{title} {company}")
                        
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
                            'skills': job_skills,
                            'qualifications': [],
                            'certifications': job_certs,
                            'posted_date': datetime.now().strftime('%Y-%m-%d'),
                            'featured': True
                        }
                        
                        jobs.append(job)
                        skills_str = ', '.join(job_skills) if job_skills else 'none detected'
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