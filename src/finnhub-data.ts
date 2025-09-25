// Finnhub Real-Time Market Data Service
import { type Candle } from './models/prediction'

export interface FinnhubQuote {
  c: number  // Current price
  d: number  // Change
  dp: number // Percent change
  h: number  // High price of the day
  l: number  // Low price of the day
  o: number  // Open price of the day
  pc: number // Previous close price
  t: number  // Timestamp
}

export interface FinnhubCandle {
  c: number[] // Close prices
  h: number[] // High prices
  l: number[] // Low prices
  o: number[] // Open prices
  s: string   // Status
  t: number[] // Timestamps
  v: number[] // Volumes
}

export class FinnhubDataService {
  private apiKey: string
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  private CACHE_TTL = 30000 // 30 seconds cache for real-time data

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  // Get cached data or null
  private getCached(key: string): any | null {
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data
    }
    return null
  }

  // Set cache
  private setCache(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  // Fetch current SPY quote from Finnhub
  async getCurrentSPYQuote(): Promise<{ price: number; change: number; changePercent: number; volume: number; high: number; low: number }> {
    const cacheKey = 'finnhub_spy_quote'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=SPY&token=${this.apiKey}`
      )
      const data: FinnhubQuote = await response.json()

      if (data.c) {
        const result = {
          price: data.c,
          change: data.d,
          changePercent: data.dp,
          volume: 0, // Finnhub doesn't provide volume in quote endpoint
          high: data.h,
          low: data.l,
          open: data.o,
          previousClose: data.pc,
          timestamp: data.t
        }
        this.setCache(cacheKey, result)
        return result
      }

      throw new Error('Invalid quote data from Finnhub')
    } catch (error) {
      console.error('Error fetching SPY quote from Finnhub:', error)
      throw error
    }
  }

  // Fetch VIX quote (CBOE Volatility Index)
  async getCurrentVIXLevel(): Promise<number> {
    const cacheKey = 'finnhub_vix_quote'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    try {
      // Finnhub uses ^VIX for the VIX index
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=^VIX&token=${this.apiKey}`
      )
      const data: FinnhubQuote = await response.json()

      if (data.c) {
        const vixLevel = data.c
        this.setCache(cacheKey, vixLevel)
        return vixLevel
      }

      // If VIX not available, try to estimate from SPY volatility
      return await this.estimateVIXFromSPY()
    } catch (error) {
      console.error('Error fetching VIX from Finnhub:', error)
      return 16.5 // Default VIX level
    }
  }

  // Estimate VIX from SPY price movements
  private async estimateVIXFromSPY(): Promise<number> {
    try {
      const candles = await this.getCandles('SPY', 'D', 30)
      if (candles.length < 2) return 16.5

      // Calculate historical volatility
      const returns = []
      for (let i = 1; i < candles.length; i++) {
        const dayReturn = (candles[i].close - candles[i-1].close) / candles[i-1].close
        returns.push(dayReturn)
      }

      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
      const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length
      const dailyVol = Math.sqrt(variance)
      const annualizedVol = dailyVol * Math.sqrt(252) * 100 // Annualized volatility percentage

      return Math.max(10, Math.min(50, annualizedVol)) // Cap between 10 and 50
    } catch (error) {
      return 16.5
    }
  }

  // Fetch stock candles from Finnhub
  async getCandles(symbol: string, resolution: string, count: number): Promise<Candle[]> {
    const cacheKey = `finnhub_candles_${symbol}_${resolution}_${count}`
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    try {
      const now = Math.floor(Date.now() / 1000)
      const from = now - (count * this.getSecondsForResolution(resolution))
      
      const response = await fetch(
        `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${this.apiKey}`
      )
      const data: FinnhubCandle = await response.json()

      if (data.s === 'ok' && data.c && data.c.length > 0) {
        const candles = this.convertFinnhubCandles(data)
        this.setCache(cacheKey, candles)
        return candles
      }

      throw new Error('No candle data available from Finnhub')
    } catch (error) {
      console.error('Error fetching candles from Finnhub:', error)
      throw error
    }
  }

  // Get seconds for resolution
  private getSecondsForResolution(resolution: string): number {
    const resolutionMap: { [key: string]: number } = {
      '1': 60,        // 1 minute
      '5': 300,       // 5 minutes
      '15': 900,      // 15 minutes
      '30': 1800,     // 30 minutes
      '60': 3600,     // 60 minutes
      'D': 86400,     // 1 day
      'W': 604800,    // 1 week
      'M': 2592000    // 1 month (30 days)
    }
    return resolutionMap[resolution] || 3600
  }

  // Convert Finnhub candles to our Candle format
  private convertFinnhubCandles(data: FinnhubCandle): Candle[] {
    const candles: Candle[] = []
    
    for (let i = 0; i < data.c.length; i++) {
      candles.push({
        timestamp: new Date(data.t[i] * 1000), // Convert Unix timestamp to Date
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i]
      })
    }
    
    return candles
  }

  // Get intraday data (5-minute candles)
  async getIntradayData(): Promise<Candle[]> {
    try {
      return await this.getCandles('SPY', '5', 78) // 78 * 5min = 6.5 hours of trading
    } catch (error) {
      // If candle data not available, generate from quote
      const quote = await this.getCurrentSPYQuote()
      return this.generateCandlesFromQuote(quote, 78)
    }
  }
  
  // Generate candles from quote data
  private generateCandlesFromQuote(quote: any, count: number): Candle[] {
    const candles: Candle[] = []
    const now = Date.now()
    
    // Use quote data to create realistic candles
    const currentPrice = quote.price
    const dayHigh = quote.high
    const dayLow = quote.low
    const dayOpen = quote.open || currentPrice
    const changePercent = quote.changePercent / 100
    
    // Generate candles with realistic movement based on today's range
    const range = dayHigh - dayLow
    let price = dayOpen
    
    for (let i = 0; i < count; i++) {
      const progress = i / count
      // Simulate intraday price movement
      const targetPrice = dayOpen + (currentPrice - dayOpen) * progress
      const noise = (Math.random() - 0.5) * range * 0.1
      price = targetPrice + noise
      
      const high = Math.min(dayHigh, price + Math.random() * range * 0.02)
      const low = Math.max(dayLow, price - Math.random() * range * 0.02)
      const close = low + Math.random() * (high - low)
      
      candles.push({
        timestamp: new Date(now - (count - i) * 5 * 60000),
        open: price,
        high: high,
        low: low,
        close: close,
        volume: 1000000 + Math.random() * 500000
      })
      
      price = close
    }
    
    // Ensure last candle matches current quote
    if (candles.length > 0) {
      candles[candles.length - 1].close = currentPrice
    }
    
    return candles
  }

  // Get daily data
  async getDailyData(days: number = 100): Promise<Candle[]> {
    return await this.getCandles('SPY', 'D', days)
  }

  // Get technical indicators (calculate from candles)
  async getTechnicalIndicators(): Promise<any> {
    try {
      const dailyCandles = await this.getDailyData(200)
      const prices = dailyCandles.map(c => c.close)
      
      // Calculate SMA
      const sma20 = this.calculateSMA(prices, 20)
      const sma50 = this.calculateSMA(prices, 50)
      const sma200 = this.calculateSMA(prices, 200)
      
      // Calculate EMA
      const ema12 = this.calculateEMA(prices, 12)
      const ema26 = this.calculateEMA(prices, 26)
      
      return {
        sma20: sma20[sma20.length - 1],
        sma50: sma50[sma50.length - 1],
        sma200: sma200[sma200.length - 1],
        ema12: ema12[ema12.length - 1],
        ema26: ema26[ema26.length - 1]
      }
    } catch (error) {
      console.error('Error calculating technical indicators:', error)
      return null
    }
  }

  // Calculate Simple Moving Average
  private calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = []
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      sma.push(sum / period)
    }
    return sma
  }

  // Calculate Exponential Moving Average
  private calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1)
    const ema: number[] = [prices[0]]
    
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k))
    }
    
    return ema
  }

  // Get market data for prediction
  async getMarketDataForPrediction(timeframe: string): Promise<{
    candles: Candle[]
    vix: number
    currentPrice: number
  }> {
    try {
      // First get the current quote and VIX
      const [quote, vix] = await Promise.all([
        this.getCurrentSPYQuote(),
        this.getCurrentVIXLevel()
      ])
      
      // Try to get candles, but use quote-generated candles as fallback
      let candles: Candle[]
      try {
        // Determine resolution based on timeframe
        let resolution: string
        let count: number
        
        switch (timeframe) {
          case '15m':
            resolution = '5'  // 5-minute candles
            count = 60       // 5 hours of data
            break
          case '1h':
            resolution = '15' // 15-minute candles
            count = 96       // 24 hours of data
            break
          case '4h':
            resolution = '60' // 1-hour candles
            count = 120      // 5 days of data
            break
          case '1d':
            resolution = 'D'  // Daily candles
            count = 100      // 100 days
            break
          case '1w':
            resolution = 'D'  // Daily candles
            count = 200      // 200 days for weekly analysis
            break
          default:
            resolution = '15'
            count = 96
        }
        
        candles = await this.getCandles('SPY', resolution, count)
      } catch (candleError) {
        // If candles fail, generate from quote
        console.log('Using quote-based candles for', timeframe)
        candles = this.generateCandlesFromQuote(quote, 100)
      }

      return {
        candles,
        vix,
        currentPrice: quote.price
      }
    } catch (error) {
      console.error('Error getting market data for prediction:', error)
      // Return fallback data with real price if available
      try {
        const quote = await this.getCurrentSPYQuote()
        return {
          candles: this.generateCandlesFromQuote(quote, 100),
          vix: 16.5,
          currentPrice: quote.price
        }
      } catch {
        return {
          candles: this.generateFallbackCandles(658, 100),
          vix: 16.5,
          currentPrice: 658
        }
      }
    }
  }

  // Generate fallback candles
  private generateFallbackCandles(basePrice: number, count: number): Candle[] {
    const candles: Candle[] = []
    let price = basePrice
    const now = Date.now()

    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.48) * 0.01
      price *= (1 + change)
      
      const high = price * (1 + Math.random() * 0.003)
      const low = price * (1 - Math.random() * 0.003)
      const close = low + Math.random() * (high - low)

      candles.push({
        timestamp: new Date(now - (count - i) * 5 * 60000),
        open: price,
        high: high,
        low: low,
        close: close,
        volume: 1000000 + Math.random() * 500000
      })

      price = close
    }

    return candles
  }

  // Get market status
  async getMarketStatus(): Promise<{ isOpen: boolean; session: string }> {
    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/stock/market-status?exchange=US&token=${this.apiKey}`
      )
      const data = await response.json()
      
      return {
        isOpen: data.isOpen,
        session: data.session || 'closed'
      }
    } catch (error) {
      console.error('Error fetching market status:', error)
      // Default to market hours check
      const now = new Date()
      const hour = now.getUTCHours()
      const day = now.getUTCDay()
      
      // Market hours: 9:30 AM - 4:00 PM ET (14:30 - 21:00 UTC)
      const isOpen = day > 0 && day < 6 && hour >= 14 && hour < 21
      
      return {
        isOpen,
        session: isOpen ? 'market' : 'closed'
      }
    }
  }
}