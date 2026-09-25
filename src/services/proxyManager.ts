import { ProxyConfiguration, log } from 'crawlee';
import * as net from 'node:net';
import { config } from '../config.js';

interface RawProxyItem {
  proxy: string;
  protocol: string;
  ip: string;
  port: number;
  https: boolean;
  anonymity: string;
  score: number;
  geolocation?: {
    country: string;
    city: string;
  };
}

export class ProxyManager {
  private static instance: ProxyManager;
  private proxies: RawProxyItem[] = [];
  private deadProxies: Set<string> = new Set();
  private verifiedPool: string[] = [];
  private lastFetchedAt: number = 0;
  private isFetching: boolean = false;
  private refreshTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startBackgroundRefresh();
  }

  public static getInstance(): ProxyManager {
    if (!ProxyManager.instance) {
      ProxyManager.instance = new ProxyManager();
    }
    return ProxyManager.instance;
  }

  private startBackgroundRefresh(): void {
    const intervalMs = config.proxyRefreshIntervalMinutes * 60 * 1000;
    this.refreshTimer = setInterval(() => {
      this.fetchProxies(true).catch((err) => {
        log.warning(`[ProxyManager] Background refresh failed: ${err.message}`);
      });
    }, intervalMs);

    if (this.refreshTimer.unref) {
      this.refreshTimer.unref();
    }
  }

  /**
   * Fast TCP connect check to verify if proxy host:port is listening
   */
  public async isProxyAlive(host: string, port: number, timeout = 1200): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect({ host, port, timeout }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Fetch fresh proxies from remote Proxifly source
   */
  public async fetchProxies(force = false): Promise<RawProxyItem[]> {
    const now = Date.now();
    const cacheValid = now - this.lastFetchedAt < config.proxyRefreshIntervalMinutes * 60 * 1000;

    if (!force && this.proxies.length > 0 && cacheValid) {
      return this.proxies;
    }

    if (this.isFetching) {
      return this.proxies;
    }

    this.isFetching = true;
    try {
      log.info(`[ProxyManager] Fetching proxy list from ${config.proxyListUrl} ...`);
      const response = await fetch(config.proxyListUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch proxies: HTTP ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as RawProxyItem[];
      if (!Array.isArray(data)) {
        throw new Error('Invalid proxy response format: expected an array');
      }

      // Filter valid protocols supported by Playwright: http, https, socks5
      const valid = data.filter(
        (item) => ['http', 'https', 'socks5'].includes(item.protocol) && item.proxy && item.ip && item.port
      );

      // Prioritize HTTPS & SOCKS5, shuffle for even distribution
      this.shuffle(valid);

      this.proxies = valid;
      this.lastFetchedAt = Date.now();
      this.verifiedPool = []; // Reset verified pool on new fetch
      log.info(`[ProxyManager] Successfully loaded ${this.proxies.length} proxies from Proxifly!`);
    } catch (err: any) {
      log.warning(`[ProxyManager] Error fetching proxies: ${err.message}`);
      if (this.proxies.length === 0) {
        throw err;
      }
    } finally {
      this.isFetching = false;
    }

    return this.proxies;
  }

  private shuffle<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  public markDead(proxyUrl: string): void {
    if (!proxyUrl) return;
    this.deadProxies.add(proxyUrl);
    this.verifiedPool = this.verifiedPool.filter((url) => url !== proxyUrl);
    log.warning(`[ProxyManager] ❌ Marked proxy as dead: ${proxyUrl}. Active dead count: ${this.deadProxies.size}`);
  }

  /**
   * Get active, verified alive proxies. Pre-checks candidates via fast TCP ping.
   */
  public async getWorkingPool(desiredCount = 50): Promise<string[]> {
    if (this.proxies.length === 0) {
      await this.fetchProxies();
    }

    // If verified pool already has enough proxies, return them
    const currentValid = this.verifiedPool.filter((url) => !this.deadProxies.has(url));
    if (currentValid.length >= desiredCount) {
      return currentValid.slice(0, desiredCount);
    }

    // Pick candidates to test
    const candidates = this.proxies
      .filter((item) => !this.deadProxies.has(item.proxy) && !this.verifiedPool.includes(item.proxy))
      .slice(0, desiredCount * 2);

    if (candidates.length > 0) {
      log.info(`[ProxyManager] Pre-validating ${candidates.length} proxy candidates via fast TCP ping...`);
      const results = await Promise.all(
        candidates.map(async (c) => {
          const alive = await this.isProxyAlive(c.ip, c.port);
          if (alive) {
            return c.proxy;
          } else {
            this.deadProxies.add(c.proxy);
            return null;
          }
        })
      );

      const newlyVerified = results.filter((url): url is string => Boolean(url));
      this.verifiedPool.push(...newlyVerified);
      log.info(`[ProxyManager] Verified ${newlyVerified.length} live proxies! Current active pool: ${this.verifiedPool.length}`);
    }

    const available = this.verifiedPool.filter((url) => !this.deadProxies.has(url));
    if (available.length > 0) {
      return available;
    }

    // Fallback: return top candidate proxies if none passed ping
    return this.proxies
      .filter((p) => !this.deadProxies.has(p.proxy))
      .slice(0, desiredCount)
      .map((p) => p.proxy);
  }

  /**
   * Create or resolve a Crawlee ProxyConfiguration
   */
  public async getProxyConfiguration(options?: {
    useProxy?: boolean;
    proxyUrl?: string;
    proxyUrls?: string[];
  }): Promise<ProxyConfiguration | undefined> {
    const shouldUseProxy = options?.useProxy !== undefined ? options.useProxy : config.useProxy;
    if (!shouldUseProxy) {
      return undefined;
    }

    if (options?.proxyUrl) {
      return new ProxyConfiguration({ proxyUrls: [options.proxyUrl.trim()] });
    }

    if (options?.proxyUrls && Array.isArray(options.proxyUrls) && options.proxyUrls.length > 0) {
      return new ProxyConfiguration({ proxyUrls: options.proxyUrls });
    }

    try {
      const workingPool = await this.getWorkingPool(50);
      if (workingPool.length === 0) {
        log.warning('[ProxyManager] No working proxies available, proceeding with direct connection.');
        return undefined;
      }

      log.info(`[ProxyManager] Initialized Crawlee ProxyConfiguration with ${workingPool.length} verified live proxies.`);
      return new ProxyConfiguration({
        proxyUrls: workingPool,
      });
    } catch (err: any) {
      log.error(`[ProxyManager] Failed to initialize proxy configuration: ${err.message}. Falling back to direct connection.`);
      return undefined;
    }
  }

  public getStats() {
    return {
      enabled: config.useProxy,
      totalLoaded: this.proxies.length,
      deadCount: this.deadProxies.size,
      verifiedAliveCount: this.verifiedPool.length,
      lastFetchedAt: this.lastFetchedAt ? new Date(this.lastFetchedAt).toISOString() : null,
      sourceUrl: config.proxyListUrl,
    };
  }
}

export const proxyManager = ProxyManager.getInstance();
