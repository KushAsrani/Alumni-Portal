import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

interface Job {
  title: string;
  company: string;
  location: string;
  salary?: string;
  description: string;
  url: string;
  postedDate?: string;
  jobType?: string;
  experienceLevel?: string;
  source: string;
}

class ActuarialJobScraper {
  private jobs: Job[] = [];
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  // Scrape from Indeed
  async scrapeIndeed(query: string = 'actuarial', location: string = '') {
    console.log('🔍 Scraping Indeed for actuarial jobs...');
    
    try {
      const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });

      const html = await response.text();
      const $ = cheerio.load(html);

      $('.job_seen_beacon').each((i, element) => {
        const $job = $(element);
        
        const title = $job.find('.jobTitle').text().trim();
        const company = $job.find('.companyName').text().trim();
        const location = $job.find('.companyLocation').text().trim();
        const salary = $job.find('.salary-snippet').text().trim();
        const description = $job.find('.job-snippet').text().trim();
        const jobUrl = $job.find('.jcs-JobTitle').attr('href');
        const postedDate = $job.find('.date').text().trim();

        if (title && company) {
          this.jobs.push({
            title,
            company,
            location,
            salary: salary || undefined,
            description,
            url: jobUrl ? `https://www.indeed.com${jobUrl}` : url,
            postedDate: postedDate || undefined,
            source: 'Indeed'
          });
        }
      });

