import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

interface ActuarialJob {
  title: string;
  company: string;
  location: string;
  salary?: string;
  description: string;
  requirements?: string;
  url: string;
  postedDate?: string;
  jobType?: string;
  experienceLevel?: string;
  skills?: string[];
  source: string;
  scrapedAt: string;
}

class AdvancedActuarialScraper {
  private jobs: ActuarialJob[] = [];
  private browser: any;

  async init() {
    console.log('🚀 Launching browser...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  // Scrape Indeed with full page rendering
  async scrapeIndeedAdvanced(searchTerm: string = 'actuarial', location: string = '') {
    console.log(`\n🔍 Scraping Indeed for "${searchTerm}" jobs...`);
    
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(searchTerm)}&l=${encodeURIComponent(location)}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for job cards to load
      await page.waitForSelector('.job_seen_beacon', { timeout: 10000 }).catch(() => {});

      const jobs = await page.evaluate(() => {
        const jobCards = document.querySelectorAll('.job_seen_beacon');
        const results: any[] = [];

        jobCards.forEach((card) => {
          const titleEl = card.querySelector('.jobTitle');
          const companyEl = card.querySelector('.companyName');
          const locationEl = card.querySelector('.companyLocation');
          const salaryEl = card.querySelector('.salary-snippet');
          const snippetEl = card.querySelector('.job-snippet');
          const linkEl = card.querySelector('.jcs-JobTitle');
          const dateEl = card.querySelector('.date');

          if (titleEl && companyEl) {
            results.push({
              title: titleEl.textContent?.trim() || '',
              company: companyEl.textContent?.trim() || '',
              location: locationEl?.textContent?.trim() || '',
              salary: salaryEl?.textContent?.trim() || '',
              description: snippetEl?.textContent?.trim() || '',
              url: linkEl?.getAttribute('href') || '',
              postedDate: dateEl?.textContent?.trim() || ''
            });
          }
        });

        return results;
      });

      jobs.forEach(job => {
        this.jobs.push({
          ...job,
          url: job.url ? `https://www.indeed.com${job.url}` : url,
          source: 'Indeed',
          scrapedAt: new Date().toISOString()
        });
      });

      console.log(`✅ Found ${jobs.length} jobs on Indeed`);
    } catch (error) {
      console.error('❌ Error scraping Indeed:', error);
    } finally {
      await page.close();
    }
  }

