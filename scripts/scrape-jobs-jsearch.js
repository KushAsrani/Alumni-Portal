// scripts/scrape-jobs-jsearch.js
// Using JSearch API from RapidAPI (Free tier: 250 requests/month)
// Sign up: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

class JSearchScraper {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://jsearch.p.rapidapi.com';
    this.jobs = [];
  }

  async searchJobs(query, page = 1, numPages = 1) {
    console.log(`\n🔍 Searching for "${query}" jobs (page ${page})...`);

    try {
      const url = `${this.baseUrl}/search?query=${encodeURIComponent(query)}&page=${page}&num_pages=${numPages}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        this.jobs.push(...data.data);
        console.log(`✅ Found ${data.data.length} jobs`);
      } else {
        console.log(`⚠️  No jobs found for "${query}"`);
      }

      return data;
    } catch (error) {
      console.error(`❌ Error searching for "${query}":`, error.message);
      return { data: [] };
    }
  }

  async searchMultipleQueries(queries) {
    console.log(`\n📊 Searching ${queries.length} different queries...\n`);

    for (const query of queries) {
      await this.searchJobs(query);
      // Add delay to respect rate limits
      await this.delay(1000);
    }
  }

  getUniqueJobs() {
    const seen = new Set();
    return this.jobs.filter(job => {
      const key = `${job.job_id || job.job_title}-${job.employer_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  exportToJSON(filename = 'actuarial-jobs-jsearch.json') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    
    const formattedJobs = uniqueJobs.map(job => ({
      title: job.job_title,
      company: job.employer_name,
      location: job.job_city && job.job_state 
        ? `${job.job_city}, ${job.job_state}` 
        : job.job_country || 'Remote',
      salary: job.job_salary || job.job_min_salary || job.job_max_salary || undefined,
      description: job.job_description || '',
      requirements: job.job_highlights?.Qualifications?.join('\n') || '',
      responsibilities: job.job_highlights?.Responsibilities?.join('\n') || '',
      benefits: job.job_highlights?.Benefits?.join('\n') || '',
      url: job.job_apply_link || job.job_google_link,
      postedDate: job.job_posted_at_datetime_utc,
      jobType: job.job_employment_type,
      experienceLevel: job.job_required_experience?.required_experience_in_months 
        ? `${Math.round(job.job_required_experience.required_experience_in_months / 12)} years`
        : undefined,
      isRemote: job.job_is_remote,
      source: 'JSearch',
      scrapedAt: new Date().toISOString()
    }));

    fs.writeFileSync(outputPath, JSON.stringify(formattedJobs, null, 2));
    
    console.log(`\n📁 Exported ${formattedJobs.length} jobs to ${filename}`);
    return formattedJobs;
  }

  exportToCSV(filename = 'actuarial-jobs-jsearch.csv') {
    const outputPath = path.join(process.cwd(), 'data', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueJobs = this.getUniqueJobs();
    
    const headers = [
      'Title', 'Company', 'Location', 'Salary', 'Description', 
      'URL', 'Posted Date', 'Job Type', 'Remote', 'Source'
    ];
    
    const rows = uniqueJobs.map(job => [
      this.escapeCSV(job.job_title),
      this.escapeCSV(job.employer_name),
      this.escapeCSV(job.job_city && job.job_state ? `${job.job_city}, ${job.job_state}` : job.job_country),
      this.escapeCSV(job.job_salary || ''),
      this.escapeCSV((job.job_description || '').substring(0, 500)),
      this.escapeCSV(job.job_apply_link || job.job_google_link),
      this.escapeCSV(job.job_posted_at_datetime_utc || ''),
      this.escapeCSV(job.job_employment_type || ''),
      job.job_is_remote ? 'Yes' : 'No',
      'JSearch'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    fs.writeFileSync(outputPath, csv);
    
    console.log(`📁 Exported ${uniqueJobs.length} jobs to ${filename}`);
    return uniqueJobs;
  }

  displaySummary() {
    const uniqueJobs = this.getUniqueJobs();
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 JOB SCRAPING SUMMARY (JSearch API)');
    console.log('═'.repeat(60));
    
    console.log(`\n📈 Total jobs fetched: ${this.jobs.length}`);
    console.log(`🎯 Unique jobs: ${uniqueJobs.length}`);
    
    // Remote jobs
    const remoteJobs = uniqueJobs.filter(j => j.job_is_remote).length;
    console.log(`🏠 Remote jobs: ${remoteJobs}`);

    // Jobs with salary
    const withSalary = uniqueJobs.filter(j => j.job_salary || j.job_min_salary).length;
    console.log(`💰 Jobs with salary info: ${withSalary}`);

    // Top locations
    const byLocation = uniqueJobs.reduce((acc, job) => {
      const loc = job.job_city && job.job_state 
        ? `${job.job_city}, ${job.job_state}` 
        : job.job_country || 'Unknown';
      acc[loc] = (acc[loc] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📍 Top Locations:');
    Object.entries(byLocation)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([location, count]) => {
        console.log(`   ${location.substring(0, 40).padEnd(40)} ${count}`);
      });

    // Top companies
    const byCompany = uniqueJobs.reduce((acc, job) => {
      acc[job.employer_name] = (acc[job.employer_name] || 0) + 1;
      return acc;
    }, {});

    console.log('\n🏢 Top Companies:');
    Object.entries(byCompany)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([company, count]) => {
        console.log(`   ${company.substring(0, 40).padEnd(40)} ${count}`);
      });

    // Job types
    const byType = uniqueJobs.reduce((acc, job) => {
      const type = job.job_employment_type || 'Not specified';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📋 Job Types:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   ${type.padEnd(20)} ${count}`);
    });

    console.log('\n' + '═'.repeat(60) + '\n');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  escapeCSV(value) {
    const str = String(value || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting JSearch API Job Scraper...\n');

  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    console.error('❌ RAPIDAPI_KEY not found in environment variables\n');
    console.log('📝 To get your API key:');
    console.log('   1. Go to https://rapidapi.com/');
    console.log('   2. Sign up (free)');
    console.log('   3. Subscribe to JSearch API (free tier: 250 requests/month)');
    console.log('      https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch');
    console.log('   4. Copy your API key');
    console.log('   5. Add to .env.local:');
    console.log('      RAPIDAPI_KEY=your_api_key_here\n');
    process.exit(1);
  }

  const scraper = new JSearchScraper(apiKey);

  try {
    // Search for various actuarial positions
    const queries = [
      'actuarial analyst',
      'actuary',
      'pricing actuary',
      'reserving actuary',
      'actuarial associate',
      'life actuary',
      'health actuary',
      'pension actuary'
    ];

    await scraper.searchMultipleQueries(queries);

    // Display summary
    scraper.displaySummary();

    // Export results
    const jobs = scraper.exportToJSON();
    scraper.exportToCSV();

    if (jobs.length > 0) {
      console.log('✅ Job scraping completed successfully!');
      console.log(`\n📊 Retrieved ${jobs.length} unique actuarial job postings`);
      console.log('\n💡 Files created:');
      console.log('   - data/actuarial-jobs-jsearch.json (for MongoDB import)');
      console.log('   - data/actuarial-jobs-jsearch.csv (for Excel)\n');
    }

  } catch (error) {
    console.error('❌ Error during scraping:', error);
    process.exit(1);
  }
}

main().catch(console.error);