      console.log(`✅ Found ${this.jobs.length} jobs on Indeed`);
    } catch (error) {
      console.error('❌ Error scraping Indeed:', error);
    }
  }

  // Scrape from LinkedIn (requires authentication for full access)
  async scrapeLinkedIn(keywords: string = 'actuarial') {
    console.log('🔍 Scraping LinkedIn for actuarial jobs...');
    
    try {
      // Note: LinkedIn heavily restricts scraping. This is a basic example.
      // For production, use LinkedIn API with proper authentication
      
      const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });

      const html = await response.text();
      const $ = cheerio.load(html);

      $('.base-card').each((i, element) => {
        const $job = $(element);
        
        const title = $job.find('.base-search-card__title').text().trim();
        const company = $job.find('.base-search-card__subtitle').text().trim();
        const location = $job.find('.job-search-card__location').text().trim();
        const jobUrl = $job.find('a').attr('href');

        if (title && company) {
          this.jobs.push({
            title,
            company,
            location,
            description: '',
            url: jobUrl || url,
            source: 'LinkedIn'
          });
        }
      });

      console.log(`✅ Found ${this.jobs.length} total jobs`);
    } catch (error) {
      console.error('❌ Error scraping LinkedIn:', error);
    }
  }

  // Scrape from Glassdoor
  async scrapeGlassdoor(keyword: string = 'actuarial') {
    console.log('🔍 Scraping Glassdoor for actuarial jobs...');
    
    try {
      const url = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(keyword)}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });

      const html = await response.text();
      const $ = cheerio.load(html);

      $('[data-test="job-listing"]').each((i, element) => {
        const $job = $(element);
        
        const title = $job.find('[data-test="job-title"]').text().trim();
        const company = $job.find('[data-test="employer-name"]').text().trim();
        const location = $job.find('[data-test="job-location"]').text().trim();
        const salary = $job.find('[data-test="detailSalary"]').text().trim();

        if (title && company) {
          this.jobs.push({
            title,
            company,
            location,
            salary: salary || undefined,
            description: '',
            url: url,
            source: 'Glassdoor'
          });
        }
      });

      console.log(`✅ Found ${this.jobs.length} total jobs`);
    } catch (error) {
      console.error('❌ Error scraping Glassdoor:', error);
    }
  }

  // Scrape from SimplyHired
  async scrapeSimplyHired(query: string = 'actuarial') {
    console.log('🔍 Scraping SimplyHired for actuarial jobs...');
    
    try {
      const url = `https://www.simplyhired.com/search?q=${encodeURIComponent(query)}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });

      const html = await response.text();
      const $ = cheerio.load(html);

      $('[data-testid="searchSerpJob"]').each((i, element) => {
        const $job = $(element);
        
        const title = $job.find('[data-testid="jobTitle"]').text().trim();
        const company = $job.find('[data-testid="companyName"]').text().trim();
        const location = $job.find('[data-testid="searchSerpJobLocation"]').text().trim();
        const salary = $job.find('[data-testid="searchSerpJobSalaryEst"]').text().trim();
        const description = $job.find('[data-testid="searchSerpJobSnippet"]').text().trim();

        if (title && company) {
          this.jobs.push({
            title,
            company,
            location,
            salary: salary || undefined,
            description,
            url: url,
            source: 'SimplyHired'
          });
        }
      });

      console.log(`✅ Found ${this.jobs.length} total jobs`);
    } catch (error) {
      console.error('❌ Error scraping SimplyHired:', error);
    }
  }

  // Scrape from remote job boards (for remote actuarial positions)
  async scrapeRemoteJobs() {
    console.log('🔍 Scraping remote job boards...');
    
    try {
      // We Work Remotely
      const url = 'https://weworkremotely.com/remote-jobs/search?term=actuarial';
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
        }
      });

      const html = await response.text();
      const $ = cheerio.load(html);

      $('li.feature').each((i, element) => {
        const $job = $(element);
        
        const title = $job.find('.title').text().trim();
        const company = $job.find('.company').text().trim();
        const location = 'Remote';
        const jobUrl = $job.find('a').attr('href');

        if (title && company) {
          this.jobs.push({
            title,
            company,
            location,
            description: '',
            url: jobUrl ? `https://weworkremotely.com${jobUrl}` : url,
            jobType: 'Remote',
            source: 'WeWorkRemotely'
          });
        }
      });

      console.log(`✅ Found ${this.jobs.length} total jobs`);
    } catch (error) {
      console.error('❌ Error scraping remote jobs:', error);
    }
  }

  // Filter jobs by keywords
  filterByKeywords(keywords: string[]): Job[] {
    return this.jobs.filter(job => {
      const searchText = `${job.title} ${job.description}`.toLowerCase();
      return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    });
  }

  // Get unique jobs (remove duplicates)
  getUniqueJobs(): Job[] {
    const seen = new Set();
    return this.jobs.filter(job => {
      const key = `${job.title}-${job.company}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Export to JSON
  exportToJSON(filename: string = 'actuarial-jobs.json') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    // Ensure data directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    fs.writeFileSync(outputPath, JSON.stringify(uniqueJobs, null, 2));
    
    console.log(`\n📁 Exported ${uniqueJobs.length} unique jobs to ${filename}`);
    return uniqueJobs;
  }

  // Export to CSV
  exportToCSV(filename: string = 'actuarial-jobs.csv') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    
    // CSV Headers
    const headers = ['Title', 'Company', 'Location', 'Salary', 'Description', 'URL', 'Posted Date', 'Job Type', 'Source'];
    
    // CSV Rows
    const rows = uniqueJobs.map(job => [
      this.escapeCSV(job.title),
      this.escapeCSV(job.company),
      this.escapeCSV(job.location),
      this.escapeCSV(job.salary || ''),
      this.escapeCSV(job.description),
      this.escapeCSV(job.url),
      this.escapeCSV(job.postedDate || ''),
      this.escapeCSV(job.jobType || ''),
      this.escapeCSV(job.source)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    fs.writeFileSync(outputPath, csv);
    
    console.log(`📁 Exported ${uniqueJobs.length} unique jobs to ${filename}`);
    return uniqueJobs;
  }

  // Helper: Escape CSV values
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  // Display summary
  displaySummary() {
    const uniqueJobs = this.getUniqueJobs();
    
    console.log('\n📊 Scraping Summary:');
    console.log('═══════════════════════════════════════');
    console.log(`Total jobs found: ${uniqueJobs.length}`);
    
    // By source
    const bySource = uniqueJobs.reduce((acc, job) => {
      acc[job.source] = (acc[job.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\nBy Source:');
    Object.entries(bySource).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });

    // By location (top 5)
    const byLocation = uniqueJobs.reduce((acc, job) => {
      acc[job.location] = (acc[job.location] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\nTop Locations:');
    Object.entries(byLocation)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([location, count]) => {
        console.log(`  ${location}: ${count}`);
      });

    console.log('═══════════════════════════════════════\n');
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Actuarial Job Scraper...\n');

  const scraper = new ActuarialJobScraper();

  // Scrape from multiple sources
  await scraper.scrapeIndeed('actuarial');
  await scraper.scrapeIndeed('actuary');
  await scraper.scrapeSimplyHired('actuarial');
  await scraper.scrapeRemoteJobs();
  
  // You can add location-specific searches
  // await scraper.scrapeIndeed('actuarial', 'New York, NY');
  // await scraper.scrapeIndeed('actuarial', 'Chicago, IL');

  // Display summary
  scraper.displaySummary();

  // Export results
  scraper.exportToJSON();
  scraper.exportToCSV();

  // Filter for specific keywords (optional)
  const seniorJobs = scraper.filterByKeywords(['senior', 'lead', 'principal']);
  console.log(`\n🎯 Found ${seniorJobs.length} senior-level positions`);

  console.log('\n✅ Scraping completed!');
}

// Run the scraper
main().catch(console.error);