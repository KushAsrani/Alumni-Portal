import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

interface Job {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedDate: string;
  source: string;
}

class RSSJobScraper {
  private jobs: Job[] = [];

  // Parse RSS feed
  async parseRSSFeed(url: string, sourceName: string) {
    try {
      const response = await fetch(url);
      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      $('item').each((i, item) => {
        const $item = $(item);
        
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = $item.find('description').text().trim();
        const pubDate = $item.find('pubDate').text().trim();

        // Extract company and location from title (if available)
        let company = 'Unknown';
        let location = 'Unknown';
        
        // Try to parse title like "Job Title - Company Name - Location"
        const parts = title.split('-').map(p => p.trim());
        if (parts.length >= 3) {
          company = parts[parts.length - 2];
          location = parts[parts.length - 1];
        }

        if (title && link) {
          this.jobs.push({
            title,
            company,
            location,
            description,
            url: link,
            postedDate: pubDate,
            source: sourceName
          });
        }
      });
    } catch (error) {
      console.error(`Error parsing RSS feed ${sourceName}:`, error);
    }
  }

  // Indeed RSS feeds
  async scrapeIndeedRSS(keyword: string = 'actuarial', location: string = '') {
    console.log(`\n🔍 Scraping Indeed RSS for "${keyword}"...`);
    
    const baseUrl = 'https://rss.indeed.com/rss';
    const params = new URLSearchParams({
      q: keyword,
      l: location,
      sort: 'date'
    });

    await this.parseRSSFeed(`${baseUrl}?${params}`, 'Indeed');
    console.log(`✅ Found ${this.jobs.length} total jobs`);
  }

  // SimplyHired RSS
  async scrapeSimplyHiredRSS(keyword: string = 'actuarial') {
    console.log(`\n🔍 Scraping SimplyHired RSS for "${keyword}"...`);
    
    const url = `https://www.simplyhired.com/search.rss?q=${encodeURIComponent(keyword)}`;
    
    await this.parseRSSFeed(url, 'SimplyHired');
    console.log(`✅ Found ${this.jobs.length} total jobs`);
  }

  // CareerBuilder RSS
  async scrapeCareerBuilderRSS(keyword: string = 'actuarial') {
    console.log(`\n🔍 Scraping CareerBuilder RSS for "${keyword}"...`);
    
    const url = `https://www.careerbuilder.com/jobs/rss?keywords=${encodeURIComponent(keyword)}`;
    
    await this.parseRSSFeed(url, 'CareerBuilder');
    console.log(`✅ Found ${this.jobs.length} total jobs`);
  }

  // ZipRecruiter RSS
  async scrapeZipRecruiterRSS(keyword: string = 'actuarial', location: string = '') {
    console.log(`\n🔍 Scraping ZipRecruiter RSS for "${keyword}"...`);
    
    const params = new URLSearchParams({
      search: keyword,
      location: location
    });

    const url = `https://www.ziprecruiter.com/jobs-rss?${params}`;
    
    await this.parseRSSFeed(url, 'ZipRecruiter');
    console.log(`✅ Found ${this.jobs.length} total jobs`);
  }

  // Filter actuarial jobs
  filterActuarialJobs(): Job[] {
    const keywords = [
      'actuarial', 'actuary', 'ASA', 'FSA', 'ACAS', 'FCAS',
      'pricing', 'reserving', 'valuation', 'pension'
    ];

    return this.jobs.filter(job => {
      const searchText = `${job.title} ${job.description}`.toLowerCase();
      return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    });
  }

  // Get unique jobs
  getUniqueJobs(): Job[] {
    const seen = new Set();
    return this.jobs.filter(job => {
      const key = `${job.title.toLowerCase()}-${job.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Export to JSON
  exportToJSON(filename: string = 'actuarial-jobs-rss.json') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    fs.writeFileSync(outputPath, JSON.stringify(uniqueJobs, null, 2));
    
    console.log(`\n📁 Exported ${uniqueJobs.length} jobs to ${filename}`);
    return uniqueJobs;
  }

  // Export to CSV
  exportToCSV(filename: string = 'actuarial-jobs-rss.csv') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    
    const headers = ['Title', 'Company', 'Location', 'Description', 'URL', 'Posted Date', 'Source'];
    
    const rows = uniqueJobs.map(job => [
      this.escapeCSV(job.title),
      this.escapeCSV(job.company),
      this.escapeCSV(job.location),
      this.escapeCSV(job.description.substring(0, 300)),
      this.escapeCSV(job.url),
      this.escapeCSV(job.postedDate),
      this.escapeCSV(job.source)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    fs.writeFileSync(outputPath, csv);
    
    console.log(`📁 Exported ${uniqueJobs.length} jobs to ${filename}`);
    return uniqueJobs;
  }

  // Display summary
  displaySummary() {
    const uniqueJobs = this.getUniqueJobs();
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 JOB SCRAPING SUMMARY (RSS FEEDS)');
    console.log('═'.repeat(60));
    
    console.log(`\n📈 Total jobs scraped: ${this.jobs.length}`);
    console.log(`🎯 Unique jobs: ${uniqueJobs.length}`);
    
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
      if (job.company !== 'Unknown') {
        acc[job.company] = (acc[job.company] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    if (Object.keys(byCompany).length > 0) {
      console.log('\n🏢 Top Companies:');
      Object.entries(byCompany)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .forEach(([company, count]) => {
          console.log(`   ${company.substring(0, 40).padEnd(40)} ${count}`);
        });
    }

    console.log('\n' + '═'.repeat(60) + '\n');
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting RSS Job Scraper...\n');
  console.log('📡 No API keys required - using public RSS feeds\n');

  const scraper = new RSSJobScraper();

  try {
    // Scrape from multiple RSS sources
    await scraper.scrapeIndeedRSS('actuarial');
    await scraper.scrapeIndeedRSS('actuary');
    await scraper.scrapeSimplyHiredRSS('actuarial');
    await scraper.scrapeCareerBuilderRSS('actuarial');
    await scraper.scrapeZipRecruiterRSS('actuarial');

    // Location-specific searches
    await scraper.scrapeIndeedRSS('actuarial', 'New York, NY');
    await scraper.scrapeIndeedRSS('actuarial', 'Chicago, IL');
    await scraper.scrapeIndeedRSS('actuarial', 'Hartford, CT');

    // Display summary
    scraper.displaySummary();

    // Export results
    const jobs = scraper.exportToJSON();
    scraper.exportToCSV();

    if (jobs.length > 0) {
      console.log('✅ Job scraping completed successfully!');
      console.log(`\n📊 Retrieved ${jobs.length} unique actuarial job postings`);
      console.log('\n💡 Next steps:');
      console.log('   - Check data/actuarial-jobs-rss.json for full data');
      console.log('   - Open data/actuarial-jobs-rss.csv in Excel');
      console.log('   - Run: npm run scrape:import to import to MongoDB\n');
    } else {
      console.log('⚠️  No jobs found. This could be due to:');
      console.log('   - RSS feeds being temporarily unavailable');
      console.log('   - Network connectivity issues');
      console.log('   - Changes to RSS feed URLs\n');
    }

  } catch (error) {
    console.error('❌ Error during scraping:', error);
    process.exit(1);
  }
}

// Run
main().catch(console.error);