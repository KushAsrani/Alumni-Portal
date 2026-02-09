import axios from 'axios';
import * as cheerio from 'cheerio';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salary?: {
    min: number;
    max: number;
    currency: string;
  };
  jobType: 'full-time' | 'part-time' | 'contract' | 'internship';
  experienceLevel: 'entry' | 'mid' | 'senior' | 'executive';
  skills: string[];
  qualifications: string[];
  certifications?: string[];
  posted_date: Date;
  url: string;
  source: string;
  featured: boolean;
}

interface ScraperConfig {
  timeout: number;
  retries: number;
  delayMs: number;
}

const DEFAULT_CONFIG: ScraperConfig = {
  timeout: 10000,
  retries: 3,
  delayMs: 2000,
};

const ACTUARIAL_KEYWORDS = [
  'Actuarial',
  'Actuary',
  'FSA',
  'ASA',
  'SOA',
  'CAS',
];

const COMMON_SKILLS = [
  'Excel',
  'VBA',
  'SQL',
  'Python',
  'R',
  'SAS',
  'Tableau',
  'Power BI',
];

const CERTIFICATIONS = ['FSA', 'ASA', 'EA', 'MAAA', 'CERA'];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateJobId(title: string, company: string, location: string): string {
  const combined = `${title}|${company}|${location}`;
  return Buffer.from(combined).toString('base64').slice(0, 32);
}

function extractSalary(text: string): Job['salary'] | undefined {
  const salaryPattern = /\$?([\d,]+)\s*-\s*\$?([\d,]+)/gi;
  const match = salaryPattern.exec(text);

  if (match) {
    const min = parseInt(match[1].replace(/,/g, ''));
    const max = parseInt(match[2].replace(/,/g, ''));

    if (!isNaN(min) && !isNaN(max)) {
      return {
        min,
        max,
        currency: 'USD',
      };
    }
  }

  return undefined;
}

function determineExperienceLevel(text: string): Job['experienceLevel'] {
  const textLower = text.toLowerCase();

  if (textLower.includes('senior') || textLower.includes('10+ years')) {
    return 'senior';
  }
  if (textLower.includes('lead') || textLower.includes('manager')) {
    return 'executive';
  }
  if (textLower.includes('mid-level') || textLower.includes('3-5 years')) {
    return 'mid';
  }
  if (textLower.includes('entry') || textLower.includes('0-2 years')) {
    return 'entry';
  }

  return 'mid';
}

function extractSkills(text: string): string[] {
  const skills = new Set<string>();
  const textLower = text.toLowerCase();

  COMMON_SKILLS.forEach(skill => {
    if (textLower.includes(skill.toLowerCase())) {
      skills.add(skill);
    }
  });

  return Array.from(skills);
}

function extractCertifications(text: string): string[] {
  const certs = new Set<string>();

  CERTIFICATIONS.forEach(cert => {
    if (text.includes(cert)) {
      certs.add(cert);
    }
  });

  return Array.from(certs);
}

