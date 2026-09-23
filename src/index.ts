import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { scrapeRoutes } from './routes/scrapeRoutes.js';

async function bootstrap() {
  const fastify = Fastify({
    ajv: {
      customOptions: {
        strict: false,
      },
    },
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Enable CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Graceful JSON content-type parser (handles empty body, trailing commas, and comments)
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      if (!body || body.trim() === '') {
        return done(null, {});
      }
      try {
        const json = JSON.parse(body);
        return done(null, json);
      } catch {
        try {
          // Lenient cleanup: strip comments and trailing commas before } or ]
          const cleaned = body
            .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
            .replace(/,\s*([\]}])/g, '$1');
          const json = JSON.parse(cleaned);
          return done(null, json);
        } catch (err: any) {
          const syntaxError: any = new Error(
            `Body is not valid JSON (${err.message}). Pastikan format JSON valid tanpa tanda kutip tunggal atau kurung yang tidak tertutup.`
          );
          syntaxError.statusCode = 400;
          return done(syntaxError, undefined);
        }
      }
    }
  );

  // Register OpenAPI / Swagger
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Google Business Profile & Review Scraper API',
        description:
          'API untuk scraping profil bisnis dan ulasan (reviews) Google Maps menggunakan Crawlee (Apify) dan Playwright. Dilengkapi dukungan synchronous dan asynchronous background jobs.',
        version: '1.0.0',
        contact: {
          name: 'Scraper Service',
        },
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'Scraper', description: 'Synchronous scraping endpoints' },
        { name: 'Jobs', description: 'Asynchronous background scraping jobs' },
        { name: 'System', description: 'Health and system diagnostics' },
      ],
    },
  });

  // Register Swagger UI documentation
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Expose raw OpenAPI JSON spec
  fastify.get('/openapi.json', { schema: { hide: true } }, async () => {
    return fastify.swagger();
  });

  // Root redirect to docs
  fastify.get('/', { schema: { hide: true } }, async (_request, reply) => {
    return reply.redirect('/docs');
  });

  // Register Scraper API routes
  await fastify.register(scrapeRoutes);

  // Start listening
  try {
    await fastify.listen({ port: config.port, host: config.host });
    fastify.log.info(`Server running at http://${config.host}:${config.port}`);
    fastify.log.info(`OpenAPI Swagger UI available at http://localhost:${config.port}/docs`);
    fastify.log.info(`OpenAPI JSON spec available at http://localhost:${config.port}/openapi.json`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();

