import { PlaywrightCrawler, Configuration, log } from 'crawlee';
import type { Page } from 'playwright';
import { SELECTORS } from './selectors.js';
import { config } from '../config.js';
import { proxyManager } from '../services/proxyManager.js';

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
  useProxy?: boolean;
  proxyUrl?: string;
  proxyUrls?: string[];
}

/**
 * Parses relative time strings into estimated Date objects
 */
export function parseRelativeDate(raw: string): Date | null {
  if (!raw) return null;
  const text = raw
    .toLowerCase()
    .replace(/^(respon|respons|tanggapan)\s+(dari\s+)?pemilik\s*:\s*/i, '')
    .replace(/^(diedit|edited|bearbeitet|gewijzigd)\s*/i, '')
    .trim();
  const now = new Date();

  // Days
  if (
    text.includes('hari lalu') || text.includes('hari yang lalu') ||
    text.includes('day ago') || text.includes('days ago') ||
    text.includes('tage') || text.includes('tagen') || text.includes('dagen geleden') || text.includes('días')
  ) {
    const match = text.match(/(\d+)/);
    const days = match ? parseInt(match[1], 10) : 1;
    now.setDate(now.getDate() - days);
    return now;
  }

  // Weeks
  if (
    text.includes('minggu lalu') || text.includes('minggu yang lalu') ||
    text.includes('seminggu') ||
    text.includes('week ago') || text.includes('weeks ago') ||
    text.includes('woche') || text.includes('wochen') || text.includes('weken geleden') || text.includes('semanas')
  ) {
    const match = text.match(/(\d+)/);
    const weeks = match ? parseInt(match[1], 10) : (text.includes('seminggu') || text.includes('a week') || text.includes('einem') ? 1 : 1);
    now.setDate(now.getDate() - weeks * 7);
    return now;
  }

  // Months
  if (
    text.includes('bulan lalu') || text.includes('bulan yang lalu') ||
    text.includes('sebulan') ||
    text.includes('month ago') || text.includes('months ago') ||
    text.includes('monat') || text.includes('monaten') || text.includes('maand') || text.includes('maanden') || text.includes('meses')
  ) {
    const match = text.match(/(\d+)/);
    const months = match ? parseInt(match[1], 10) : (text.includes('sebulan') || text.includes('a month') || text.includes('einem') ? 1 : 1);
    now.setMonth(now.getMonth() - months);
    return now;
  }

  // Years
  if (
    text.includes('tahun lalu') || text.includes('tahun yang lalu') ||
    text.includes('setahun') ||
    text.includes('year ago') || text.includes('years ago') ||
    text.includes('jahr') || text.includes('jahren') || text.includes('jaar') || text.includes('años')
  ) {
    const match = text.match(/(\d+)/);
    const years = match ? parseInt(match[1], 10) : (text.includes('setahun') || text.includes('a year') || text.includes('einem') ? 1 : 1);
    now.setFullYear(now.getFullYear() - years);
    return now;
  }

  // Yesterday
  if (text.includes('kemarin') || text.includes('yesterday') || text.includes('gestern') || text.includes('gisteren')) {
    now.setDate(now.getDate() - 1);
    return now;
  }

  // Hours / Minutes
  if (
    text.includes('jam lalu') || text.includes('jam yang lalu') ||
    text.includes('hour ago') || text.includes('hours ago') || text.includes('stunde') || text.includes('stunden') || text.includes('uur geleden') ||
    text.includes('menit lalu') || text.includes('menit yang lalu') ||
    text.includes('minute ago') || text.includes('minutes ago') || text.includes('minute') || text.includes('minuten') ||
    text.includes('baru saja') || text.includes('just now')
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

    const cleanGoogleUrl = (rawUrl: string): string => {
      if (rawUrl.includes('consent.google.com')) {
        try {
          const parsed = new URL(rawUrl);
          const cont = parsed.searchParams.get('continue');
          if (cont && isValidHttpUrl(cont)) {
            return cont;
          }
        } catch {
          // ignore
        }
      }
      return rawUrl;
    };

    // 1. Single direct URL (highest priority for single place)
    if (options.url && !isDummy(options.url)) {
      const trimmed = cleanGoogleUrl(options.url.trim());
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
          const trimmed = cleanGoogleUrl(item.url.trim());
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
   * Pre-configures page viewport and bypasses Google consent dialogs via SOCS/CONSENT/PREF cookies and language headers
   */
  public static async preparePageForGoogle(page: Page, gotoOptions?: any, options?: ScrapeOptions): Promise<void> {
    const hl = (options?.language || options?.hl || 'id').toLowerCase();
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
    if (gotoOptions) {
      gotoOptions.waitUntil = 'domcontentloaded';
      gotoOptions.timeout = 35000;
    }
    try {
      // 1. Set Accept-Language HTTP header to match requested language
      await page.context().setExtraHTTPHeaders({
        'Accept-Language': `${hl}-${hl.toUpperCase()},${hl};q=0.9,en-US;q=0.8,en;q=0.7`,
      }).catch(() => {});

      // 2. Set Cookies for Consent and Language Preference (PREF)
      const domains = [
        '.google.com',
        '.google.co.id',
        '.google.nl',
        '.google.de',
        '.google.fr',
        '.google.co.uk',
        '.google.es',
        '.google.it',
        '.google.pl',
        '.google.com.au',
      ];
      const cookies = domains.flatMap((domain) => [
        {
          name: 'SOCS',
          value: 'CAESHAgBEhJnd3NfMjAyNDA3MjMtMF9SQzIaAmVuIAEaBgiA_LyuBg',
          domain,
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 31536000,
        },
        {
          name: 'CONSENT',
          value: 'PENDING+999',
          domain,
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 31536000,
        },
        {
          name: 'PREF',
          value: `hl=${hl}&gl=${hl.toUpperCase()}`,
          domain,
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 31536000,
        },
      ]);
      await page.context().addCookies(cookies);
    } catch {
      // Ignore cookie injection errors
    }
  }

  /**
   * Handle Google cookie consent popup or redirect if present
   */
  private static async handleConsent(page: Page): Promise<void> {
    try {
      // 1. If currently on consent.google.com
      if (page.url().includes('consent.google.com')) {
        log.info(`[Consent] Page is on consent.google.com (${page.url()}). Dismissing consent...`);
        for (const selector of SELECTORS.consentButtons) {
          const button = page.locator(selector).first();
          if (await button.isVisible({ timeout: 1500 }).catch(() => false)) {
            await button.click().catch(() => {});
            await page.waitForTimeout(1000);
            break;
          }
        }

        // Wait for redirect away from consent.google.com
        await page.waitForURL((url) => !url.href.includes('consent.google.com'), { timeout: 10000 }).catch(() => {});

        // If STILL on consent.google.com, extract 'continue' parameter and navigate directly
        if (page.url().includes('consent.google.com')) {
          try {
            const continueUrl = new URL(page.url()).searchParams.get('continue');
            if (continueUrl) {
              log.info(`[Consent] Bypassing consent redirect by directly navigating to continue target: ${continueUrl}`);
              await page.goto(continueUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
            }
          } catch {
            // Ignore URL parsing errors
          }
        }
      }

      // 2. Regular consent modal on Google Maps page
      for (const selector of SELECTORS.consentButtons) {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 1500 }).catch(() => false)) {
          await button.click().catch(() => {});
          await page.waitForTimeout(1000);
          break;
        }
      }

      // 3. Check within iframes
      for (const frame of page.frames()) {
        if (frame.url().includes('consent.google.com')) {
          for (const selector of SELECTORS.consentButtons) {
            const btn = frame.locator(selector).first();
            if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
              await btn.click().catch(() => {});
              await page.waitForTimeout(1000);
              break;
            }
          }
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
    const hl = (options.language || options.hl || 'id').toLowerCase();

    // 0. If target is a shortlink, resolve it first via HEAD request to prevent language loss on redirect
    if (targetUrl.includes('maps.app.goo.gl') || targetUrl.includes('goo.gl')) {
      try {
        const headRes = await fetch(targetUrl, { method: 'HEAD', redirect: 'manual' });
        const location = headRes.headers.get('location');
        if (location && location.startsWith('http')) {
          log.info(`Resolved shortlink ${targetUrl} -> ${location}`);
          targetUrl = location;
        }
      } catch {
        // Proceed with original targetUrl if fetch fails
      }
    }

    // If already on Google Maps business page and title is visible, reuse the page
    const currentUrl = page.url();
    const isAlreadyOnPlace = !currentUrl.includes('consent.google.com') &&
      (await page.locator(SELECTORS.title).first().isVisible({ timeout: 1000 }).catch(() => false));
    if (isAlreadyOnPlace && (currentUrl.includes('/maps/place') || currentUrl.includes('place_id'))) {
      return currentUrl;
    }

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

    // If still on consent.google.com, attempt continue redirect
    if (page.url().includes('consent.google.com')) {
      const continueTarget = new URL(page.url()).searchParams.get('continue');
      if (continueTarget) {
        log.info(`[Consent] Navigating directly to continue target: ${continueTarget}`);
        await page.goto(continueTarget, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await this.handleConsent(page);
      }
    }

    // Ensure requested language param is active on the current navigated page
    const afterNavUrl = page.url();
    if (!afterNavUrl.includes('consent.google.com') && !afterNavUrl.includes(`hl=${hl}`)) {
      const enforcedUrl = afterNavUrl + (afterNavUrl.includes('?') ? '&' : '?') + `hl=${hl}`;
      log.info(`Enforcing requested language '${hl}' on: ${enforcedUrl}`);
      await page.goto(enforcedUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await this.handleConsent(page);
    }

    // Check if we are on a search result list (multiple places found)
    const firstResult = page.locator('a.hfpxzc').first();
    const isList = await firstResult.isVisible({ timeout: 4000 }).catch(() => false);

    if (isList) {
      log.info('Multiple results found. Selecting the first business result...');
      await firstResult.click();
      await page.waitForTimeout(2000);
      await this.handleConsent(page);
    }

    if (page.url().includes('consent.google.com')) {
      throw new Error(`Failed to bypass Google consent page: ${page.url()}`);
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
      const rawText = (await countEl.textContent()) || '';
      const ariaLabel = (await countEl.getAttribute('aria-label')) || '';
      const textToParse = ariaLabel || rawText;
      if (textToParse) {
        const digits = textToParse.replace(/\D/g, '');
        if (digits) reviewCount = parseInt(digits, 10);
      }
    }

    // Fallback 1: Check parent container div.F7nice text e.g. "4,5(68)"
    if (reviewCount === null) {
      const f7nice = page.locator('div.F7nice').first();
      if (await f7nice.isVisible().catch(() => false)) {
        const f7Text = (await f7nice.textContent()) || '';
        const match = f7Text.match(/\(([\d.,]+)\)/);
        if (match) {
          const parsed = parseInt(match[1].replace(/\D/g, ''), 10);
          if (!isNaN(parsed)) reviewCount = parsed;
        }
      }
    }

    // Fallback 2: Check reviews tab button aria-label e.g. "68 ulasan"
    if (reviewCount === null) {
      const tabEl = page.locator('button[role="tab"][aria-label*="ulasan" i], button[role="tab"][aria-label*="review" i]').first();
      if (await tabEl.isVisible().catch(() => false)) {
        const tabLabel = (await tabEl.getAttribute('aria-label')) || (await tabEl.textContent()) || '';
        const match = tabLabel.match(/(\d+[\d.,]*)\s*(?:ulasan|review)/i);
        if (match) {
          const parsed = parseInt(match[1].replace(/\D/g, ''), 10);
          if (!isNaN(parsed)) reviewCount = parsed;
        }
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
    const hoursDropdown = page.locator(SELECTORS.openingHoursDropdown).first();
    if (await hoursDropdown.isVisible({ timeout: 1500 }).catch(() => false)) {
      await hoursDropdown.click().catch(() => {});
      await page.waitForTimeout(600);
    }

    const hoursRows = page.locator(SELECTORS.openingHoursTable);
    const count = await hoursRows.count();
    for (let i = 0; i < count; i++) {
      const row = hoursRows.nth(i);
      const cells = row.locator('td');
      const cellCount = await cells.count();
      if (cellCount >= 2) {
        const day = (await cells.nth(0).textContent())?.trim();
        const time = (await cells.nth(1).textContent())?.trim();
        if (day && time) {
          openingHours.push(`${day}: ${time}`.replace(/\s+/g, ' '));
          continue;
        }
      }
      const rowText = (await row.textContent())?.trim();
      if (rowText) {
        openingHours.push(rowText.replace(/\s+/g, ' '));
      }
    }

    // Fallback: check button with data-value or aria-label (e.g. data-value="Jumat,07.30–17.00")
    if (openingHours.length === 0) {
      const copyBtn = page.locator('button.mWUh3d, button[aria-label*="Salin jam buka"], button[data-value*=","]').first();
      if (await copyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        const val = await copyBtn.getAttribute('data-value');
        if (val) {
          openingHours.push(val.replace(',', ': '));
        }
      }
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

    const proxyConfiguration = await proxyManager.getProxyConfiguration(options);

    const crawler = new PlaywrightCrawler({
      headless: config.headless,
      proxyConfiguration,
      useSessionPool: true,
      sessionPoolOptions: {
        maxPoolSize: 100,
        sessionOptions: {
          maxErrorScore: 1,
        },
      },
      maxRequestRetries: config.maxRequestRetries || 5,
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
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            `--lang=${(options.language || options.hl || 'id').toLowerCase()}`,
          ],
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
      preNavigationHooks: [
        async ({ page }, gotoOptions: any) => {
          await GBPScraper.preparePageForGoogle(page, gotoOptions, options);
        },
      ],
      errorHandler({ request, session, proxyInfo }, error) {
        if (proxyInfo?.url) {
          proxyManager.markDead(proxyInfo.url);
          log.warning(`[Proxy Rotator] Proxy ${proxyInfo.url} failed for ${request.url} (${error.message}). Retiring session and switching proxy...`);
        }
        session?.retire();
      },
      failedRequestHandler({ request, proxyInfo }, error) {
        if (proxyInfo?.url) {
          proxyManager.markDead(proxyInfo.url);
        }
        log.error(`[Crawler] Request ${request.url} failed after maximum retries with proxy ${proxyInfo?.url || 'direct'}: ${error.message}`);
      },
      async requestHandler({ page, request, proxyInfo }) {
        if (proxyInfo?.url) {
          log.info(`[Crawler] Scraping profile ${request.url} via proxy: ${proxyInfo.url}`);
        }
        try {
          const profile = await GBPScraper.scrapeSingleProfile(page, request.url, options);
          results.push(profile);
        } catch (err: any) {
          scrapeError = err;
          throw err;
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

    // Wait briefly for review cards to populate in DOM if not present yet
    await page.waitForSelector(SELECTORS.reviewCard, { timeout: 6000 }).catch(() => null);

    // Expand all visible "See more" / "Lainnya" buttons
    await page.evaluate(() => {
      const expandButtons = document.querySelectorAll(
        'button.w8nwRe.kyuRq, button[aria-label*="Lihat lainnya" i], button[aria-label*="See more" i]'
      );
      expandButtons.forEach((b: any) => b.click());
    }).catch(() => {});
    await page.waitForTimeout(200);

    // Extract all cards in browser context for ultra-fast, timeout-free extraction
    const rawCardsData = await page.evaluate((maxCount) => {
      const cards = Array.from(document.querySelectorAll('div.jftiEf'));
      const limit = Math.min(cards.length, maxCount);
      return cards.slice(0, limit).map((card) => {
        // Author
        const nameEl = card.querySelector('div.d4r55');
        const rawAuthor = nameEl ? nameEl.textContent?.trim() || '' : '';
        const author = rawAuthor.split(/\n|·|Local Guide/)[0].trim() || 'Anonymous';

        const linkEl = card.querySelector('button.al6Kxe, a[data-href*="contrib"]');
        const authorProfileUrl = linkEl ? (linkEl.getAttribute('href') || linkEl.getAttribute('data-href')) : null;

        // Rating
        const ratingEl = card.querySelector('span.kvMYJc');
        const ariaLabel = ratingEl ? (ratingEl.getAttribute('aria-label') || '') : '';
        const match = ariaLabel.match(/(\d+([.,]\d+)?)/);
        const rating = match ? parseFloat(match[1].replace(',', '.')) : 5;

        // Date
        const dateEl = card.querySelector('span.rsqaWe');
        const relativeTime = dateEl ? dateEl.textContent?.trim() || null : null;

        // Text
        const textEl = card.querySelector('span.wiI7m, div.MyEned span, div[lang] span');
        const text = textEl ? textEl.textContent?.trim() || null : null;

        // Likes
        const likesEl = card.querySelector('span.pkWtMe, button[aria-label*="orang merasa" i], button[aria-label*="people found" i]');
        let likes = 0;
        if (likesEl) {
          const digits = (likesEl.textContent || '').replace(/\D/g, '');
          if (digits) likes = parseInt(digits, 10);
        }

        // Owner response
        let ownerResponse: { text: string; date: string | null } | null = null;
        const ownerEl = card.querySelector('div.CDe7pd');
        if (ownerEl) {
          const respTextEl = ownerEl.querySelector('div.wiI7pd, div.wiI7m, div[lang]');
          const respDateEl = ownerEl.querySelector('span.DZSIDd, span.DHIhFt');
          const respText = respTextEl ? respTextEl.textContent?.replace(/Lainnya|More$/, '').trim() || '' : '';
          const respDate = respDateEl ? respDateEl.textContent?.trim() || null : null;
          if (respText) {
            ownerResponse = { text: respText, date: respDate };
          }
        }

        const reviewId = card.getAttribute('data-review-id');

        return {
          reviewId,
          author,
          authorProfileUrl,
          rating,
          relativeTime,
          text,
          likes,
          ownerResponse,
        };
      });
    }, maxReviews);

    for (const raw of rawCardsData) {
      const parsedDate = raw.relativeTime ? parseRelativeDate(raw.relativeTime) : null;

      // Filter by reviewsStartDate if specified
      if (startDate && parsedDate && parsedDate < startDate) {
        if (options.sortBy === 'newest') {
          // Since it's sorted by newest, subsequent reviews will be even older
          break;
        }
        continue;
      }

      // Build direct Google Maps review URL
      let reviewUrl: string | null = null;
      if (raw.reviewId) {
        const latPart = latitude !== null && longitude !== null ? `@${latitude},${longitude},785m/` : '';
        const cidPart = cidHex ? `!2m1!1s0x0:${cidHex}` : '';
        reviewUrl = `https://www.google.com/maps/reviews/${latPart}data=!3m2!1e3!4b1!4m6!14m5!1m4!2m3!1s${raw.reviewId}${cidPart}?entry=ttu`;
      }

      let ownerResponse = raw.ownerResponse;
      if (ownerResponse && ownerResponse.date) {
        const parsedOwnerDate = parseRelativeDate(ownerResponse.date);
        ownerResponse = {
          text: ownerResponse.text,
          date: parsedOwnerDate ? parsedOwnerDate.toISOString() : ownerResponse.date,
        };
      }

      reviews.push({
        reviewId: raw.reviewId,
        reviewUrl,
        author: includePersonalData ? raw.author : 'Google user',
        authorProfileUrl: includePersonalData ? raw.authorProfileUrl : null,
        rating: raw.rating,
        relativeTime: raw.relativeTime,
        publishedAtDate: parsedDate ? parsedDate.toISOString() : null,
        text: raw.text,
        likes: raw.likes,
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

    const proxyConfiguration = await proxyManager.getProxyConfiguration(options);

    const crawler = new PlaywrightCrawler({
      headless: config.headless,
      proxyConfiguration,
      useSessionPool: true,
      sessionPoolOptions: {
        maxPoolSize: 100,
        sessionOptions: {
          maxErrorScore: 1,
        },
      },
      maxRequestRetries: config.maxRequestRetries || 5,
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
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            `--lang=${(options.language || options.hl || 'id').toLowerCase()}`,
          ],
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
      preNavigationHooks: [
        async ({ page }, gotoOptions: any) => {
          await GBPScraper.preparePageForGoogle(page, gotoOptions, options);
        },
      ],
      errorHandler({ request, session, proxyInfo }, error) {
        if (proxyInfo?.url) {
          proxyManager.markDead(proxyInfo.url);
          log.warning(`[Proxy Rotator] Proxy ${proxyInfo.url} failed for ${request.url} (${error.message}). Retiring session and switching proxy...`);
        }
        session?.retire();
      },
      failedRequestHandler({ request, proxyInfo }, error) {
        if (proxyInfo?.url) {
          proxyManager.markDead(proxyInfo.url);
        }
        log.error(`[Crawler] Request ${request.url} failed after maximum retries with proxy ${proxyInfo?.url || 'direct'}: ${error.message}`);
      },
      async requestHandler({ page, request, proxyInfo }) {
        if (proxyInfo?.url) {
          log.info(`[Crawler] Scraping reviews ${request.url} via proxy: ${proxyInfo.url}`);
        }
        try {
          const item = await GBPScraper.scrapeSingleReviews(page, request.url, options);
          results.push(item);
        } catch (err: any) {
          scrapeError = err;
          throw err;
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

    const proxyConfiguration = await proxyManager.getProxyConfiguration(options);

    const crawler = new PlaywrightCrawler({
      headless: config.headless,
      proxyConfiguration,
      useSessionPool: true,
      sessionPoolOptions: {
        maxPoolSize: 100,
        sessionOptions: {
          maxErrorScore: 1,
        },
      },
      maxRequestRetries: config.maxRequestRetries || 5,
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
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            `--lang=${(options.language || options.hl || 'id').toLowerCase()}`,
          ],
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
      preNavigationHooks: [
        async ({ page }, gotoOptions: any) => {
          await GBPScraper.preparePageForGoogle(page, gotoOptions, options);
        },
      ],
      errorHandler({ request, session, proxyInfo }, error) {
        if (proxyInfo?.url) {
          proxyManager.markDead(proxyInfo.url);
          log.warning(`[Proxy Rotator] Proxy ${proxyInfo.url} failed for ${request.url} (${error.message}). Retiring session and switching proxy...`);
        }
        session?.retire();
      },
      failedRequestHandler({ request, proxyInfo }, error) {
        if (proxyInfo?.url) {
          proxyManager.markDead(proxyInfo.url);
        }
        log.error(`[Crawler] Request ${request.url} failed after maximum retries with proxy ${proxyInfo?.url || 'direct'}: ${error.message}`);
      },
      async requestHandler({ page, request, proxyInfo }) {
        if (proxyInfo?.url) {
          log.info(`[Crawler] Scraping full ${request.url} via proxy: ${proxyInfo.url}`);
        }
        try {
          const item = await GBPScraper.scrapeSingleFull(page, request.url, options);
          results.push(item);
        } catch (err: any) {
          scrapeError = err;
          throw err;
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