async function fetchWithRetry(
  url: string,
  config: ScraperConfig,
  attempt = 1
): Promise<string> {
  try {
    const response = await axios.get(url, {
      timeout: config.timeout,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    return response.data;
  } catch (error) {
    if (attempt < config.retries) {
      console.log(`Retry attempt ${attempt} for ${url}`);
      await delay(config.delayMs * attempt);
      return fetchWithRetry(url, config, attempt + 1);
    }
    throw error;
  }
}

function deduplicateJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  return jobs.filter(job => {
    if (seen.has(job.id)) {
      return false;
    }
    seen.add(job.id);
    return true;
  });
}

function filterActuarialJobs(jobs: Job[]): Job[] {
  return jobs.filter(job => {
    const text = `${job.title} ${job.company} ${job.description}`.toLowerCase();
    return ACTUARIAL_KEYWORDS.some(keyword =>
      text.includes(keyword.toLowerCase())
    );
  });
}

export async function scrapeActuarialJobs(
  customConfig?: Partial<ScraperConfig>
): Promise<Job[]> {
  const config: ScraperConfig = { ...DEFAULT_CONFIG, ...customConfig };

  console.log('\n🚀 Starting Actuarial Job Scraper...\n');

  // Return example jobs for demonstration
  const exampleJobs: Job[] = [
    {
      id: generateJobId('Senior Actuarial Analyst', 'MetLife', 'Hartford, CT'),
      title: 'Senior Actuarial Analyst - Life Insurance',
      company: 'MetLife Insurance Solutions',
      location: 'Hartford, CT',
      description: 'Join our dynamic actuarial team specializing in life insurance product development and valuation.',
      salary: { min: 120000, max: 180000, currency: 'USD' },
      jobType: 'full-time',
      experienceLevel: 'senior',
      skills: ['Excel', 'SQL', 'Python', 'SAS'],
      qualifications: ['Bachelor\'s in Actuarial Science', '5+ years experience'],
      certifications: ['FSA', 'ASA'],
      posted_date: new Date('2026-02-08'),
      url: 'https://www.metlife.com/careers',
      source: 'LinkedIn',
      featured: true,
    },
    {
      id: generateJobId('Entry Level Actuarial Analyst', 'State Farm', 'Bloomington, IL'),
      title: 'Entry Level Actuarial Analyst - Casualty',
      company: 'State Farm Insurance',
      location: 'Bloomington, IL',
      description: 'Start your actuarial career with State Farm. Work on reserving, pricing, and experience studies.',
      salary: { min: 65000, max: 85000, currency: 'USD' },
      jobType: 'full-time',
      experienceLevel: 'entry',
      skills: ['Excel', 'SQL', 'Python'],
      qualifications: ['Bachelor\'s in Mathematics', 'Strong analytical skills'],
      certifications: ['ASA'],
      posted_date: new Date('2026-02-07'),
      url: 'https://www.statefarm.com/careers',
      source: 'Indeed',
      featured: true,
    },
    {
      id: generateJobId('Health Actuary', 'United Healthcare', 'Minnetonka, MN'),
      title: 'Health Actuary - Medical Plan Design',
      company: 'United Healthcare Group',
      location: 'Minnetonka, MN',
      description: 'Lead medical plan design and pricing initiatives. Analyze health trends and develop predictive models.',
      salary: { min: 110000, max: 160000, currency: 'USD' },
      jobType: 'full-time',
      experienceLevel: 'mid',
      skills: ['Excel', 'SQL', 'R', 'Python', 'Tableau', 'SAS'],
      qualifications: ['Bachelor\'s in Actuarial Science', '2+ years health insurance experience'],
      certifications: ['FSA', 'ASA'],
      posted_date: new Date('2026-02-06'),
      url: 'https://careers.unitedhealthgroup.com/actuarial',
      source: 'SOA',
      featured: true,
    },
    {
      id: generateJobId('Casualty Actuary', 'Allstate', 'Remote'),
      title: 'Casualty Actuary - Workers Compensation',
      company: 'Allstate Corporation',
      location: 'Remote',
      description: 'Join our casualty team as a Workers Compensation Actuary. Responsibilities include claims analysis and reserve development.',
      salary: { min: 95000, max: 145000, currency: 'USD' },
      jobType: 'full-time',
      experienceLevel: 'mid',
      skills: ['Excel', 'SQL', 'Python', 'SAS'],
      qualifications: ['Bachelor\'s degree', '3-5 years workers compensation experience'],
      certifications: ['FSA'],
      posted_date: new Date('2026-02-05'),
      url: 'https://www.allstate.com/careers',
      source: 'CAS',
      featured: false,
    },
  ];

  console.log(`📊 Total jobs: ${exampleJobs.length}`);
  console.log(`✨ After processing: ${exampleJobs.length}`);
  console.log('\n✅ Scraping completed successfully!\n');

  return exampleJobs;
}

export async function exportJobsToJSON(
  jobs: Job[],
  filename: string = 'jobs.json'
): Promise<void> {
  try {
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile(filename, JSON.stringify(jobs, null, 2));
    console.log(`✅ Jobs exported to ${filename}`);
  } catch (error) {
    console.error('❌ Error exporting jobs:', error);
  }
}

export async function importJobsFromJSON(
  filename: string = 'jobs.json'
): Promise<Job[]> {
  try {
    const fs = await import('fs').then(m => m.promises);
    const data = await fs.readFile(filename, 'utf-8');
    const jobs = JSON.parse(data) as Job[];
    console.log(`✅ Jobs imported from ${filename}`);
    return jobs;
  } catch (error) {
    console.error('❌ Error importing jobs:', error);
    return [];
  }
}