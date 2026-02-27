import { ObjectId } from 'mongodb';

export interface JobDocument {
  _id?: ObjectId;
  jobId: string; // Unique job identifier
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
  url: string;
  source: string;
  featured: boolean;
  postedDate: Date;
  scrapedAt: Date;
  lastUpdated: Date;
  status: 'active' | 'expired' | 'filled' | 'archived';
  views?: number;
  applications?: number;
  metadata?: {
    scraperId?: string;
    scraperVersion?: string;
    originalData?: any;
  };
}

export interface JobStats {
  totalJobs: number;
  activeJobs: number;
  bySource: Record<string, number>;
  byLocation: Record<string, number>;
  byExperience: Record<string, number>;
  averageSalary: {
    min: number;
    max: number;
    currency: string;
  };
  topSkills: Array<{ skill: string; count: number }>;
  lastUpdated: Date;
}

export interface ScrapeLog {
  _id?: ObjectId;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  jobsScraped: number;
  jobsSaved: number;
  errors: Array<{
    message: string;
    timestamp: Date;
    details?: any;
  }>;
  source: string;
  location: string;
  keywords: string[];
  metadata?: any;
}