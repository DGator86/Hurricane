export interface AlpacaCredentials {
  apiKey: string
  apiSecret: string
  baseUrl?: string
}

export interface AlpacaOrderRequest {
  symbol: string
  qty?: number
  notional?: number
  side: 'buy' | 'sell'
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop'
  time_in_force: 'day' | 'gtc' | 'opg' | 'ioc' | 'fok'
  limit_price?: number
  stop_price?: number
  trail_price?: number
  trail_percent?: number
  extended_hours?: boolean
  order_class?: 'simple' | 'bracket' | 'oco' | 'oto'
  take_profit?: {
    limit_price: number
  }
  stop_loss?: {
    stop_price: number
    limit_price?: number
  }
  client_order_id?: string
}

export class AlpacaClient {
  private readonly baseUrl: string

  constructor(private readonly credentials: AlpacaCredentials) {
    if (!credentials.apiKey || !credentials.apiSecret) {
      throw new Error('Missing Alpaca API credentials')
    }

    const base = credentials.baseUrl?.trim() || 'https://paper-api.alpaca.markets'
    this.baseUrl = base.endsWith('/') ? base.slice(0, -1) : base
  }

  private buildHeaders(extra?: HeadersInit): HeadersInit {
    const baseHeaders: HeadersInit = {
      'APCA-API-KEY-ID': this.credentials.apiKey,
      'APCA-API-SECRET-KEY': this.credentials.apiSecret,
      'Content-Type': 'application/json'
    }

    if (!extra) {
      return baseHeaders
    }

    if (Array.isArray(extra)) {
      return [...extra, ...Object.entries(baseHeaders)]
    }

    return { ...baseHeaders, ...extra }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`

    const response = await fetch(url, {
      ...init,
      headers: this.buildHeaders(init?.headers)
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      const error = new Error(`Alpaca request failed: ${response.status} ${errorText}`)
      ;(error as any).status = response.status
      throw error
    }

    if (response.status === 204) {
      return undefined as T
    }

    const text = await response.text()
    if (!text) {
      return undefined as T
    }

    return JSON.parse(text) as T
  }

  async getAccount(): Promise<any> {
    return this.request('/v2/account')
  }

  async getPositions(): Promise<any[]> {
    return this.request('/v2/positions')
  }

  async listOrders(params: { status?: string; limit?: number } = {}): Promise<any[]> {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    const path = query ? `/v2/orders?${query}` : '/v2/orders'
    return this.request(path)
  }

  async submitOrder(order: AlpacaOrderRequest): Promise<any> {
    return this.request('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(order)
    })
  }
}
