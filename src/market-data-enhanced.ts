/**
 * Enhanced Market Data Service
 * Primary source: Polygon.io
 * Fallback: Alpha Vantage, then synthetic
 */

import { type Candle } from './models/prediction'
import { PolygonAPI } from './services/PolygonAPI'

export class EnhancedMarketDataService {
  private polygonApi: PolygonAPI | null = null
  private alphaVantageKey: string | null = null
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  private CACHE_TTL = 60000 // 1 minute cache

  constructor(polygonKey?: string, alphaVantageKey?: string) {
    // Polygon.io is PRIMARY
    if (polygonKey) {
      this.polygonApi = new PolygonAPI(polygonKey)
      console.log('✅ Polygon.io initialized as PRIMARY data source')
    }
    
    // Alpha Vantage as fallback
    if (alphaVantageKey) {
      this.alphaVantageKey = alphaVantageKey
      console.log('📊 Alpha Vantage available as fallback')
    }
    
    if (!polygonKey && !alphaVantageKey) {
      console.warn('⚠️ No API keys provided, will use synthetic data only')
    }
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

  // Fetch current SPY quote - PRIMARY: Polygon.io
  async getCurrentSPYQuote(): Promise<{ 
    price: number; 
    change: number; 
    changePercent: number; 
    volume: number;
    source: string;
  }> {
    const cacheKey = 'spy_quote'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    // Try Polygon.io FIRST (PRIMARY)
    if (this.polygonApi) {
      try {
        console.log('🎯 Fetching from Polygon.io (PRIMARY)...')
        const snapshot = await this.polygonApi.getMarketSnapshot('SPY')
        
        const result = {
          price: snapshot.price,
          change: snapshot.dayChange,
          changePercent: snapshot.dayChangePercent,
          volume: snapshot.dayVolume,
          source: 'Polygon.io (PRIMARY)'
        }
        
        this.setCache(cacheKey, result)
        return result
      } catch (error) {
        console.error('❌ Polygon.io error:', error)
      }
    }

    // Fallback to Alpha Vantage
    if (this.alphaVantageKey) {
      try {
        console.log('📈 Falling back to Alpha Vantage...')
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${this.alphaVantageKey}`
        const response = await fetch(url)
        const data = await response.json()
        
        if (data['Global Quote']) {
          const quote = data['Global Quote']
          const result = {
            price: parseFloat(quote['05. price']),
            change: parseFloat(quote['09. change']),
            changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
            volume: parseInt(quote['06. volume']),
            source: 'Alpha Vantage (Fallback)'
          }
          
          this.setCache(cacheKey, result)
          return result
        }
      } catch (error) {
        console.error('❌ Alpha Vantage error:', error)
      }
    }

    // Final fallback: Synthetic data
    console.warn('⚠️ Using synthetic data (all APIs failed)')
    const syntheticResult = {
      price: 420 + (Math.random() - 0.5) * 10,
      change: (Math.random() - 0.5) * 5,
      changePercent: (Math.random() - 0.5) * 2,
      volume: 80000000 + Math.random() * 20000000,
      source: 'Synthetic (Fallback)'
    }
    
    this.setCache(cacheKey, syntheticResult)
    return syntheticResult
  }

  // Fetch historical data - PRIMARY: Polygon.io
  async getHistoricalData(
    interval: '1min' | '5min' | '15min' | '30min' | '60min' | 'daily' = '5min',
    outputSize: 'compact' | 'full' = 'compact'
  ): Promise<Candle[]> {
    const cacheKey = `historical_${interval}_${outputSize}`
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    // Try Polygon.io FIRST (PRIMARY)
    if (this.polygonApi) {
      try {
        console.log(`🎯 Fetching ${interval} data from Polygon.io...`)
        
        // Map interval to Polygon parameters
        const intervalMap = {
          '1min': { multiplier: 1, timespan: 'minute' as const },
          '5min': { multiplier: 5, timespan: 'minute' as const },
          '15min': { multiplier: 15, timespan: 'minute' as const },
          '30min': { multiplier: 30, timespan: 'minute' as const },
          '60min': { multiplier: 1, timespan: 'hour' as const },
          'daily': { multiplier: 1, timespan: 'day' as const }
        }
        
        const params = intervalMap[interval]
        const limit = outputSize === 'full' ? 500 : 100
        
        const aggregates = await this.polygonApi.getAggregates(
          'SPY',
          params.multiplier,
          params.timespan,
          '',
          '',
          limit
        )
        
        if (aggregates.results && aggregates.results.length > 0) {
          const candles: Candle[] = aggregates.results.map(bar => ({
            timestamp: new Date(bar.t),
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v
          }))
          
          this.setCache(cacheKey, candles)
          return candles
        }
      } catch (error) {
        console.error('❌ Polygon.io historical data error:', error)
      }
    }

    // Fallback to synthetic data
    console.warn('⚠️ Generating synthetic historical data')
    return this.generateSyntheticCandles(interval, outputSize === 'full' ? 500 : 100)
  }

  // Fetch RSI - PRIMARY: Polygon.io
  async getRSI(period: number = 14): Promise<number> {
    const cacheKey = `rsi_${period}`
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    // Try Polygon.io FIRST
    if (this.polygonApi) {
      try {
        console.log('🎯 Fetching RSI from Polygon.io...')
        const rsiData = await this.polygonApi.getRSI('SPY', period, 'close', 'hour', 1)
        const rsiValue = rsiData.value
        
        this.setCache(cacheKey, rsiValue)
        return rsiValue
      } catch (error) {
        console.error('❌ Polygon.io RSI error:', error)
      }
    }

    // Synthetic RSI
    const syntheticRSI = 50 + (Math.random() - 0.5) * 30
    this.setCache(cacheKey, syntheticRSI)
    return syntheticRSI
  }

  // Fetch MACD - PRIMARY: Polygon.io
  async getMACD(): Promise<{ macd: number; signal: number; histogram: number }> {
    const cacheKey = 'macd'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    // Try Polygon.io FIRST
    if (this.polygonApi) {
      try {
        console.log('🎯 Fetching MACD from Polygon.io...')
        const macdData = await this.polygonApi.getMACD('SPY', 'hour', 1)
        
        this.setCache(cacheKey, macdData)
        return macdData
      } catch (error) {
        console.error('❌ Polygon.io MACD error:', error)
      }
    }

    // Synthetic MACD
    const syntheticMACD = {
      macd: (Math.random() - 0.5) * 2,
      signal: (Math.random() - 0.5) * 1.5,
      histogram: (Math.random() - 0.5) * 0.5
    }
    
    this.setCache(cacheKey, syntheticMACD)
    return syntheticMACD
  }

  // Get VIX - PRIMARY: Polygon.io (using VIXY as proxy)
  async getVIX(): Promise<number> {
    const cacheKey = 'vix'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    // Try Polygon.io
    if (this.polygonApi) {
      try {
        console.log('🎯 Fetching VIX proxy from Polygon.io...')
        const vix = await this.polygonApi.getVIX()
        
        this.setCache(cacheKey, vix)
        return vix
      } catch (error) {
        console.error('❌ Polygon.io VIX error:', error)
      }
    }

    // Synthetic VIX
    const syntheticVIX = 15 + Math.random() * 10
    this.setCache(cacheKey, syntheticVIX)
    return syntheticVIX
  }

  // Generate synthetic candles when APIs fail
  private generateSyntheticCandles(interval: string, count: number): Candle[] {
    const candles: Candle[] = []
    const now = new Date()
    
    const intervalMinutes = {
      '1min': 1,
      '5min': 5,
      '15min': 15,
      '30min': 30,
      '60min': 60,
      'daily': 1440
    }[interval] || 5

    let basePrice = 420
    
    for (let i = 0; i < count; i++) {
      const timestamp = new Date(now.getTime() - (i * intervalMinutes * 60000))
      const volatility = 0.002
      const trend = (Math.random() - 0.48) * volatility
      
      const open = basePrice
      const close = open * (1 + trend + (Math.random() - 0.5) * volatility)
      const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5)
      const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5)
      const volume = 1000000 + Math.random() * 500000
      
      candles.unshift({
        timestamp,
        open,
        high,
        low,
        close,
        volume
      })
      
      basePrice = close
    }
    
    return candles
  }

  // Get comprehensive market status
  async getMarketStatus(): Promise<{
    spy: any
    vix: number
    rsi: number
    macd: any
    dataSource: string
  }> {
    const [spy, vix, rsi, macd] = await Promise.all([
      this.getCurrentSPYQuote(),
      this.getVIX(),
      this.getRSI(),
      this.getMACD()
    ])
    
    return {
      spy,
      vix,
      rsi,
      macd,
      dataSource: spy.source
    }
  }
}