export type UnusualWhalesVariant =
  | 'chains'
  | 'flow'
  | 'sweeps'
  | 'alerts'
  | 'darkpool'
  | 'intraday'
  | 'volume'
  | 'unusual'
  | 'greek_exposure'
  | 'gex'
  | 'gamma_exposure';

export interface UnusualWhalesVariantResult {
  variant: UnusualWhalesVariant | string;
  success: boolean;
  endpoint?: string;
  fetchedAt: string;
  data?: any;
  error?: string;
  status?: number;
  attempts: string[];
}

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  init?: RequestInit;
}

export class UnusualWhalesClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultVariants: UnusualWhalesVariant[] = [
    'chains',
    'flow',
    'sweeps',
    'alerts',
    'darkpool',
    'intraday',
    'volume',
    'greek_exposure'
  ];

  private static readonly VARIANT_ALIASES: Record<string, UnusualWhalesVariant> = {
    gex: 'greek_exposure',
    gamma_exposure: 'greek_exposure'
  };

  private static readonly VARIANT_ENDPOINTS: Record<UnusualWhalesVariant, string[]> = {
    chains: [
      '/options/chain',
      '/options/chains',
      '/options/live_chain',
      '/options/live_chains',
      '/historic_chains',
      '/chains'
    ],
    flow: [
      '/options/flow',
      '/flow/options',
      '/flow/unusual',
      '/flow'
    ],
    sweeps: [
      '/options/sweeps',
      '/flow/sweeps',
      '/sweeps'
    ],
    alerts: [
      '/options/alerts',
      '/alerts/options',
      '/alerts'
    ],
    darkpool: [
      '/darkpool',
      '/flow/darkpool',
      '/options/darkpool'
    ],
    intraday: [
      '/options/intraday',
      '/intraday/options',
      '/intraday'
    ],
    volume: [
      '/options/volume',
      '/flow/volume',
      '/volume/options'
    ],
    unusual: [
      '/options/unusual',
      '/unusual/options',
      '/unusual'
    ],
    greek_exposure: [
      '/stocks/:symbol/greek_exposure',
      '/stocks/{symbol}/greek_exposure',
      '/options/greek_exposure',
      '/options/gex',
      '/greek_exposure',
      '/greek-exposure',
      '/gex'
    ],
    gex: [
      '/stocks/:symbol/greek_exposure',
      '/stocks/{symbol}/greek_exposure',
      '/options/greek_exposure',
      '/options/gex',
      '/greek_exposure',
      '/greek-exposure',
      '/gex'
    ],
    gamma_exposure: [
      '/stocks/:symbol/greek_exposure',
      '/stocks/{symbol}/greek_exposure',
      '/options/greek_exposure',
      '/options/gex',
      '/greek_exposure',
      '/greek-exposure',
      '/gex'
    ]
  };

  constructor({ apiKey, baseUrl }: { apiKey?: string; baseUrl?: string } = {}) {
    this.apiKey = apiKey?.trim();
    const normalizedBase = (baseUrl || 'https://phx.unusualwhales.com/api').trim();
    this.baseUrl = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
  }

  async fetchAllVariants(
    symbol: string,
    variants: (UnusualWhalesVariant | string)[] = this.defaultVariants
  ): Promise<Record<string, UnusualWhalesVariantResult>> {
    const results: Record<string, UnusualWhalesVariantResult> = {};

    await Promise.all(
      variants.map(async (variant) => {
        const result = await this.fetchVariant(symbol, variant as UnusualWhalesVariant);
        results[variant] = result;
        const canonical = this.normalizeVariantName(variant as UnusualWhalesVariant);
        if (canonical !== variant && !results[canonical]) {
          results[canonical] = result;
        }
      })
    );

    return results;
  }

  async fetchVariant(
    symbol: string,
    variant: UnusualWhalesVariant | string
  ): Promise<UnusualWhalesVariantResult> {
    const canonicalVariant = this.normalizeVariantName(variant as UnusualWhalesVariant);
    const fetchedAt = new Date().toISOString();
    const attempts: string[] = [];

    if (!this.apiKey) {
      return {
        variant,
        success: false,
        fetchedAt,
        attempts,
        error: 'Missing Unusual Whales API key'
      };
    }

    const endpoints =
      UnusualWhalesClient.VARIANT_ENDPOINTS[canonicalVariant] ||
      UnusualWhalesClient.VARIANT_ENDPOINTS[variant as UnusualWhalesVariant] ||
      [`/${canonicalVariant}`];
    let lastError: any = null;

    for (const endpoint of endpoints) {
      attempts.push(endpoint);
      try {
        const { path, params } = this.buildRequestConfig(endpoint, canonicalVariant, symbol);
        const data = await this.request(path, { params });

        return {
          variant,
          success: true,
          fetchedAt,
          endpoint,
          attempts,
          data
        };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      variant,
      success: false,
      fetchedAt,
      attempts,
      error: lastError?.message || 'Failed to fetch variant',
      status: typeof lastError?.status === 'number' ? lastError.status : undefined
    };
  }

  private async request(path: string, options: RequestOptions = {}): Promise<any> {
    const url = this.buildUrl(path, options.params);
    const response = await fetch(url, {
      ...options.init,
      headers: this.buildHeaders(options.init?.headers)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      const error = new Error(`Unusual Whales request failed: ${response.status} ${text}`);
      (error as any).status = response.status;
      throw error;
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return text;
    }
  }

  private normalizeVariantName(variant: UnusualWhalesVariant | string): UnusualWhalesVariant {
    const lower = variant.toLowerCase();
    return (
      UnusualWhalesClient.VARIANT_ALIASES[lower] ||
      (Object.keys(UnusualWhalesClient.VARIANT_ENDPOINTS).includes(lower)
        ? (lower as UnusualWhalesVariant)
        : (variant as UnusualWhalesVariant))
    );
  }

  private buildRequestConfig(
    endpoint: string,
    variant: UnusualWhalesVariant,
    symbol: string
  ): { path: string; params: Record<string, string | number | boolean> } {
    const symbolUpper = symbol.toUpperCase();
    const expanded = endpoint
      .replace(/\{symbol\}/gi, symbolUpper)
      .replace(/\{ticker\}/gi, symbolUpper)
      .replace(/:symbol/gi, symbolUpper)
      .replace(/:ticker/gi, symbolUpper);

    const params: Record<string, string | number | boolean> = {};
    if (!expanded.includes(symbolUpper)) {
      params.symbol = symbolUpper;
    }

    if (variant !== 'greek_exposure') {
      params.live = 'true';
      params.limit = 250;
    }

    return { path: expanded, params };
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalized}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private buildHeaders(extra?: HeadersInit): HeadersInit {
    const baseHeaders: HeadersInit = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      (baseHeaders as Record<string, string>).Authorization = `Bearer ${this.apiKey}`;
    }

    if (!extra) {
      return baseHeaders;
    }

    if (Array.isArray(extra)) {
      return [...extra, ...Object.entries(baseHeaders)];
    }

    return { ...baseHeaders, ...extra };
  }
}
