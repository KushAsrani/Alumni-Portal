import { getCollection } from '../mongodb';
import type { JobDocument, JobStats, ScrapeLog } from '../models/Job';
import { ObjectId } from 'mongodb';

export class JobService {
  private static readonly JOBS_COLLECTION = 'jobs';
  private static readonly SCRAPE_LOGS_COLLECTION = 'scrape_logs';

  /**
   * Create or update a job
   */
  static async upsertJob(job: Omit<JobDocument, '_id'>): Promise<{ success: boolean; jobId: string; isNew: boolean }> {
    const collection = await getCollection<JobDocument>(this.JOBS_COLLECTION);

    // Check if job already exists
    const existing = await collection.findOne({ jobId: job.jobId });

    if (existing) {
      // Update existing job
      await collection.updateOne(
        { jobId: job.jobId },
        {
          $set: {
            ...job,
            lastUpdated: new Date(),
          },
        }
      );

      return {
        success: true,
        jobId: job.jobId,
        isNew: false,
      };
    } else {
      // Insert new job
      const result = await collection.insertOne({
        ...job,
        scrapedAt: new Date(),
        lastUpdated: new Date(),
        status: 'active',
        views: 0,
        applications: 0,
      } as JobDocument);

      return {
        success: true,
        jobId: job.jobId,
        isNew: true,
      };
    }
  }

