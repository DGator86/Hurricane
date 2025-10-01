export type FetchLike = (input: string, init?: any) => Promise<any>

export type ClientOptions = {
  baseUrl?: string
  token?: string
  predictPath?: string
  enhancedPath?: string
  flowPath?: string
  timeoutMs?: number
  fetchImpl?: FetchLike
}

export class UnusualWhalesClient {
  private baseUrl: string
  private token?: string
  private predictPath: string
  private enhancedPath: string
  private flowPath: string
  private timeoutMs: number
  private fetchImpl: FetchLike

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.unusualwhales.com').replace(/\/$/, '')
    this.token = options.token
    this.predictPath = options.predictPath ?? '/v2/hurricane/predict'
    this.enhancedPath = options.enhancedPath ?? '/v2/hurricane/predict/enhanced'
    this.flowPath = options.flowPath ?? '/v2/options/flow'
    this.timeoutMs = options.timeoutMs ?? 30000
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  get enabled(): boolean {
    return Boolean(this.token)
  }

  private buildUrl(path: string, params?: Record<string, string | undefined>): string {
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(`${this.baseUrl}/${path.replace(/^\//, '')}`)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value)
        }
      }
    }

    return url.toString()
  }

  private buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
      Accept: 'application/json',
      'User-Agent': 'hurricane-api-proxy/1.0'
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    return headers
  }

  private async request(path: string, params?: Record<string, string | undefined>): Promise<any> {
    if (!this.enabled) {
      throw new Error('Unusual Whales API token is not configured')
    }

    const requestUrl = this.buildUrl(path, params)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: any
    try {
      response = await this.fetchImpl(requestUrl, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Unusual Whales request failed (${response.status}): ${text}`)
    }

    return response.json()
  }

  fetchPrediction(symbol: string, asof?: string) {
    return this.request(this.predictPath, {
      symbol: symbol.toUpperCase(),
      asof
    })
  }

  fetchEnhancedPrediction(symbol: string, asof?: string) {
    return this.request(this.enhancedPath, {
      symbol: symbol.toUpperCase(),
      asof
    })
  }

  fetchFlow(symbol: string) {
    return this.request(this.flowPath, {
      symbol: symbol.toUpperCase()
    })
  }
}

export function buildUnusualWhalesClient(
  env: Record<string, string | undefined>,
  overrides: Partial<ClientOptions> = {}
) {
  const timeoutEnv = env['UNUSUAL_WHALES_TIMEOUT']
  const timeoutParsed = timeoutEnv ? Number.parseInt(timeoutEnv, 10) : undefined
  const resolvedTimeout =
    typeof timeoutParsed === 'number' && Number.isFinite(timeoutParsed)
      ? timeoutParsed
      : undefined
  return new UnusualWhalesClient({
    baseUrl: overrides.baseUrl ?? env['UNUSUAL_WHALES_API_BASE'],
    token: overrides.token ?? env['UNUSUAL_WHALES_API_TOKEN'],
    predictPath: overrides.predictPath ?? env['UNUSUAL_WHALES_PREDICT_PATH'],
    enhancedPath: overrides.enhancedPath ?? env['UNUSUAL_WHALES_ENHANCED_PATH'],
    flowPath: overrides.flowPath ?? env['UNUSUAL_WHALES_FLOW_PATH'],
    timeoutMs: overrides.timeoutMs ?? resolvedTimeout
  })
}

export type { ClientOptions as UnusualWhalesClientOptions }
