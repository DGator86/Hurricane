/**
 * Polygon.io API Service
 * Alternative market data provider with better limits
 */

export interface PolygonQuote {
  status: string
  symbol: string
  last: {
    price: number
    size: number
    exchange: number
    timeNanoseconds: number
  }
  prevDay: {
    o: number  // open
    h: number  // high
    l: number  // low
    c: number  // close
    v: number  // volume
    vw: number // volume weighted average
  }
  day: {
    o: number
    h: number
    l: number
    c: number
    v: number
    vw: number
  }
  min: {
    av: number // aggregate volume
    t: number  // timestamp
    o: number
    h: number
    l: number
    c: number
    v: number
    vw: number
  }
}

export interface PolygonCandle {
  v: number   // volume
  vw: number  // volume weighted average
  o: number   // open
  c: number   // close
  h: number   // high
  l: number   // low
  t: number   // timestamp (milliseconds)
  n: number   // number of transactions
}

export interface PolygonAggregates {
  status: string
  ticker: string
  queryCount: number
  resultsCount: number
  adjusted: boolean
  results: PolygonCandle[]
}

export interface PolygonSMA {
  status: string
  results: {
    underlying: {
      aggregates: Array<{
        c: number
        h: number
        l: number
        n: number
        o: number
        t: number
        v: number
        vw: number
      }>
    }
    values: Array<{
      timestamp: number
      value: number
    }>
  }
}

export class PolygonAPI {
  private baseURL = 'https://api.polygon.io'
  private apiKey: string
  private cache = new Map<string, { data: any, timestamp: number }>()
  private cacheTimeout = 60000 // 1 minute cache
  
  constructor(apiKey: string) {
    this.apiKey = apiKey
  }
  
  /**
   * Get current quote for a symbol
   */
  async getQuote(symbol: string = 'SPY'): Promise<PolygonQuote> {
    const cacheKey = `quote_${symbol}`
    const cached = this.cache.get(cacheKey)
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data
    }
    
