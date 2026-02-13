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
    Configured for India with INR currency
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
        """Extract technical skills from job description"""
        skills_keywords = [
            'excel', 'vba', 'sql', 'python', 'r', 'sas', 'stata',
            'tableau', 'power bi', 'powerbi', 'access', 'matlab',
            'c++', 'java', 'javascript', 'hadoop', 'spark',
            'azure', 'aws', 'gcp', 'machine learning', 'ai',
            'prophet', 'moses', 'emblem', 'axis', 'igloo'
        ]
        
        description_lower = description.lower()
        found_skills = []
        
        for skill in skills_keywords:
            if skill in description_lower:
                # Capitalize properly
                if skill in ['sql', 'vba', 'sas', 'aws', 'gcp', 'ai']:
                    found_skills.append(skill.upper())
                elif skill == 'r':
                    found_skills.append('R')
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
                    # Naukri URL format
                    params = {
                        'k': keyword,
                        'l': self.location,
                        'page': page
                    }
                    
                    url = f"https://www.naukri.com/{keyword.replace(' ', '-')}-jobs-in-{self.location.lower()}?{urlencode(params)}"
                    
                    response = self.session.get(url, timeout=15)
                    response.raise_for_status()
                    
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    # Naukri job cards
                    job_cards = soup.find_all('article', class_='jobTuple')
                    
                    if not job_cards:
                        break
                    
                    for card in job_cards:
                        try:
                            title_elem = card.find('a', class_='title')
                            title = self.clean_text(title_elem.get_text()) if title_elem else None
                            
                            company_elem = card.find('a', class_='subTitle')
                            company = self.clean_text(company_elem.get_text()) if company_elem else "Unknown Company"
                            
                            location_elem = card.find('li', class_='location')
                            location = self.clean_text(location_elem.get_text()) if location_elem else self.location
                            
                            exp_elem = card.find('li', class_='experience')
                            experience = self.clean_text(exp_elem.get_text()) if exp_elem else ""
                            
                            salary_elem = card.find('li', class_='salary')
                            salary_text = self.clean_text(salary_elem.get_text()) if salary_elem else ""
                            
                            desc_elem = card.find('div', class_='job-description')
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
                            
                            # Build job object
                            full_text = f"{title} {description} {experience} {salary_text}"
                            
                            job = {
                                'id': job_id,
                                'title': title,
                                'company': company,
                                'location': location,
                                'description': description,
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
                            
                            # Extract salary
                            salary = self.extract_salary(salary_text + " " + description)
                            if salary:
                                job['salary'] = salary
                            
                            jobs.append(job)
                            print(f"  ✓ Found: {title} at {company} - {location}")
                            
                        except Exception as e:
                            print(f"  ✗ Error parsing job card: {str(e)}")
                            continue
                    
                    # Rate limiting
                    time.sleep(random.uniform(2, 4))
                    
                except Exception as e:
                    print(f"  ✗ Error scraping Naukri page {page}: {str(e)}")
                    continue
        
        print(f"✅ Naukri: Found {len(jobs)} jobs")
        return jobs
    
    def scrape_indeed_india(self, max_pages: int = 5) -> List[Dict]:
        """Scrape jobs from Indeed India"""
        print(f"\n🔍 Scraping Indeed India for actuarial jobs in {self.location}...")
        jobs = []
        
        for keyword in self.keywords:
            for page in range(max_pages):
                try:
                    params = {
                        'q': keyword,
                        'l': self.location,
                        'start': page * 10
                    }
                    
                    url = f"https://in.indeed.com/jobs?{urlencode(params)}"
                    
                    response = self.session.get(url, timeout=15)
                    response.raise_for_status()
                    
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    job_cards = soup.find_all('div', class_='job_seen_beacon')
                    
                    for card in job_cards:
                        try:
                            title_elem = card.find('h2', class_='jobTitle')
                            title = self.clean_text(title_elem.get_text()) if title_elem else None
                            
                            company_elem = card.find('span', {'data-testid': 'company-name'})
                            company = self.clean_text(company_elem.get_text()) if company_elem else "Unknown Company"
                            
                            location_elem = card.find('div', {'data-testid': 'text-location'})
                            location = self.clean_text(location_elem.get_text()) if location_elem else self.location
                            
                            link_elem = title_elem.find('a') if title_elem else None
                            job_link = f"https://in.indeed.com{link_elem['href']}" if link_elem and link_elem.get('href') else url
                            
                            desc_elem = card.find('div', class_='job-snippet')
                            description = self.clean_text(desc_elem.get_text()) if desc_elem else ""
                            
                            salary_elem = card.find('div', class_='salary-snippet')
                            salary_text = self.clean_text(salary_elem.get_text()) if salary_elem else ""
                            
                            if not title:
                                continue
                            
                            job_id = self.generate_job_id(title, company, location)
                            
                            if job_id in self.seen_ids:
                                continue
                            
                            self.seen_ids.add(job_id)
                            
                            full_text = f"{title} {description} {salary_text}"
                            
                            job = {
                                'id': job_id,
                                'title': title,
                                'company': company,
                                'location': location,
                                'description': description or f"{title} at {company}",
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
                            
                            salary = self.extract_salary(salary_text + " " + description)
                            if salary:
                                job['salary'] = salary
                            
                            jobs.append(job)
                            print(f"  ✓ Found: {title} at {company}")
                            
                        except Exception as e:
                            print(f"  ✗ Error parsing job card: {str(e)}")
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
                        
                        job = {
                            'id': job_id,
                            'title': title,
                            'company': company,
                            'location': location,
                            'description': f"{title} position at {company}",
                            'url': job_link,
                            'source': 'LinkedIn',
                            'jobType': self.determine_job_type(title, ""),
                            'experienceLevel': self.determine_experience_level(title, ""),
                            'skills': self.extract_skills(title),
                            'qualifications': [],
                            'certifications': [],
                            'posted_date': datetime.now().strftime('%Y-%m-%d'),
                            'featured': True  # LinkedIn jobs marked as featured
                        }
                        
                        jobs.append(job)
                        print(f"  ✓ Found: {title} at {company}")
                        
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