  // Scrape LinkedIn Jobs
  async scrapeLinkedInAdvanced(keywords: string = 'actuarial') {
    console.log(`\n🔍 Scraping LinkedIn for "${keywords}" jobs...`);
    
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=Worldwide`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Scroll to load more jobs
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      await page.waitForTimeout(2000);

      const jobs = await page.evaluate(() => {
        const jobCards = document.querySelectorAll('.base-card');
        const results: any[] = [];

        jobCards.forEach((card) => {
          const titleEl = card.querySelector('.base-search-card__title');
          const companyEl = card.querySelector('.base-search-card__subtitle');
          const locationEl = card.querySelector('.job-search-card__location');
          const linkEl = card.querySelector('a');
          const dateEl = card.querySelector('time');

          if (titleEl && companyEl) {
            results.push({
              title: titleEl.textContent?.trim() || '',
              company: companyEl.textContent?.trim() || '',
              location: locationEl?.textContent?.trim() || '',
              url: linkEl?.getAttribute('href') || '',
              postedDate: dateEl?.getAttribute('datetime') || ''
            });
          }
        });

        return results;
      });

      jobs.forEach(job => {
        this.jobs.push({
          ...job,
          description: '',
          source: 'LinkedIn',
          scrapedAt: new Date().toISOString()
        });
      });

      console.log(`✅ Found ${jobs.length} jobs on LinkedIn`);
    } catch (error) {
      console.error('❌ Error scraping LinkedIn:', error);
    } finally {
      await page.close();
    }
  }

  // Scrape Glassdoor
  async scrapeGlassdoorAdvanced(keyword: string = 'actuarial') {
    console.log(`\n🔍 Scraping Glassdoor for "${keyword}" jobs...`);
    
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const url = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(keyword)}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      await page.waitForSelector('[data-test="job-listing"]', { timeout: 10000 }).catch(() => {});

      const jobs = await page.evaluate(() => {
        const jobCards = document.querySelectorAll('[data-test="job-listing"]');
        const results: any[] = [];

        jobCards.forEach((card) => {
          const titleEl = card.querySelector('[data-test="job-title"]');
          const companyEl = card.querySelector('[data-test="employer-name"]');
          const locationEl = card.querySelector('[data-test="job-location"]');
          const salaryEl = card.querySelector('[data-test="detailSalary"]');

          if (titleEl && companyEl) {
            results.push({
              title: titleEl.textContent?.trim() || '',
              company: companyEl.textContent?.trim() || '',
              location: locationEl?.textContent?.trim() || '',
              salary: salaryEl?.textContent?.trim() || ''
            });
          }
        });

        return results;
      });

      jobs.forEach(job => {
        this.jobs.push({
          ...job,
          description: '',
          url: url,
          source: 'Glassdoor',
          scrapedAt: new Date().toISOString()
        });
      });

      console.log(`✅ Found ${jobs.length} jobs on Glassdoor`);
    } catch (error) {
      console.error('❌ Error scraping Glassdoor:', error);
    } finally {
      await page.close();
    }
  }

  // Get job details for a specific posting
  async getJobDetails(jobUrl: string, source: string) {
    const page = await this.browser.newPage();
    
    try {
      await page.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const details = await page.evaluate((src) => {
        let description = '';
        let requirements = '';
        let skills: string[] = [];

        if (src === 'Indeed') {
          const descEl = document.querySelector('#jobDescriptionText');
          description = descEl?.textContent?.trim() || '';
        } else if (src === 'LinkedIn') {
          const descEl = document.querySelector('.show-more-less-html__markup');
          description = descEl?.textContent?.trim() || '';
        }

        // Extract skills (common keywords)
        const skillKeywords = ['Excel', 'SQL', 'Python', 'R', 'SAS', 'Tableau', 'PowerBI', 'VBA', 'Prophet', 'ResQ', 'AXIS'];
        const text = description.toLowerCase();
        
        skills = skillKeywords.filter(skill => text.includes(skill.toLowerCase()));

        return { description, requirements, skills };
      }, source);

      return details;
    } catch (error) {
      console.error('Error getting job details:', error);
      return { description: '', requirements: '', skills: [] };
    } finally {
      await page.close();
    }
  }

  // Filter actuarial-specific jobs
  filterActuarialJobs(): ActuarialJob[] {
    const actuarialKeywords = [
      'actuarial', 'actuary', 'ASA', 'FSA', 'ACAS', 'FCAS',
      'pricing', 'reserving', 'valuation', 'risk management',
      'life insurance', 'health insurance', 'property casualty'
    ];

    return this.jobs.filter(job => {
      const searchText = `${job.title} ${job.description}`.toLowerCase();
      return actuarialKeywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    });
  }

  // Get unique jobs
  getUniqueJobs(): ActuarialJob[] {
    const seen = new Set();
    return this.jobs.filter(job => {
      const key = `${job.title.toLowerCase()}-${job.company.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Export to MongoDB-ready JSON
  exportToMongoDB(filename: string = 'actuarial-jobs-mongodb.json') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    
    // Format for MongoDB import
    const mongoReadyJobs = uniqueJobs.map(job => ({
      ...job,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active'
    }));

    fs.writeFileSync(outputPath, JSON.stringify(mongoReadyJobs, null, 2));
    
    console.log(`\n📁 Exported ${mongoReadyJobs.length} jobs to ${filename}`);
    console.log(`💡 Import to MongoDB with: mongoimport --db jobs --collection actuarial_jobs --file ${filename} --jsonArray`);
    
    return mongoReadyJobs;
  }

  // Export to CSV
  exportToCSV(filename: string = 'actuarial-jobs.csv') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    
    const headers = ['Title', 'Company', 'Location', 'Salary', 'Description', 'Skills', 'URL', 'Posted Date', 'Job Type', 'Experience Level', 'Source', 'Scraped At'];
    
    const rows = uniqueJobs.map(job => [
      this.escapeCSV(job.title),
      this.escapeCSV(job.company),
      this.escapeCSV(job.location),
      this.escapeCSV(job.salary || ''),
      this.escapeCSV(job.description),
      this.escapeCSV(job.skills?.join(', ') || ''),
      this.escapeCSV(job.url),
      this.escapeCSV(job.postedDate || ''),
      this.escapeCSV(job.jobType || ''),
      this.escapeCSV(job.experienceLevel || ''),
      this.escapeCSV(job.source),
      this.escapeCSV(job.scrapedAt)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    fs.writeFileSync(outputPath, csv);
    
    console.log(`📁 Exported ${uniqueJobs.length} jobs to ${filename}`);
    return uniqueJobs;
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  // Display detailed summary
  displaySummary() {
    const uniqueJobs = this.getUniqueJobs();
    const actuarialJobs = this.filterActuarialJobs();
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 ACTUARIAL JOBS SCRAPING SUMMARY');
    console.log('═'.repeat(60));
    
    console.log(`\n📈 Total jobs scraped: ${this.jobs.length}`);
    console.log(`🎯 Unique jobs: ${uniqueJobs.length}`);
    console.log(`💼 Actuarial-specific jobs: ${actuarialJobs.length}`);
    
    // By source
    const bySource = uniqueJobs.reduce((acc, job) => {
      acc[job.source] = (acc[job.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n📍 Jobs by Source:');
    Object.entries(bySource).forEach(([source, count]) => {
      console.log(`   ${source.padEnd(20)} ${count}`);
    });

    // Top companies
    const byCompany = uniqueJobs.reduce((acc, job) => {
      acc[job.company] = (acc[job.company] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n🏢 Top Hiring Companies:');
    Object.entries(byCompany)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([company, count]) => {
        console.log(`   ${company.substring(0, 35).padEnd(35)} ${count}`);
      });

    // Top locations
    const byLocation = uniqueJobs.reduce((acc, job) => {
      acc[job.location] = (acc[job.location] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n📍 Top Locations:');
    Object.entries(byLocation)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([location, count]) => {
        console.log(`   ${location.substring(0, 35).padEnd(35)} ${count}`);
      });

    // Jobs with salary info
    const withSalary = uniqueJobs.filter(j => j.salary).length;
    console.log(`\n💰 Jobs with salary information: ${withSalary} (${Math.round(withSalary/uniqueJobs.length*100)}%)`);

    console.log('\n' + '═'.repeat(60) + '\n');
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Advanced Actuarial Job Scraper...\n');

  const scraper = new AdvancedActuarialScraper();
  await scraper.init();

  try {
    // Scrape from multiple sources
    await scraper.scrapeIndeedAdvanced('actuarial analyst');
    await scraper.scrapeIndeedAdvanced('actuary');
    await scraper.scrapeLinkedInAdvanced('actuarial');
    await scraper.scrapeGlassdoorAdvanced('actuarial');

    // Additional searches for specific roles
    await scraper.scrapeIndeedAdvanced('pricing actuary');
    await scraper.scrapeIndeedAdvanced('reserving actuary');

    // Display summary
    scraper.displaySummary();

    // Export results
    scraper.exportToCSV();
    scraper.exportToMongoDB();

    console.log('✅ Scraping completed successfully!');
  } catch (error) {
    console.error('❌ Error during scraping:', error);
  } finally {
    await scraper.close();
  }
}

// Run the scraper
main().catch(console.error);