  /**
   * Bulk insert jobs
   */
  static async bulkUpsertJobs(jobs: Array<Omit<JobDocument, '_id'>>): Promise<{
    success: boolean;
    inserted: number;
    updated: number;
    errors: Array<{ job: string; error: string }>;
  }> {
    const collection = await getCollection<JobDocument>(this.JOBS_COLLECTION);

    let inserted = 0;
    let updated = 0;
    const errors: Array<{ job: string; error: string }> = [];

    for (const job of jobs) {
      try {
        const result = await this.upsertJob(job);
        if (result.isNew) {
          inserted++;
        } else {
          updated++;
        }
      } catch (error) {
        errors.push({
          job: job.title,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      success: true,
      inserted,
      updated,
      errors,
    };
  }

  /**
   * Get jobs with filters
   */
  static async getJobs(filters: {
    status?: string;
    source?: string;
    location?: string;
    experienceLevel?: string;
    minSalary?: number;
    featured?: boolean;
    limit?: number;
    skip?: number;
    sortBy?: 'postedDate' | 'scrapedAt' | 'views';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<JobDocument[]> {
    const collection = await getCollection<JobDocument>(this.JOBS_COLLECTION);

    const query: any = {};

    if (filters.status) query.status = filters.status;
    if (filters.source) query.source = filters.source;
    if (filters.location) query.location = { $regex: filters.location, $options: 'i' };
    if (filters.experienceLevel) query.experienceLevel = filters.experienceLevel;
    if (filters.featured !== undefined) query.featured = filters.featured;
    if (filters.minSalary) {
      query['salary.min'] = { $gte: filters.minSalary };
    }

    const sortField = filters.sortBy || 'postedDate';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const jobs = await collection
      .find(query)
      .sort({ [sortField]: sortOrder })
      .limit(filters.limit || 50)
      .skip(filters.skip || 0)
      .toArray();

    return jobs;
  }

  /**
   * Get job by ID
   */
  static async getJobById(jobId: string): Promise<JobDocument | null> {
    const collection = await getCollection<JobDocument>(this.JOBS_COLLECTION);
    
    // Increment view count
    await collection.updateOne(
      { jobId },
      { $inc: { views: 1 } }
    );

    return await collection.findOne({ jobId });
  }

  /**
   * Search jobs
   */
  static async searchJobs(searchTerm: string, limit: number = 20): Promise<JobDocument[]> {
    const collection = await getCollection<JobDocument>(this.JOBS_COLLECTION);

    const jobs = await collection
      .find({
        $or: [
          { title: { $regex: searchTerm, $options: 'i' } },
          { company: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
          { skills: { $in: [new RegExp(searchTerm, 'i')] } },
        ],
        status: 'active',
      })
      .limit(limit)
      .sort({ postedDate: -1 })
      .toArray();

    return jobs;
  }

  /**
   * Update job status
   */
  static async updateJobStatus(jobId: string, status: JobDocument['status']): Promise<boolean> {
    const collection = await getCollection<JobDocument>(this.JOBS_COLLECTION);

    const result = await collection.updateOne(
      { jobId },
      {
        $set: {
          status,
          lastUpdated: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Delete old jobs
   */
  static async deleteOldJobs(daysOld: number = 90): Promise<number> {
    const collection = await getCollection<JobDocument>(this.JOBS_COLLECTION);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await collection.deleteMany({
      postedDate: { $lt: cutoffDate },
      status: { $ne: 'active' },
    });

    return result.deletedCount;
  }

  /**
   * Get job statistics
   */
  static async getJobStats(): Promise<JobStats> {
    const collection = await getCollection<JobDocument>(this.JOBS_COLLECTION);

    const totalJobs = await collection.countDocuments();
    const activeJobs = await collection.countDocuments({ status: 'active' });

    // Aggregate stats
    const statsPipeline = [
      { $match: { status: 'active' } },
      {
        $facet: {
          bySource: [
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $project: { source: '$_id', count: 1, _id: 0 } },
          ],
          byLocation: [
            { $group: { _id: '$location', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $project: { location: '$_id', count: 1, _id: 0 } },
          ],
          byExperience: [
            { $group: { _id: '$experienceLevel', count: { $sum: 1 } } },
            { $project: { level: '$_id', count: 1, _id: 0 } },
          ],
          averageSalary: [
            { $match: { 'salary.min': { $exists: true } } },
            {
              $group: {
                _id: null,
                avgMin: { $avg: '$salary.min' },
                avgMax: { $avg: '$salary.max' },
              },
            },
          ],
          topSkills: [
            { $unwind: '$skills' },
            { $group: { _id: '$skills', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
            { $project: { skill: '$_id', count: 1, _id: 0 } },
          ],
        },
      },
    ];

    const [results] = await collection.aggregate(statsPipeline).toArray();

    // Format results
    const bySource: Record<string, number> = {};
    results.bySource.forEach((item: any) => {
      bySource[item.source] = item.count;
    });

    const byLocation: Record<string, number> = {};
    results.byLocation.forEach((item: any) => {
      byLocation[item.location] = item.count;
    });

    const byExperience: Record<string, number> = {};
    results.byExperience.forEach((item: any) => {
      byExperience[item.level] = item.count;
    });

    const avgSalary = results.averageSalary[0] || { avgMin: 0, avgMax: 0 };

    return {
      totalJobs,
      activeJobs,
      bySource,
      byLocation,
      byExperience,
      averageSalary: {
        min: Math.round(avgSalary.avgMin || 0),
        max: Math.round(avgSalary.avgMax || 0),
        currency: 'INR',
      },
      topSkills: results.topSkills,
      lastUpdated: new Date(),
    };
  }

  /**
   * Log scrape session
   */
  static async createScrapeLog(log: Omit<ScrapeLog, '_id'>): Promise<string> {
    const collection = await getCollection<ScrapeLog>(this.SCRAPE_LOGS_COLLECTION);

    const result = await collection.insertOne(log as ScrapeLog);
    return result.insertedId.toString();
  }

  /**
   * Update scrape log
   */
  static async updateScrapeLog(logId: string, updates: Partial<ScrapeLog>): Promise<boolean> {
    const collection = await getCollection<ScrapeLog>(this.SCRAPE_LOGS_COLLECTION);

    const result = await collection.updateOne(
      { _id: new ObjectId(logId) },
      { $set: updates }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Get recent scrape logs
   */
  static async getScrapeLogs(limit: number = 10): Promise<ScrapeLog[]> {
    const collection = await getCollection<ScrapeLog>(this.SCRAPE_LOGS_COLLECTION);

    return await collection
      .find()
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
  }
}