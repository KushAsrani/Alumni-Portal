#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  scrapeActuarialJobs,
  type Job,
} from '../src/utils/scrapers/actuarialJobScraper.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  outputDir: path.join(__dirname, '../src/content/jobs'),
  outputFile: path.join(__dirname, '../src/content/jobs/jobs-data.json'),
  logsDir: path.join(__dirname, '../.logs'),
  logsFile: path.join(__dirname, '../.logs/scraper.log'),
};

class Logger {
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
  }

  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.logFile), { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  private formatLog(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  async log(message: string): Promise<void> {
    await this.ensureLogDir();
    const formatted = this.formatLog('INFO', message);
    console.log(formatted);
    try {
      await fs.appendFile(this.logFile, formatted + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  async error(message: string, error?: unknown): Promise<void> {
    await this.ensureLogDir();
    const errorMsg = error instanceof Error ? error.message : String(error);
    const formatted = this.formatLog('ERROR', `${message} - ${errorMsg}`);
    console.error(formatted);
    try {
      await fs.appendFile(this.logFile, formatted + '\n');
    } catch (err) {
      console.error('Failed to write error to log file:', err);
    }
  }

  async success(message: string): Promise<void> {
    await this.ensureLogDir();
    const formatted = this.formatLog('SUCCESS', message);
    console.log(`✅ ${formatted}`);
    try {
      await fs.appendFile(this.logFile, formatted + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }
}

const logger = new Logger(CONFIG.logsFile);

async function setupDirectories(): Promise<void> {
  try {
    await fs.mkdir(CONFIG.outputDir, { recursive: true });
    await fs.mkdir(path.dirname(CONFIG.outputFile), { recursive: true });
    await fs.mkdir(CONFIG.logsDir, { recursive: true });
    await logger.log('✓ Directories setup completed');
  } catch (error) {
    await logger.error('Failed to setup directories', error);
    throw error;
  }
}

function validateJob(job: Job): boolean {
  return !!(
    job.id &&
    job.title &&
    job.company &&
    job.location &&
    job.posted_date &&
    job.url &&
    job.source
  );
}

function processJobs(jobs: Job[]): Job[] {
  const validJobs = jobs.filter(job => {
    if (!validateJob(job)) {
      return false;
    }
    if (typeof job.posted_date === 'string') {
      job.posted_date = new Date(job.posted_date);
    }
    return true;
  });

  validJobs.sort((a, b) => {
    const dateA = new Date(a.posted_date).getTime();
    const dateB = new Date(b.posted_date).getTime();
    return dateB - dateA;
  });

  return validJobs;
}

async function saveJobs(jobs: Job[]): Promise<void> {
  try {
    const jsonContent = JSON.stringify(jobs, null, 2);
    await fs.writeFile(CONFIG.outputFile, jsonContent, 'utf-8');
    await logger.success(`Saved ${jobs.length} jobs to ${CONFIG.outputFile}`);
  } catch (error) {
    await logger.error('Failed to save jobs', error);
    throw error;
  }
}

async function createIndividualJobFiles(jobs: Job[]): Promise<void> {
  try {
    const jobsDir = path.join(__dirname, '../src/content/jobs');
    await fs.mkdir(jobsDir, { recursive: true });

    for (const job of jobs) {
      // Create filename from job title and company
      const filename = `${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${job.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      const filepath = path.join(jobsDir, filename);

      // Remove posted_date conversion for storage
      const jobData = {
        ...job,
        posted_date: job.posted_date instanceof Date 
          ? job.posted_date.toISOString().split('T')[0]
          : job.posted_date,
      };

      await fs.writeFile(filepath, JSON.stringify(jobData, null, 2));
    }

    await logger.success(`Created ${jobs.length} individual job files`);
  } catch (error) {
    await logger.warn('Could not create individual job files', error);
  }
}

function generateStatistics(jobs: Job[]): object {
  const stats = {
    totalJobs: jobs.length,
    byExperienceLevel: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
    byJobType: {} as Record<string, number>,
  };

  jobs.forEach(job => {
    stats.byExperienceLevel[job.experienceLevel] =
      (stats.byExperienceLevel[job.experienceLevel] || 0) + 1;
    stats.bySource[job.source] = (stats.bySource[job.source] || 0) + 1;
    stats.byJobType[job.jobType] = (stats.byJobType[job.jobType] || 0) + 1;
  });

  return stats;
}

async function main(): Promise<void> {
  try {
    const startTime = Date.now();

    await logger.log('🚀 Starting job scraping process...');
    await setupDirectories();

    await logger.log('📡 Fetching jobs...');
    const jobs = await scrapeActuarialJobs({
      timeout: 10000,
      retries: 3,
      delayMs: 2000,
    });

    if (jobs.length === 0) {
      await logger.log('⚠️  No jobs were scraped.');
      process.exit(0);
    }

    await logger.log('🔍 Processing and validating jobs...');
    const validJobs = processJobs(jobs);

    // Create individual job files instead of one JSON array
    await createIndividualJobFiles(validJobs);

    const stats = generateStatistics(validJobs);
    await logger.log(`📊 Statistics: ${JSON.stringify(stats, null, 2)}`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await logger.success(
      `Job scraping completed successfully in ${duration}s!`
    );

    process.exit(0);
  } catch (error) {
    await logger.error('Fatal error during job scraping', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});