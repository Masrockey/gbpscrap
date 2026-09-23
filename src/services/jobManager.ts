import { randomUUID } from 'crypto';
import { GBPScraper, type ScrapeOptions } from '../scrapers/gbpScraper.js';

export type JobType = 'profile' | 'reviews' | 'full';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ScrapingJob {
  id: string;
  type: JobType;
  status: JobStatus;
  options: ScrapeOptions;
  result: any | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

class JobManager {
  private jobs = new Map<string, ScrapingJob>();

  constructor() {
    // Periodic cleanup of jobs older than 2 hours
    setInterval(() => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      for (const [id, job] of this.jobs.entries()) {
        if (new Date(job.createdAt).getTime() < twoHoursAgo) {
          this.jobs.delete(id);
        }
      }
    }, 15 * 60 * 1000);
  }

  public createJob(type: JobType, options: ScrapeOptions): ScrapingJob {
    const job: ScrapingJob = {
      id: randomUUID(),
      type,
      status: 'queued',
      options,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(job.id, job);

    // Run asynchronously
    setImmediate(() => this.processJob(job.id));

    return job;
  }

  public getJob(id: string): ScrapingJob | undefined {
    return this.jobs.get(id);
  }

  private async processJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'running';
    job.updatedAt = new Date().toISOString();

    try {
      let result: any;
      if (job.type === 'profile') {
        result = await GBPScraper.scrapeProfile(job.options);
      } else if (job.type === 'reviews') {
        result = await GBPScraper.scrapeReviews(job.options);
      } else {
        result = await GBPScraper.scrapeFull(job.options);
      }

      job.status = 'completed';
      job.result = result;
      job.updatedAt = new Date().toISOString();
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || 'Scraping job failed';
      job.updatedAt = new Date().toISOString();
    }
  }
}

export const jobManager = new JobManager();

