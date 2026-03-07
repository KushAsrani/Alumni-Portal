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
        """Scrape jobs from Naukri.com (India's top job portal)"""
        print(f"\n🔍 Scraping Naukri.com for actuarial jobs in {self.location}...")
        jobs = []
        
        for keyword in self.keywords:
            for page in range(1, max_pages + 1):
                try:
                    # Updated Naukri URL format (2025+)
                    keyword_slug = keyword.replace(' ', '-')
                    url = f"https://www.naukri.com/{keyword_slug}-jobs-in-{self.location.lower()}"
                    
                    params = {'k': keyword, 'l': self.location}
                    if page > 1:
                        params['pageNo'] = page
                    
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Referer': 'https://www.naukri.com/',
                    }
                    
                    response = self.session.get(url, params=params, headers=headers, timeout=15)
                    response.raise_for_status()
                    
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    # Updated Naukri selectors (2025+ layout)
                    # Try multiple possible selectors
                    job_cards = (
                        soup.find_all('div', class_='srp-jobtuple-wrapper') or
                        soup.find_all('div', class_='cust-job-tuple') or
                        soup.find_all('article', class_='jobTuple') or  # Legacy fallback
                        soup.find_all('div', {'class': lambda c: c and 'jobTuple' in str(c)})
                    )
                    
                    if not job_cards:
                        # Try finding jobs via data attribute or script tags
                        script_tags = soup.find_all('script', type='application/ld+json')
                        for script in script_tags:
                            try:
                                data = json.loads(script.string)
                                if isinstance(data, dict) and data.get('@type') == 'JobPosting':
                                    title = data.get('title', '')
                                    company = data.get('hiringOrganization', {}).get('name', 'Unknown')
                                    loc = data.get('jobLocation', [{}])
                                    if isinstance(loc, list) and loc:
                                        location = loc[0].get('address', {}).get('addressLocality', self.location)
                                    else:
                                        location = self.location
                                    description = data.get('description', f"{title} at {company}")
                                    job_url = data.get('url', url)
                                    
                                    job_id = self.generate_job_id(title, company, location)
                                    if job_id in self.seen_ids:
                                        continue
                                    self.seen_ids.add(job_id)
                                    
                                    full_text = f"{title} {description}"
                                    
                                    job = {
                                        'id': job_id,
                                        'title': title,
                                        'company': company,
                                        'location': location,
                                        'description': description[:500],
                                        'url': job_url,
                                        'source': 'Naukri',
                                        'jobType': self.determine_job_type(title, full_text),
                                        'experienceLevel': self.determine_experience_level(title, full_text),
                                        'skills': self.extract_skills(description),
                                        'qualifications': [],
                                        'certifications': self.extract_certifications(description),
                                        'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                        'featured': False
                                    }
                                    
                                    salary = self.extract_salary(description)
                                    if salary:
                                        job['salary'] = salary
                                    
                                    jobs.append(job)
                                    print(f"  ✓ Found: {title} at {company} - {location}")
                                    
                                elif isinstance(data, list):
                                    for item in data:
                                        if isinstance(item, dict) and item.get('@type') == 'JobPosting':
                                            title = item.get('title', '')
                                            company = item.get('hiringOrganization', {}).get('name', 'Unknown')
                                            description = item.get('description', f"{title} at {company}")
                                            job_url = item.get('url', url)
                                            
                                            job_id = self.generate_job_id(title, company, self.location)
                                            if job_id in self.seen_ids:
                                                continue
                                            self.seen_ids.add(job_id)
                                            
                                            full_text = f"{title} {description}"
                                            
                                            job = {
                                                'id': job_id,
                                                'title': title,
                                                'company': company,
                                                'location': self.location,
                                                'description': description[:500],
                                                'url': job_url,
                                                'source': 'Naukri',
                                                'jobType': self.determine_job_type(title, full_text),
                                                'experienceLevel': self.determine_experience_level(title, full_text),
                                                'skills': self.extract_skills(description),
                                                'qualifications': [],
                                                'certifications': self.extract_certifications(description),
                                                'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                                'featured': False
                                            }
                                            
                                            salary = self.extract_salary(description)
                                            if salary:
                                                job['salary'] = salary
                                            
                                            jobs.append(job)
                                            print(f"  ✓ Found: {title} at {company}")
                            except (json.JSONDecodeError, TypeError):
                                continue
                        
                        if not jobs:
                            break
                    else:
                        for card in job_cards:
                            try:
                                # Updated selectors for modern Naukri
                                title_elem = (
                                    card.find('a', class_='title') or
                                    card.find('a', class_='job-title') or
                                    card.find('a', {'class': lambda c: c and 'title' in str(c)})
                                )
                                title = self.clean_text(title_elem.get_text()) if title_elem else None
                                
                                company_elem = (
                                    card.find('a', class_='subTitle') or
                                    card.find('a', class_='comp-name') or
                                    card.find('span', class_='comp-name')
                                )
                                company = self.clean_text(company_elem.get_text()) if company_elem else "Unknown Company"
                                
                                location_elem = (
                                    card.find('li', class_='location') or
                                    card.find('span', class_='locWdth') or
                                    card.find('span', class_='loc-wrap')
                                )
                                location = self.clean_text(location_elem.get_text()) if location_elem else self.location
                                
                                desc_elem = (
                                    card.find('div', class_='job-description') or
                                    card.find('div', class_='job-desc')
                                )
                                description = self.clean_text(desc_elem.get_text()) if desc_elem else f"{title} at {company}"
                                
                                job_link = title_elem['href'] if title_elem and title_elem.get('href') else url
                                if not job_link.startswith('http'):
                                    job_link = f"https://www.naukri.com{job_link}"
                                
                                if not title:
                                    continue
                                
                                job_id = self.generate_job_id(title, company, location)
                                if job_id in self.seen_ids:
                                    continue
                                self.seen_ids.add(job_id)
                                
                                full_text = f"{title} {description}"
                                
                                job = {
                                    'id': job_id,
                                    'title': title,
                                    'company': company,
                                    'location': location,
                                    'description': description[:500],
                                    'url': job_link,
                                    'source': 'Naukri',
                                    'jobType': self.determine_job_type(title, full_text),
                                    'experienceLevel': self.determine_experience_level(title, full_text),
                                    'skills': self.extract_skills(description),
                                    'qualifications': [],
                                    'certifications': self.extract_certifications(description),
                                    'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                    'featured': False
                                }
                                
                                salary_elem = card.find('li', class_='salary') or card.find('span', class_='sal-wrap')
                                salary_text = self.clean_text(salary_elem.get_text()) if salary_elem else ""
                                salary = self.extract_salary(salary_text + " " + description)
                                if salary:
                                    job['salary'] = salary
                                
                                jobs.append(job)
                                print(f"  ✓ Found: {title} at {company} - {location}")
                                
                            except Exception as e:
                                continue
                    
                    time.sleep(random.uniform(2, 4))
                    
                except Exception as e:
                    print(f"  ✗ Error scraping Naukri page {page}: {str(e)}")
                    continue
        
        print(f"✅ Naukri: Found {len(jobs)} jobs")
        return jobs

    def scrape_indeed_india(self, max_pages: int = 3) -> List[Dict]:
        """Scrape jobs from Indeed India"""
        print(f"\n🔍 Scraping Indeed India for actuarial jobs in {self.location}...")
        jobs = []
        
        for keyword in self.keywords[:3]:  # Limit keywords
            for page in range(max_pages):
                try:
                    params = {
                        'q': keyword,
                        'l': self.location,
                        'start': page * 10
                    }
                    
                    url = f"https://in.indeed.com/jobs?{urlencode(params)}"
                    
                    # Enhanced headers to avoid 403
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1',
                        'Referer': 'https://www.google.com/',
                    }
                    
                    # Use a fresh session for each Indeed request
                    indeed_session = requests.Session()
                    
                    # First visit the homepage to get cookies
                    if page == 0:
                        try:
                            indeed_session.get('https://in.indeed.com/', headers=headers, timeout=10)
                            time.sleep(random.uniform(1, 2))
                        except Exception:
                            pass
                    
                    response = indeed_session.get(url, headers=headers, timeout=15)
                    
                    if response.status_code == 403:
                        print(f"  ⚠ Indeed blocked request (403) - trying alternate approach...")
                        # Try with different URL format
                        alt_url = f"https://in.indeed.com/jobs?q={keyword.replace(' ', '+')}&l={self.location}"
                        time.sleep(random.uniform(3, 5))
                        response = indeed_session.get(alt_url, headers=headers, timeout=15)
                    
                    if response.status_code != 200:
                        print(f"  ✗ Indeed returned status {response.status_code} for keyword '{keyword}' page {page}")
                        continue
                    
                    response.raise_for_status()
                    
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    # Indeed job cards (multiple selector patterns)
                    job_cards = (
                        soup.find_all('div', class_='job_seen_beacon') or
                        soup.find_all('div', class_='jobsearch-ResultsList') or
                        soup.find_all('td', class_='resultContent') or
                        soup.find_all('div', {'class': lambda c: c and 'result' in str(c).lower()})
                    )
                    
                    # Also try extracting from script tags (Indeed embeds data as JSON)
                    if not job_cards:
                        script_tags = soup.find_all('script', type='application/ld+json')
                        for script in script_tags:
                            try:
                                data = json.loads(script.string)
                                items = data if isinstance(data, list) else [data]
                                for item in items:
                                    if isinstance(item, dict) and item.get('@type') == 'JobPosting':
                                        title = item.get('title', '')
                                        company = item.get('hiringOrganization', {}).get('name', 'Unknown')
                                        description = item.get('description', f"{title} at {company}")
                                        
                                        loc_data = item.get('jobLocation', [{}])
                                        if isinstance(loc_data, list) and loc_data:
                                            location = loc_data[0].get('address', {}).get('addressLocality', self.location)
                                        else:
                                            location = self.location
                                        
                                        job_url = item.get('url', url)
                                        
                                        job_id = self.generate_job_id(title, company, location)
                                        if job_id in self.seen_ids:
                                            continue
                                        self.seen_ids.add(job_id)
                                        
                                        full_text = f"{title} {description}"
                                        
                                        job = {
                                            'id': job_id,
                                            'title': title,
                                            'company': company,
                                            'location': location,
                                            'description': description[:500],
                                            'url': job_url,
                                            'source': 'Indeed',
                                            'jobType': self.determine_job_type(title, full_text),
                                            'experienceLevel': self.determine_experience_level(title, full_text),
                                            'skills': self.extract_skills(description),
                                            'qualifications': [],
                                            'certifications': self.extract_certifications(description),
                                            'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                            'featured': False
                                        }
                                        
                                        salary = self.extract_salary(description)
                                        if salary:
                                            job['salary'] = salary
                                        
                                        jobs.append(job)
                                        print(f"  ✓ Found: {title} at {company}")
                            except (json.JSONDecodeError, TypeError):
                                continue
                    else:
                        for card in job_cards:
                            try:
                                title_elem = (
                                    card.find('h2', class_='jobTitle') or
                                    card.find('a', {'class': lambda c: c and 'title' in str(c).lower()})
                                )
                                title = self.clean_text(title_elem.get_text()) if title_elem else None
                                
                                company_elem = (
                                    card.find('span', class_='companyName') or
                                    card.find('span', {'data-testid': 'company-name'})
                                )
                                company = self.clean_text(company_elem.get_text()) if company_elem else "Unknown Company"
                                
                                location_elem = (
                                    card.find('div', class_='companyLocation') or
                                    card.find('span', {'data-testid': 'text-location'})
                                )
                                location = self.clean_text(location_elem.get_text()) if location_elem else self.location
                                
                                link_elem = card.find('a', href=True)
                                job_link = link_elem['href'] if link_elem else url
                                if job_link.startswith('/'):
                                    job_link = f"https://in.indeed.com{job_link}"
                                
                                snippet_elem = card.find('div', class_='job-snippet')
                                snippet = self.clean_text(snippet_elem.get_text()) if snippet_elem else ""
                                
                                if not title:
                                    continue
                                
                                job_id = self.generate_job_id(title, company, location)
                                if job_id in self.seen_ids:
                                    continue
                                self.seen_ids.add(job_id)
                                
                                description = snippet or f"{title} at {company}"
                                full_text = f"{title} {description}"
                                
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
                                    'skills': self.extract_skills(description),
                                    'qualifications': [],
                                    'certifications': self.extract_certifications(description),
                                    'posted_date': datetime.now().strftime('%Y-%m-%d'),
                                    'featured': False
                                }
                                
                                jobs.append(job)
                                print(f"  ✓ Found: {title} at {company} - {location}")
                                
                            except Exception as e:
                                continue
                    
                    time.sleep(random.uniform(2, 4))
                    
                except Exception as e:
                    print(f"  ✗ Error scraping Indeed page {page}: {str(e)}")
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
                        
                        # --- NEW: Fetch the full job description ---
                        description = f"{title} position at {company}"
                        job_skills = []
                        job_certs = []
                        
                        try:
                            time.sleep(random.uniform(1, 2))  # Be polite
                            detail_response = self.session.get(job_link, timeout=15)
                            if detail_response.status_code == 200:
                                detail_soup = BeautifulSoup(detail_response.content, 'html.parser')
                                
                                # LinkedIn job detail page description selectors
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
                                    # Fallback: extract skills from title + company
                                    job_skills = self.extract_skills(f"{title} {company}")
                            else:
                                job_skills = self.extract_skills(f"{title} {company}")
                        except Exception as detail_err:
                            print(f"    ⚠ Could not fetch details for {title}: {str(detail_err)}")
                            job_skills = self.extract_skills(f"{title} {company}")
                        
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