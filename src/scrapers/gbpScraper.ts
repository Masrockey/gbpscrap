import { PlaywrightCrawler, Configuration, log } from 'crawlee';
import type { Page } from 'playwright';
import { SELECTORS } from './selectors.js';
import { config } from '../config.js';

export interface GBPProfile {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  openingHours: string[];
  placeUrl: string;
  latitude: number | null;
  longitude: number | null;
}

export interface GBPReview {
  reviewId?: string | null;
  reviewUrl?: string | null;
  author: string;
  authorProfileUrl: string | null;
  rating: number;
  relativeTime: string | null;
  publishedAtDate: string | null;
  text: string | null;
  likes: number;
  ownerResponse?: {
    text: string;
    date: string | null;
  } | null;
}

export interface StartUrlItem {
  url: string;
}

export interface ScrapeOptions {
  startUrls?: StartUrlItem[];
  placeIds?: string[];
  placeId?: string;
  url?: string;
  query?: string;
  language?: string;
  hl?: string;
  maxReviews?: number;
  personalData?: boolean;
  reviewsStartDate?: string;
  sortBy?: 'newest' | 'highest' | 'lowest' | 'relevant';
}

/**
 * Parses relative time strings into estimated Date objects
 */
export function parseRelativeDate(raw: string): Date | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/^(diedit|edited)\s*/i, '').trim();
  const now = new Date();

  if (text.includes('hari lalu') || text.includes('day ago') || text.includes('days ago')) {
    const match = text.match(/(\d+)/);
    const days = match ? parseInt(match[1], 10) : (text.includes('sehari') || text.includes('a day') ? 1 : 1);
    now.setDate(now.getDate() - days);
    return now;
  }

  if (text.includes('minggu lalu') || text.includes('week ago') || text.includes('weeks ago')) {
    const match = text.match(/(\d+)/);
    const weeks = match ? parseInt(match[1], 10) : (text.includes('seminggu') || text.includes('a week') ? 1 : 1);
    now.setDate(now.getDate() - weeks * 7);
    return now;
  }

  if (text.includes('bulan lalu') || text.includes('month ago') || text.includes('months ago')) {
    const match = text.match(/(\d+)/);
    const months = match ? parseInt(match[1], 10) : (text.includes('sebulan') || text.includes('a month') ? 1 : 1);
    now.setMonth(now.getMonth() - months);
    return now;
  }

  if (text.includes('tahun lalu') || text.includes('year ago') || text.includes('years ago')) {
    const match = text.match(/(\d+)/);
    const years = match ? parseInt(match[1], 10) : (text.includes('setahun') || text.includes('a year') ? 1 : 1);
    now.setFullYear(now.getFullYear() - years);
    return now;
  }

  if (text.includes('kemarin') || text.includes('yesterday')) {
    now.setDate(now.getDate() - 1);
    return now;
  }

  if (
    text.includes('jam lalu') || text.includes('hour ago') || text.includes('hours ago') ||
    text.includes('menit lalu') || text.includes('minute ago') || text.includes('minutes ago')
  ) {
    return now;
  }

  return null;
}

