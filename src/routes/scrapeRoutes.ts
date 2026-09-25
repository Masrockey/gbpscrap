import type { FastifyPluginAsync } from 'fastify';
import { GBPScraper, type ScrapeOptions } from '../scrapers/gbpScraper.js';
import { jobManager, type JobType } from '../services/jobManager.js';
import { proxyManager } from '../services/proxyManager.js';
import {
  scrapeProfileSchema,
  scrapeReviewsSchema,
  scrapeFullSchema,
  createJobSchema,
  getJobStatusSchema,
  getProxyStatsSchema,
} from '../schemas/openapiSchemas.js';

interface CommonRequestBody extends ScrapeOptions {
  type?: JobType;
}

export const scrapeRoutes: FastifyPluginAsync = async (fastify) => {
  // Health check
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Check service health status',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }
  );

  // Proxy pool health & statistics
  fastify.get(
    '/api/proxy/stats',
    { schema: getProxyStatsSchema },
    async () => {
      const stats = proxyManager.getStats();
      return { success: true, data: stats };
    }
  );

  // Sync: Scrape Profile
  fastify.post<{
    Body: CommonRequestBody;
  }>(
    '/api/scrape/profile',
    { schema: scrapeProfileSchema },
    async (request, reply) => {
      const body = request.body || {};
      const targets = GBPScraper.resolveTargets(body);
      if (targets.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'At least one of "url", "placeId", "startUrls", "placeIds", or "query" must be specified.',
        });
      }

      try {
        const result = await GBPScraper.scrapeProfile(body);
        return reply.send({
          success: true,
          data: result.data,
          results: result.results,
        });
      } catch (err: any) {
        request.log.error(err);
        return reply.status(500).send({
          success: false,
          error: err.message || 'Error occurred while scraping profile.',
        });
      }
    }
  );

  // Sync: Scrape Reviews
  fastify.post<{
    Body: CommonRequestBody;
  }>(
    '/api/scrape/reviews',
    { schema: scrapeReviewsSchema },
    async (request, reply) => {
      const body = request.body || {};
      const targets = GBPScraper.resolveTargets(body);
      if (targets.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'At least one of "url", "placeId", "startUrls", "placeIds", or "query" must be specified.',
        });
      }

      try {
        const result = await GBPScraper.scrapeReviews(body);
        return reply.send({
          success: true,
          data: result.data,
          results: result.results,
        });
      } catch (err: any) {
        request.log.error(err);
        return reply.status(500).send({
          success: false,
          error: err.message || 'Error occurred while scraping reviews.',
        });
      }
    }
  );

  // Sync: Scrape Full (Profile + Reviews)
  fastify.post<{
    Body: CommonRequestBody;
  }>(
    '/api/scrape/full',
    { schema: scrapeFullSchema },
    async (request, reply) => {
      const body = request.body || {};
      const targets = GBPScraper.resolveTargets(body);
      if (targets.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'At least one of "url", "placeId", "startUrls", "placeIds", or "query" must be specified.',
        });
      }

      try {
        const result = await GBPScraper.scrapeFull(body);
        return reply.send({
          success: true,
          data: result.data,
          results: result.results,
        });
      } catch (err: any) {
        request.log.error(err);
        return reply.status(500).send({
          success: false,
          error: err.message || 'Error occurred while scraping full profile and reviews.',
        });
      }
    }
  );

  // Async: Create Background Scraping Job
  fastify.post<{
    Body: CommonRequestBody;
  }>(
    '/api/scrape/jobs',
    { schema: createJobSchema },
    async (request, reply) => {
      const body = request.body || {};
      const { type = 'full', ...options } = body;
      const targets = GBPScraper.resolveTargets(options);
      if (targets.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'At least one of "url", "placeId", "startUrls", "placeIds", or "query" must be specified.',
        });
      }

      const job = jobManager.createJob(type, options);

      return reply.status(202).send({
        success: true,
        jobId: job.id,
        status: job.status,
        checkUrl: `/api/scrape/jobs/${job.id}`,
        createdAt: job.createdAt,
      });
    }
  );

  // Async: Get Job Status
  fastify.get<{
    Params: { id: string };
  }>(
    '/api/scrape/jobs/:id',
    { schema: getJobStatusSchema },
    async (request, reply) => {
      const { id } = request.params;
      const job = jobManager.getJob(id);

      if (!job) {
        return reply.status(404).send({
          error: `Job with ID ${id} not found.`,
        });
      }

      return reply.send({
        jobId: job.id,
        type: job.type,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error,
        result: job.result,
      });
    }
  );
};
