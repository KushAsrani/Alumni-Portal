import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

interface Job {
  id: string;
  title: string;
  company: string;
  location: {
    area: string[];
    display_name: string;
  };
  salary_min?: number;
  salary_max?: number;
  description: string;
  category: {
    label: string;
    tag: string;
  };
  redirect_url: string;
  created: string;
  contract_time?: string;
  contract_type?: string;
}

class AdzunaJobScraper {
  private apiId: string;
  private apiKey: string;
  private baseUrl = 'https://api.adzuna.com/v1/api/jobs';
  private jobs: Job[] = [];

  constructor(apiId: string, apiKey: string) {
    this.apiId = apiId;
    this.apiKey = apiKey;
  }

  // Search for actuarial jobs in US
  async searchJobs(
    country: string = 'us',
    query: string = 'actuarial',
    location: string = '',
    resultsPerPage: number = 50,
    page: number = 1
  ) {
    console.log(`\n🔍 Searching for "${query}" jobs in ${country.toUpperCase()}...`);

    try {
      const params = new URLSearchParams({
        app_id: this.apiId,
        app_key: this.apiKey,
        results_per_page: resultsPerPage.toString(),
        what: query,
        where: location,
        page: page.toString(),
        content-type: 'application/json'
      });

      const url = `${this.baseUrl}/${country}/search/1?${params}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();
      
      console.log(`✅ Found ${data.results.length} jobs (Total: ${data.count})`);
      
      this.jobs.push(...data.results);
      
      return {
        count: data.count,
        results: data.results
      };
    } catch (error) {
      console.error('❌ Error searching jobs:', error);
      return { count: 0, results: [] };
    }
  }

  // Search multiple pages
  async searchMultiplePages(
    country: string = 'us',
    query: string = 'actuarial',
    location: string = '',
    maxPages: number = 5
  ) {
    console.log(`\n📊 Fetching up to ${maxPages} pages of results...`);

    for (let page = 1; page <= maxPages; page++) {
      await this.searchJobs(country, query, location, 50, page);
      
      // Add delay to respect rate limits
      if (page < maxPages) {
        await this.delay(1000);
      }
    }
  }

  // Get job categories/statistics
  async getCategories(country: string = 'us') {
    try {
      const url = `${this.baseUrl}/${country}/categories?app_id=${this.apiId}&app_key=${this.apiKey}`;
      const response = await fetch(url);
      const data: any = await response.json();
      
      return data.results;
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  }

  // Filter actuarial-specific jobs
  filterActuarialJobs(): Job[] {
    const keywords = [
      'actuarial', 'actuary', 'ASA', 'FSA', 'ACAS', 'FCAS',
      'pricing', 'reserving', 'valuation', 'life insurance',
      'health insurance', 'pension', 'annuity'
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
      const key = `${job.title.toLowerCase()}-${job.company.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Export to JSON
  exportToJSON(filename: string = 'actuarial-jobs-adzuna.json') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    
    // Format for our application
    const formattedJobs = uniqueJobs.map(job => ({
      title: job.title,
      company: job.company,
      location: job.location.display_name,
      salary: job.salary_min && job.salary_max 
        ? `$${this.formatNumber(job.salary_min)} - $${this.formatNumber(job.salary_max)}`
        : undefined,
      description: job.description,
      url: job.redirect_url,
      postedDate: job.created,
      jobType: job.contract_type || job.contract_time,
      category: job.category.label,
      source: 'Adzuna',
      scrapedAt: new Date().toISOString()
    }));

    fs.writeFileSync(outputPath, JSON.stringify(formattedJobs, null, 2));
    
    console.log(`\n📁 Exported ${formattedJobs.length} jobs to ${filename}`);
    return formattedJobs;
  }

  // Export to CSV
  exportToCSV(filename: string = 'actuarial-jobs-adzuna.csv') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    
    const headers = ['Title', 'Company', 'Location', 'Salary Min', 'Salary Max', 'Description', 'URL', 'Posted Date', 'Job Type', 'Category'];
    
    const rows = uniqueJobs.map(job => [
      this.escapeCSV(job.title),
      this.escapeCSV(job.company),
      this.escapeCSV(job.location.display_name),
      job.salary_min ? `$${this.formatNumber(job.salary_min)}` : '',
      job.salary_max ? `$${this.formatNumber(job.salary_max)}` : '',
      this.escapeCSV(job.description.substring(0, 500)), // Truncate long descriptions
      this.escapeCSV(job.redirect_url),
      this.escapeCSV(job.created),
      this.escapeCSV(job.contract_type || job.contract_time || ''),
      this.escapeCSV(job.category.label)
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
    console.log('📊 JOB SCRAPING SUMMARY (ADZUNA API)');
    console.log('═'.repeat(60));
    
    console.log(`\n📈 Total jobs fetched: ${this.jobs.length}`);
    console.log(`🎯 Unique jobs: ${uniqueJobs.length}`);
    
    // Jobs with salary
    const withSalary = uniqueJobs.filter(j => j.salary_min && j.salary_max).length;
    console.log(`💰 Jobs with salary info: ${withSalary} (${Math.round(withSalary/uniqueJobs.length*100)}%)`);

    // Average salary
    const salaries = uniqueJobs
      .filter(j => j.salary_min && j.salary_max)
      .map(j => (j.salary_min! + j.salary_max!) / 2);
    
    if (salaries.length > 0) {
      const avgSalary = salaries.reduce((a, b) => a + b, 0) / salaries.length;
      console.log(`📊 Average salary: $${this.formatNumber(Math.round(avgSalary))}`);
    }

    // Top locations
    const byLocation = uniqueJobs.reduce((acc, job) => {
      const loc = job.location.display_name;
      acc[loc] = (acc[loc] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n📍 Top Locations:');
    Object.entries(byLocation)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([location, count]) => {
        console.log(`   ${location.substring(0, 40).padEnd(40)} ${count}`);
      });

    // Top companies
    const byCompany = uniqueJobs.reduce((acc, job) => {
      acc[job.company] = (acc[job.company] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n🏢 Top Companies:');
    Object.entries(byCompany)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([company, count]) => {
        console.log(`   ${company.substring(0, 40).padEnd(40)} ${count}`);
      });

    // Job types
    const byType = uniqueJobs.reduce((acc, job) => {
      const type = job.contract_type || job.contract_time || 'Not specified';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n📋 Job Types:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   ${type.padEnd(20)} ${count}`);
    });

    console.log('\n' + '═'.repeat(60) + '\n');
  }

  // Helper methods
  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private formatNumber(num: number): string {
    return num.toLocaleString('en-US');
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
  console.log('🚀 Starting Adzuna Job API Scraper...\n');
  console.log('⚠️  Make sure you have set ADZUNA_APP_ID and ADZUNA_API_KEY in .env.local\n');

  const appId = process.env.ADZUNA_APP_ID;
  const apiKey = process.env.ADZUNA_API_KEY;

  if (!appId || !apiKey) {
    console.error('❌ Error: ADZUNA_APP_ID and ADZUNA_API_KEY not found in environment variables');
    console.log('\n📝 To get API credentials:');
    console.log('   1. Go to https://developer.adzuna.com/');
    console.log('   2. Sign up for free account');
    console.log('   3. Create an application');
    console.log('   4. Add credentials to .env.local:');
    console.log('      ADZUNA_APP_ID=your_app_id');
    console.log('      ADZUNA_API_KEY=your_api_key\n');
    process.exit(1);
  }

  const scraper = new AdzunaJobScraper(appId, apiKey);

  try {
    // Search for various actuarial roles
    await scraper.searchMultiplePages('us', 'actuarial analyst', '', 3);
    await scraper.searchMultiplePages('us', 'actuary', '', 3);
    await scraper.searchMultiplePages('us', 'pricing actuary', '', 2);
    await scraper.searchMultiplePages('us', 'reserving actuary', '', 2);

    // You can also search by location
    // await scraper.searchMultiplePages('us', 'actuarial', 'New York', 2);
    // await scraper.searchMultiplePages('us', 'actuarial', 'Chicago', 2);

    // Display summary
    scraper.displaySummary();

    // Export results
    scraper.exportToJSON();
    scraper.exportToCSV();

    console.log('✅ Job scraping completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   - Check the data/ folder for exported files');
    console.log('   - Run: npm run scrape:import to import to MongoDB');
    console.log('   - Or use the CSV file in Excel/Google Sheets\n');

  } catch (error) {
    console.error('❌ Error during scraping:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { AdzunaJobScraper };