export class GBPScraper {
  /**
   * Resolve all targets from url, placeId, placeIds, startUrls, or query
   * Prioritizes single url/placeId when provided, or multiple startUrls/placeIds
   */
  public static resolveTargets(options: ScrapeOptions): string[] {
    const targets: string[] = [];
    const lang = options.language || options.hl || 'id';

    const isDummy = (val?: string | null): boolean => {
      if (!val || typeof val !== 'string') return true;
      const s = val.trim().toLowerCase();
      return ['string', 'linkhere', 'placeidhere', 'url', 'query'].includes(s) || s === '';
    };

    const isValidHttpUrl = (str: string): boolean => {
      try {
        const parsed = new URL(str);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    };

    // 1. Single direct URL (highest priority for single place)
    if (options.url && !isDummy(options.url)) {
      const trimmed = options.url.trim();
      if (isValidHttpUrl(trimmed)) {
        return [trimmed];
      } else {
        return [`https://www.google.com/maps/search/${encodeURIComponent(trimmed)}?hl=${lang}`];
      }
    }

    // 2. Single placeId
    if (options.placeId && !isDummy(options.placeId)) {
      return [`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(options.placeId.trim())}`];
    }

    // 3. Array of startUrls
    if (options.startUrls && Array.isArray(options.startUrls)) {
      for (const item of options.startUrls) {
        if (item?.url && !isDummy(item.url)) {
          const trimmed = item.url.trim();
          if (isValidHttpUrl(trimmed)) {
            targets.push(trimmed);
          } else {
            targets.push(`https://www.google.com/maps/search/${encodeURIComponent(trimmed)}?hl=${lang}`);
          }
        }
      }
      if (targets.length > 0) {
        return targets;
      }
    }

    // 4. Array of placeIds
    if (options.placeIds && Array.isArray(options.placeIds)) {
      for (const id of options.placeIds) {
        if (id && !isDummy(id)) {
          targets.push(`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(id.trim())}`);
        }
      }
      if (targets.length > 0) {
        return targets;
      }
    }

    // 5. Query string search
    if (options.query && !isDummy(options.query)) {
      return [`https://www.google.com/maps/search/${encodeURIComponent(options.query.trim())}?hl=${lang}`];
    }

    return targets;
  }

  /**
   * Handle Google cookie consent popup if present
   */
  private static async handleConsent(page: Page): Promise<void> {
    try {
      for (const selector of SELECTORS.consentButtons) {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
          await button.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    } catch {
      // Ignore consent dismissal errors
    }
  }

  /**
   * Navigate to Google Maps and locate the target business
   */
  private static async navigateToBusiness(
    page: Page,
    targetUrl: string,
    options: ScrapeOptions
  ): Promise<string> {
    const hl = options.language || options.hl || 'id';

    let urlToLoad = targetUrl;
    if (
      !urlToLoad.includes('hl=') &&
      !urlToLoad.includes('maps.app.goo.gl') &&
      !urlToLoad.includes('goo.gl')
    ) {
      urlToLoad += (urlToLoad.includes('?') ? '&' : '?') + `hl=${hl}`;
    }

    log.info(`Navigating to: ${urlToLoad}`);
    await page.goto(urlToLoad, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.handleConsent(page);

    // Check if we are on a search result list (multiple places found)
    const firstResult = page.locator('a.hfpxzc').first();
    const isList = await firstResult.isVisible({ timeout: 4000 }).catch(() => false);

    if (isList) {
      log.info('Multiple results found. Selecting the first business result...');
      await firstResult.click();
      await page.waitForTimeout(2000);
    }

    // Wait for the business title to appear
    await page.waitForSelector(SELECTORS.title, { timeout: 30000 });
    return page.url();
  }

  /**
   * Extract coordinates from Google Maps URL
   */
  private static extractCoordinates(url: string): { latitude: number | null; longitude: number | null } {
    const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) {
      return {
        latitude: parseFloat(match[1]),
        longitude: parseFloat(match[2]),
      };
    }
    return { latitude: null, longitude: null };
  }

  /**
   * Scrape Google Business Profile details for one target
   */
  private static async scrapeSingleProfile(page: Page, targetUrl: string, options: ScrapeOptions): Promise<GBPProfile> {
    const finalUrl = await GBPScraper.navigateToBusiness(page, targetUrl, options);

    // Name
    const nameEl = page.locator(SELECTORS.title).first();
    const name = (await nameEl.textContent())?.trim() || '';

    // Rating
    let rating: number | null = null;
    const ratingEl = page.locator(SELECTORS.rating).first();
    if (await ratingEl.isVisible().catch(() => false)) {
      const rawRating = (await ratingEl.textContent())?.replace(',', '.').trim();
      if (rawRating) {
        const parsed = parseFloat(rawRating);
        if (!isNaN(parsed)) rating = parsed;
      }
    }

    // Review Count
    let reviewCount: number | null = null;
    const countEl = page.locator(SELECTORS.reviewCount).first();
    if (await countEl.isVisible().catch(() => false)) {
      const rawCount = await countEl.textContent();
      if (rawCount) {
        const digits = rawCount.replace(/\D/g, '');
        if (digits) reviewCount = parseInt(digits, 10);
      }
    }

    // Category
    let category: string | null = null;
    const categoryEl = page.locator(SELECTORS.category).first();
    if (await categoryEl.isVisible().catch(() => false)) {
      category = (await categoryEl.textContent())?.trim() || null;
    }

    // Address
    let address: string | null = null;
    const addressEl = page.locator(SELECTORS.address).first();
    if (await addressEl.isVisible().catch(() => false)) {
      address = (await addressEl.textContent())?.trim() || null;
    }

    // Phone
    let phone: string | null = null;
    const phoneEl = page.locator(SELECTORS.phone).first();
    if (await phoneEl.isVisible().catch(() => false)) {
      phone = (await phoneEl.textContent())?.trim() || null;
    }

    // Website
    let website: string | null = null;
    const websiteEl = page.locator(SELECTORS.website).first();
    if (await websiteEl.isVisible().catch(() => false)) {
      website = (await websiteEl.getAttribute('href')) || null;
    }

    // Opening Hours
    const openingHours: string[] = [];
    const hoursRows = page.locator(SELECTORS.openingHoursTable);
    const count = await hoursRows.count();
    for (let i = 0; i < count; i++) {
      const rowText = (await hoursRows.nth(i).textContent())?.trim();
      if (rowText) openingHours.push(rowText.replace(/\s+/g, ' '));
    }

    const { latitude, longitude } = GBPScraper.extractCoordinates(finalUrl);

    return {
      name,
      rating,
      reviewCount,
      category,
      address,
      phone,
      website,
      openingHours,
      placeUrl: finalUrl,
      latitude,
      longitude,
    };
  }

  /**
   * Scrape Google Business Profile details (supports single or multiple targets)
   */
  public static async scrapeProfile(options: ScrapeOptions): Promise<{ data: GBPProfile; results: GBPProfile[] }> {
    const targets = GBPScraper.resolveTargets(options);
    if (targets.length === 0) {
      throw new Error('At least one of "startUrls", "placeIds", "url", or "query" must be provided.');
    }

    const results: GBPProfile[] = [];
    let scrapeError: Error | null = null;

    const crawleeConfig = new Configuration({
      persistStorage: false,
      purgeOnStart: true,
    });

    const crawler = new PlaywrightCrawler({
      headless: config.headless,
      maxRequestsPerCrawl: targets.length,
      navigationTimeoutSecs: config.navigationTimeoutSecs,
      requestHandlerTimeoutSecs: 120,
      launchContext: {
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
          ],
        },
      },
      async requestHandler({ page, request }) {
        try {
          const profile = await GBPScraper.scrapeSingleProfile(page, request.url, options);
          results.push(profile);
        } catch (err: any) {
          scrapeError = err;
        }
      },
    }, crawleeConfig);

    const requests = targets.map((target) => ({
      url: target,
      uniqueKey: `${target}-${Date.now()}-${Math.random()}`,
    }));

    await crawler.run(requests);

    if (scrapeError && results.length === 0) {
      throw scrapeError;
    }
    if (results.length === 0) {
      throw new Error('Failed to scrape Google Business Profile details.');
    }

    return { data: results[0], results };
  }