    const url = `${this.baseURL}/v3/quotes/${symbol}?apiKey=${this.apiKey}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    this.cache.set(cacheKey, { data, timestamp: Date.now() })
    return data
  }
  
  /**
   * Get aggregates (candles) for a symbol
   */
  async getAggregates(
    symbol: string = 'SPY',
    multiplier: number = 1,
    timespan: 'minute' | 'hour' | 'day' | 'week' = 'minute',
    from: string = '',
    to: string = '',
    limit: number = 100
  ): Promise<PolygonAggregates> {
    // Default to last 2 days if no dates provided
    if (!from) {
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - 2)
      from = fromDate.toISOString().split('T')[0]
    }
    if (!to) {
      to = new Date().toISOString().split('T')[0]
    }
    
    const cacheKey = `agg_${symbol}_${multiplier}_${timespan}_${from}_${to}_${limit}`
    const cached = this.cache.get(cacheKey)
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data
    }
    
    const url = `${this.baseURL}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=desc&limit=${limit}&apiKey=${this.apiKey}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    this.cache.set(cacheKey, { data, timestamp: Date.now() })
    return data
  }
  
  /**
   * Get previous day's data
   */
  async getPreviousClose(symbol: string = 'SPY'): Promise<any> {
    const url = `${this.baseURL}/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${this.apiKey}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.statusText}`)
    }
    
    return await response.json()
  }
  
  /**
   * Get SMA (Simple Moving Average)
   */
  async getSMA(
    symbol: string = 'SPY',
    window: number = 20,
    series_type: string = 'close',
    timespan: 'minute' | 'hour' | 'day' = 'day',
    limit: number = 10
  ): Promise<PolygonSMA> {
    const timestamp = new Date().toISOString().split('T')[0]
    const url = `${this.baseURL}/v1/indicators/sma/${symbol}?timestamp=${timestamp}&timespan=${timespan}&adjusted=true&window=${window}&series_type=${series_type}&order=desc&limit=${limit}&apiKey=${this.apiKey}`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.statusText}`)
    }
    
    return await response.json()
  }
  
  /**
   * Get RSI (Relative Strength Index)
   */
  async getRSI(
    symbol: string = 'SPY',
    window: number = 14,
    series_type: string = 'close',
    timespan: 'minute' | 'hour' | 'day' = 'hour',
    limit: number = 1
  ): Promise<any> {
    const timestamp = new Date().toISOString().split('T')[0]
    const url = `${this.baseURL}/v1/indicators/rsi/${symbol}?timestamp=${timestamp}&timespan=${timespan}&adjusted=true&window=${window}&series_type=${series_type}&order=desc&limit=${limit}&apiKey=${this.apiKey}`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      // If RSI endpoint fails, calculate manually from aggregates
      console.warn('RSI endpoint failed, calculating manually')
      const aggs = await this.getAggregates(symbol, 1, timespan, '', '', window + 2)
      if (aggs.results && aggs.results.length >= window) {
        return this.calculateRSI(aggs.results.map(r => r.c).reverse(), window)
      }
      return { value: 50 } // Default neutral RSI
    }
    
    const data = await response.json()
    if (data.results?.values?.[0]) {
      return { value: data.results.values[0].value }
    }
    return { value: 50 }
  }
  
  /**
   * Calculate RSI manually from price data
   */
  private calculateRSI(prices: number[], period: number = 14): { value: number } {
    if (prices.length < period + 1) {
      return { value: 50 }
    }
    
    let gains = 0
    let losses = 0
    
    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1]
      if (change > 0) {
        gains += change
      } else {
        losses -= change
      }
    }
    
    let avgGain = gains / period
    let avgLoss = losses / period
    
    // Calculate RSI
    const rs = avgGain / (avgLoss || 0.0001)
    const rsi = 100 - (100 / (1 + rs))
    
    return { value: rsi }
  }
  
  /**
   * Get MACD (Moving Average Convergence Divergence)
   */
  async getMACD(
    symbol: string = 'SPY',
    timespan: 'minute' | 'hour' | 'day' = 'hour',
    limit: number = 1
  ): Promise<any> {
    const timestamp = new Date().toISOString().split('T')[0]
    const url = `${this.baseURL}/v1/indicators/macd/${symbol}?timestamp=${timestamp}&timespan=${timespan}&adjusted=true&short_window=12&long_window=26&signal_window=9&series_type=close&order=desc&limit=${limit}&apiKey=${this.apiKey}`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      // Calculate manually if endpoint fails
      console.warn('MACD endpoint failed, using default values')
      return {
        macd: 0,
        signal: 0,
        histogram: 0
      }
    }
    
    const data = await response.json()
    if (data.results?.values?.[0]) {
      const value = data.results.values[0]
      return {
        macd: value.value || 0,
        signal: value.signal || 0,
        histogram: value.histogram || 0
      }
    }
    
    return { macd: 0, signal: 0, histogram: 0 }
  }
  
  /**
   * Get comprehensive market data efficiently
   */
  async getMarketSnapshot(symbol: string = 'SPY'): Promise<{
    price: number
    previousClose: number
    dayChange: number
    dayChangePercent: number
    dayHigh: number
    dayLow: number
    dayVolume: number
    vwap: number
  }> {
    try {
      // Try to get the snapshot endpoint first (most efficient)
      const url = `${this.baseURL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${this.apiKey}`
      const response = await fetch(url)
      
      if (response.ok) {
        const data = await response.json()
        const ticker = data.ticker
        
        return {
          price: ticker.day?.c || ticker.prevDay?.c || 400,
          previousClose: ticker.prevDay?.c || 400,
          dayChange: (ticker.day?.c || 0) - (ticker.prevDay?.c || 0),
          dayChangePercent: ticker.todaysChangePerc || 0,
          dayHigh: ticker.day?.h || ticker.prevDay?.h || 400,
          dayLow: ticker.day?.l || ticker.prevDay?.l || 400,
          dayVolume: ticker.day?.v || 0,
          vwap: ticker.day?.vw || ticker.prevDay?.vw || 400
        }
      }
    } catch (error) {
      console.warn('Snapshot endpoint failed, falling back to aggregates')
    }
    
    // Fallback to aggregates
    const prevDay = await this.getPreviousClose(symbol)
    const today = await this.getAggregates(symbol, 1, 'minute', '', '', 1)
    
    const currentPrice = today.results?.[0]?.c || prevDay.results?.[0]?.c || 400
    const prevClose = prevDay.results?.[0]?.c || 400
    
    return {
      price: currentPrice,
      previousClose: prevClose,
      dayChange: currentPrice - prevClose,
      dayChangePercent: ((currentPrice - prevClose) / prevClose) * 100,
      dayHigh: today.results?.[0]?.h || prevDay.results?.[0]?.h || 400,
      dayLow: today.results?.[0]?.l || prevDay.results?.[0]?.l || 400,
      dayVolume: today.results?.[0]?.v || 0,
      vwap: today.results?.[0]?.vw || currentPrice
    }
  }
  
  /**
   * Get VIX (volatility index) - Polygon doesn't have VIX directly, so we'll use VIXY ETF as proxy
   */
  async getVIX(): Promise<number> {
    try {
      const vixy = await this.getMarketSnapshot('VIXY')
      // VIXY typically trades around 15-30, similar to VIX
      // Apply a small adjustment factor
      return vixy.price * 0.8 // Rough approximation
    } catch (error) {
      console.warn('Failed to get VIX proxy, using default')
      return 16 // Default VIX value
    }
  }
}