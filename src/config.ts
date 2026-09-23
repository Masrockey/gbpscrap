export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  headless: process.env.HEADLESS !== 'false',
  defaultMaxReviews: Number(process.env.DEFAULT_MAX_REVIEWS) || 20,
  maxReviewsLimit: Number(process.env.MAX_REVIEWS_LIMIT) || 200,
  navigationTimeoutSecs: Number(process.env.NAV_TIMEOUT_SECS) || 60,
};