  /**
   * Scrape Google Business reviews for one target
   */
  private static async scrapeSingleReviews(
    page: Page,
    targetUrl: string,
    options: ScrapeOptions
  ): Promise<{
    businessName: string;
    placeUrl: string;
    totalScraped: number;
    reviews: GBPReview[];
  }> {
    const maxReviews = Math.min(
      options.maxReviews || config.defaultMaxReviews,
      config.maxReviewsLimit
    );
    const includePersonalData = options.personalData ?? false;
    const startDate = options.reviewsStartDate ? new Date(options.reviewsStartDate) : null;

    const finalUrl = await GBPScraper.navigateToBusiness(page, targetUrl, options);
    const { latitude, longitude } = GBPScraper.extractCoordinates(finalUrl);
    const cidMatch = finalUrl.match(/:(0x[0-9a-fA-F]+)/);
    const cidHex = cidMatch ? cidMatch[1] : null;

    const nameEl = page.locator(SELECTORS.title).first();
    const businessName = (await nameEl.textContent())?.trim() || 'Unknown Business';

    // Click on the Reviews tab if available
    const reviewsTab = page.locator(SELECTORS.reviewsTab).first();
    if (await reviewsTab.isVisible({ timeout: 4000 }).catch(() => false)) {
      await reviewsTab.click();
      await page.waitForTimeout(1500);
    }

    // Apply review sort if specified
    if (options.sortBy && options.sortBy !== 'relevant') {
      try {
        const sortButton = page.locator(SELECTORS.reviewsSortButton).first();
        if (await sortButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sortButton.click();
          await page.waitForTimeout(1000);

          const sortSelector = SELECTORS.sortOptions[options.sortBy];
          if (sortSelector) {
            const targetOption = page.locator(sortSelector).first();
            if (await targetOption.isVisible({ timeout: 2000 }).catch(() => false)) {
              await targetOption.click();
              await page.waitForTimeout(2000);
            }
          }
        }
      } catch (err) {
        log.warning(`Could not apply review sort option '${options.sortBy}': ${err}`);
      }
    }

    // Extract total reviews count for logging
    let totalReviewsCount: number | null = null;
    const countEl = page.locator(SELECTORS.reviewCount).first();
    if (await countEl.isVisible({ timeout: 2000 }).catch(() => false)) {
      const rawCount = await countEl.textContent();
      if (rawCount) {
        const digits = rawCount.replace(/\D/g, '');
        if (digits) totalReviewsCount = parseInt(digits, 10);
      }
    }
    if (!totalReviewsCount) {
      const tabText =
        (await reviewsTab.getAttribute('aria-label').catch(() => '')) ||
        (await reviewsTab.textContent().catch(() => ''));
      if (tabText) {
        const digits = tabText.replace(/\D/g, '');
        if (digits) totalReviewsCount = parseInt(digits, 10);
      }
    }

    const logReviewProgress = (count: number) => {
      const total = totalReviewsCount || maxReviews;
      const progressCount = Math.min(count, maxReviews);
      console.log(`${new Date().toISOString()} INFO ⭐️ [${progressCount}/${total}] Extracting reviews from [${finalUrl}](${finalUrl})`);
    };

    // Locate review container for scrolling
    const scrollContainer = page.locator(SELECTORS.reviewsScrollContainer).first();
    const containerFound = await scrollContainer.isVisible({ timeout: 5000 }).catch(() => false);

    const reviews: GBPReview[] = [];
    let previousReviewCount = 0;
    let scrollStagnantCount = 0;

    const initialElements = page.locator(SELECTORS.reviewCard);
    const initialCount = await initialElements.count();
    if (initialCount > 0) {
      logReviewProgress(initialCount);
      previousReviewCount = initialCount;
    }

    while (previousReviewCount < maxReviews && scrollStagnantCount < 5) {
      const reviewElements = page.locator(SELECTORS.reviewCard);
      const currentCount = await reviewElements.count();

      if (currentCount === previousReviewCount) {
        scrollStagnantCount++;
      } else {
        scrollStagnantCount = 0;
        previousReviewCount = currentCount;
        logReviewProgress(currentCount);
      }

      if (currentCount >= maxReviews || scrollStagnantCount >= 5) {
        break;
      }

      // Scroll container down
      if (containerFound) {
        await scrollContainer.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
      } else {
        await page.mouse.wheel(0, 3000);
      }

      await page.waitForTimeout(1500);
    }

    // Extract review cards up to maxReviews
    const reviewCards = page.locator(SELECTORS.reviewCard);
    const totalCards = await reviewCards.count();
    const limit = Math.min(totalCards, maxReviews);

    for (let i = 0; i < limit; i++) {
      const card = reviewCards.nth(i);

      // Expand "See more" / "Lainnya" button if exists
      const expandButton = card.locator(SELECTORS.reviewExpandButton).first();
      if (await expandButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await expandButton.click().catch(() => {});
        await page.waitForTimeout(200);
      }

      // Relative date & estimated publishedAtDate
      const relativeTime = (await card.locator(SELECTORS.reviewDate).first().textContent().catch(() => ''))?.trim() || null;
      const parsedDate = relativeTime ? parseRelativeDate(relativeTime) : null;

      // Filter by reviewsStartDate if specified
      if (startDate && parsedDate && parsedDate < startDate) {
        if (options.sortBy === 'newest') {
          // Since it's sorted by newest, subsequent reviews will be even older
          break;
        }
        continue;
      }

      // Author name & profile link (respecting personalData flag)
      let author = 'Google user';
      let authorProfileUrl: string | null = null;

      if (includePersonalData) {
        const rawAuthor = (await card.locator(SELECTORS.reviewerName).first().textContent().catch(() => ''))?.trim() || 'Anonymous';
        author = rawAuthor.split(/\n|·|Local Guide/)[0].trim() || 'Anonymous';

        const authorLink = card.locator(SELECTORS.reviewerLink).first();
        authorProfileUrl = (await authorLink.getAttribute('href').catch(() => null)) || null;
      }

      // Rating
      let starRating = 5;
      const ratingEl = card.locator(SELECTORS.reviewRating).first();
      const ariaLabel = (await ratingEl.getAttribute('aria-label').catch(() => '')) || '';
      const ratingMatch = ariaLabel.match(/(\d+([.,]\d+)?)/);
      if (ratingMatch) {
        starRating = parseFloat(ratingMatch[1].replace(',', '.'));
      }

      // Review text
      const text = (await card.locator(SELECTORS.reviewText).first().textContent().catch(() => ''))?.trim() || null;

      // Likes
      let likes = 0;
      const likesEl = card.locator(SELECTORS.reviewLikes).first();
      if (await likesEl.isVisible().catch(() => false)) {
        const rawLikes = await likesEl.textContent().catch(() => '0');
        const digits = rawLikes?.replace(/\D/g, '');
        if (digits) likes = parseInt(digits, 10);
      }

      // Owner response
      let ownerResponse: { text: string; date: string | null } | null = null;
      const ownerEl = card.locator(SELECTORS.ownerResponse).first();
      if (await ownerEl.isVisible().catch(() => false)) {
        const respText = (await card.locator(SELECTORS.ownerResponseText).first().textContent().catch(() => ''))?.trim() || '';
        const respDate = (await card.locator(SELECTORS.ownerResponseDate).first().textContent().catch(() => ''))?.trim() || null;
        if (respText) {
          ownerResponse = { text: respText, date: respDate };
        }
      }

      // Extract reviewId from card attribute
      const reviewId = (await card.getAttribute('data-review-id').catch(() => null)) || null;

      // Build direct Google Maps review URL
      let reviewUrl: string | null = null;
      if (reviewId) {
        const latPart = latitude !== null && longitude !== null ? `@${latitude},${longitude},785m/` : '';
        const cidPart = cidHex ? `!2m1!1s0x0:${cidHex}` : '';
        reviewUrl = `https://www.google.com/maps/reviews/${latPart}data=!3m2!1e3!4b1!4m6!14m5!1m4!2m3!1s${reviewId}${cidPart}?entry=ttu`;
      }

      reviews.push({
        reviewId,
        reviewUrl,
        author,
        authorProfileUrl,
        rating: starRating,
        relativeTime,
        publishedAtDate: parsedDate ? parsedDate.toISOString() : null,
        text,
        likes,
        ownerResponse,
      });
    }

    return {
      businessName,
      placeUrl: finalUrl,
      totalScraped: reviews.length,
      reviews,
    };
  }

  /**
   * Scrape Google Business reviews (supports single or multiple targets)
   */
  public static async scrapeReviews(options: ScrapeOptions): Promise<{
    data: {
      businessName: string;
      placeUrl: string;
      totalScraped: number;
      reviews: GBPReview[];
    };
    results: Array<{
      businessName: string;
      placeUrl: string;
      totalScraped: number;
      reviews: GBPReview[];
    }>;
  }> {
    const targets = GBPScraper.resolveTargets(options);
    if (targets.length === 0) {
      throw new Error('At least one of "startUrls", "placeIds", "url", or "query" must be provided.');
    }

    const results: Array<{
      businessName: string;
      placeUrl: string;
      totalScraped: number;
      reviews: GBPReview[];
    }> = [];
    let scrapeError: Error | null = null;

    const crawleeConfig = new Configuration({
      persistStorage: false,
      purgeOnStart: true,
    });

    const crawler = new PlaywrightCrawler({
      headless: config.headless,
      maxRequestsPerCrawl: targets.length,
      navigationTimeoutSecs: config.navigationTimeoutSecs,
      requestHandlerTimeoutSecs: 240,
      launchContext: {
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
          ],
        },
      },
      async requestHandler({ page, request }) {
        try {
          const item = await GBPScraper.scrapeSingleReviews(page, request.url, options);
          results.push(item);
        } catch (err: any) {
          scrapeError = err;
        }
      },
    }, crawleeConfig);

    const requests = targets.map((target) => ({
      url: target,
      uniqueKey: `${target}-${Date.now()}-${Math.random()}`,
    }));

    await crawler.run(requests);

    if (scrapeError && results.length === 0) {
      throw scrapeError;
    }
    if (results.length === 0) {
      throw new Error('Failed to scrape Google Business reviews.');
    }

    return { data: results[0], results };
  }

  /**
   * Scrape both profile details and reviews for one target
   */
  private static async scrapeSingleFull(
    page: Page,
    targetUrl: string,
    options: ScrapeOptions
  ): Promise<{
    profile: GBPProfile;
    totalReviewsScraped: number;
    reviews: GBPReview[];
  }> {
    const profile = await GBPScraper.scrapeSingleProfile(page, targetUrl, options);
    const reviewsData = await GBPScraper.scrapeSingleReviews(page, targetUrl, options);

    return {
      profile,
      totalReviewsScraped: reviewsData.totalScraped,
      reviews: reviewsData.reviews,
    };
  }

  /**
   * Scrape both profile details and reviews (supports single or multiple targets)
   */
  public static async scrapeFull(options: ScrapeOptions): Promise<{
    data: {
      profile: GBPProfile;
      totalReviewsScraped: number;
      reviews: GBPReview[];
    };
    results: Array<{
      profile: GBPProfile;
      totalReviewsScraped: number;
      reviews: GBPReview[];
    }>;
  }> {
    const targets = GBPScraper.resolveTargets(options);
    if (targets.length === 0) {
      throw new Error('At least one of "startUrls", "placeIds", "url", or "query" must be provided.');
    }

    const results: Array<{
      profile: GBPProfile;
      totalReviewsScraped: number;
      reviews: GBPReview[];
    }> = [];
    let scrapeError: Error | null = null;

    const crawleeConfig = new Configuration({
      persistStorage: false,
      purgeOnStart: true,
    });

    const crawler = new PlaywrightCrawler({
      headless: config.headless,
      maxRequestsPerCrawl: targets.length,
      navigationTimeoutSecs: config.navigationTimeoutSecs,
      requestHandlerTimeoutSecs: 300,
      launchContext: {
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
          ],
        },
      },
      async requestHandler({ page, request }) {
        try {
          const item = await GBPScraper.scrapeSingleFull(page, request.url, options);
          results.push(item);
        } catch (err: any) {
          scrapeError = err;
        }
      },
    }, crawleeConfig);

    const requests = targets.map((target) => ({
      url: target,
      uniqueKey: `${target}-${Date.now()}-${Math.random()}`,
    }));

    await crawler.run(requests);

    if (scrapeError && results.length === 0) {
      throw scrapeError;
    }
    if (results.length === 0) {
      throw new Error('Failed to scrape Google Business Profile and reviews.');
    }

    return { data: results[0], results };
  }
}
