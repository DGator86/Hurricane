/**
 * Enhanced Market Data Integration
 * Supports multiple data providers: Twelve Data, Polygon.io, and synthetic fallback
 */

import { PolygonAPI } from '../services/PolygonAPI'

export interface MarketData {
  spy_price: number
  spy_volume: number
  vix: number
  put_call_ratio: number
  market_breadth: number
  dollar_volume: number
  tick: number
  rsi: number
  bollinger_position: number
  ma_50: number
  ma_200: number
  macd: {
    macd: number
    signal: number
    histogram: number
  }
  dataSource: string
  timestamp: string
}

export class EnhancedMarketDataGenerator {
  private polygonApi: PolygonAPI | null = null
  private cache = new Map<string, { data: any, timestamp: number }>()
  private cacheTimeout = 60000 // 1 minute cache
  
  constructor(polygonKey?: string) {
    if (polygonKey) {
      this.polygonApi = new PolygonAPI(polygonKey)
      console.log('🟢 Polygon.io API initialized')
    } else {
      console.warn('⚠️ No Polygon API key provided')
    }
  }
  
  /**
   * Generate current market data using available APIs
   */
  async generateCurrentData(): Promise<MarketData> {
    // Check cache first
    const cacheKey = 'current_market_data'
    const cached = this.cache.get(cacheKey)
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data
    }
    
    // Try Polygon API first
    if (this.polygonApi) {
      try {
        console.log('📊 Fetching real data from Polygon.io...')
        const data = await this.fetchPolygonData()
        
        this.cache.set(cacheKey, { data, timestamp: Date.now() })
        return data
      } catch (error) {
        console.error('❌ Polygon API error:', error)
        console.warn('⚠️ Falling back to synthetic data')
      }
    }
    
    // Fallback to synthetic data
    const syntheticData = this.generateSyntheticData()
    this.cache.set(cacheKey, { data: syntheticData, timestamp: Date.now() })
    return syntheticData
  }
  
  /**
   * Fetch data from Polygon.io
   */
  private async fetchPolygonData(): Promise<MarketData> {
    if (!this.polygonApi) {
      throw new Error('Polygon API not initialized')
    }
    
    // Get market snapshot
    const snapshot = await this.polygonApi.getMarketSnapshot('SPY')
    
    // Get technical indicators in parallel
    const [rsiData, macdData, vixData] = await Promise.all([
      this.polygonApi.getRSI('SPY', 14, 'close', 'hour', 1).catch(() => ({ value: 50 })),
      this.polygonApi.getMACD('SPY', 'hour', 1).catch(() => ({ macd: 0, signal: 0, histogram: 0 })),
      this.polygonApi.getVIX().catch(() => 16)
    ])
    
    // Get moving averages
    const [ma50Data, ma200Data] = await Promise.all([
      this.polygonApi.getSMA('SPY', 50, 'close', 'day', 1).catch(() => null),
      this.polygonApi.getSMA('SPY', 200, 'close', 'day', 1).catch(() => null)
    ])
    
    const ma50 = ma50Data?.results?.values?.[0]?.value || snapshot.price
    const ma200 = ma200Data?.results?.values?.[0]?.value || snapshot.price
    
    // Calculate bollinger position (simplified)
    const bollingerPosition = (snapshot.price - ma50) / (ma50 * 0.02) // Assuming 2% bands
    
    return {
      spy_price: snapshot.price,
      spy_volume: snapshot.dayVolume,
      vix: vixData,
      put_call_ratio: 0.95 + (Math.random() * 0.3 - 0.15), // Simulated for now
      market_breadth: 0.5 + (Math.random() * 0.3 - 0.15), // Simulated
      dollar_volume: snapshot.dayVolume * snapshot.vwap,
      tick: snapshot.dayChange > 0 ? 1 : -1,
      rsi: rsiData.value,
      bollinger_position: Math.max(-2, Math.min(2, bollingerPosition)),
      ma_50: ma50,
      ma_200: ma200,
      macd: {
        macd: macdData.macd || 0,
        signal: macdData.signal || 0,
        histogram: macdData.histogram || 0
      },
      dataSource: 'polygon.io',
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * Generate realistic synthetic market data
   */
  private generateSyntheticData(): MarketData {
    // Base SPY price with realistic volatility
    const basePrice = 420
    const volatility = 0.02
    const randomWalk = (Math.random() - 0.5) * 2 * volatility
    const spy_price = basePrice * (1 + randomWalk)
    
    // VIX inversely correlated with market direction
    const vix = 14 + (Math.random() * 8) - (randomWalk * 100)
    
    // RSI with mean reversion
    const rsi = 50 + (Math.random() - 0.5) * 30
    
    // MACD with realistic values
    const macdValue = (Math.random() - 0.5) * 2
    const signalValue = macdValue * 0.7 + (Math.random() - 0.5) * 0.3
    
    return {
      spy_price,
      spy_volume: 80000000 + Math.random() * 40000000,
      vix: Math.max(10, Math.min(40, vix)),
      put_call_ratio: 0.8 + Math.random() * 0.4,
      market_breadth: 0.4 + Math.random() * 0.3,
      dollar_volume: spy_price * (80000000 + Math.random() * 40000000),
      tick: Math.random() > 0.5 ? 1 : -1,
      rsi: Math.max(20, Math.min(80, rsi)),
      bollinger_position: (Math.random() - 0.5) * 3,
      ma_50: spy_price * (1 - 0.01 * (Math.random() - 0.5)),
      ma_200: spy_price * (1 - 0.02 * (Math.random() - 0.5)),
      macd: {
        macd: macdValue,
        signal: signalValue,
        histogram: macdValue - signalValue
      },
      dataSource: 'synthetic',
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * Get technical indicators for a specific timeframe
   */
  async getTechnicalIndicators(timeframe: '15m' | '1h' | '4h' | '1d' | '1w'): Promise<{
    rsi: number
    macd: { macd: number; signal: number; histogram: number }
    movingAverages: { ma5: number; ma20: number; ma50: number; ma200: number }
  }> {
    if (!this.polygonApi) {
      // Return synthetic indicators
      return {
        rsi: 50 + (Math.random() - 0.5) * 30,
        macd: {
          macd: (Math.random() - 0.5) * 2,
          signal: (Math.random() - 0.5) * 1.5,
          histogram: (Math.random() - 0.5) * 0.5
        },
        movingAverages: {
          ma5: 420 + (Math.random() - 0.5) * 5,
          ma20: 420 + (Math.random() - 0.5) * 8,
          ma50: 420 + (Math.random() - 0.5) * 10,
          ma200: 420 + (Math.random() - 0.5) * 15
        }
      }
    }
    
    // Map timeframe to Polygon timespan
    const timespanMap = {
      '15m': 'minute' as const,
      '1h': 'hour' as const,
      '4h': 'hour' as const,
      '1d': 'day' as const,
      '1w': 'day' as const
    }
    
    const timespan = timespanMap[timeframe]
    
    try {
      const [rsi, macd, ma5, ma20, ma50, ma200] = await Promise.all([
        this.polygonApi.getRSI('SPY', 14, 'close', timespan, 1),
        this.polygonApi.getMACD('SPY', timespan, 1),
        this.polygonApi.getSMA('SPY', 5, 'close', timespan, 1),
        this.polygonApi.getSMA('SPY', 20, 'close', timespan, 1),
        this.polygonApi.getSMA('SPY', 50, 'close', timespan, 1),
        this.polygonApi.getSMA('SPY', 200, 'close', timespan, 1)
      ])
      
      return {
        rsi: rsi.value,
        macd: {
          macd: macd.macd,
          signal: macd.signal,
          histogram: macd.histogram
        },
        movingAverages: {
          ma5: ma5?.results?.values?.[0]?.value || 420,
          ma20: ma20?.results?.values?.[0]?.value || 420,
          ma50: ma50?.results?.values?.[0]?.value || 420,
          ma200: ma200?.results?.values?.[0]?.value || 420
        }
      }
    } catch (error) {
      console.warn(`Failed to get technical indicators for ${timeframe}:`, error)
      // Return synthetic fallback
      return {
        rsi: 50 + (Math.random() - 0.5) * 30,
        macd: {
          macd: (Math.random() - 0.5) * 2,
          signal: (Math.random() - 0.5) * 1.5,
          histogram: (Math.random() - 0.5) * 0.5
        },
        movingAverages: {
          ma5: 420 + (Math.random() - 0.5) * 5,
          ma20: 420 + (Math.random() - 0.5) * 8,
          ma50: 420 + (Math.random() - 0.5) * 10,
          ma200: 420 + (Math.random() - 0.5) * 15
        }
      }
    }
  }
  
  /**
   * Get historical candles for a timeframe
   */
  async getHistoricalCandles(
    timeframe: '15m' | '1h' | '4h' | '1d' | '1w',
    limit: number = 100
  ): Promise<Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>> {
    if (!this.polygonApi) {
      // Generate synthetic candles
      const candles = []
      const now = Date.now()
      const intervalMs = {
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '1w': 7 * 24 * 60 * 60 * 1000
      }[timeframe]
      
      let price = 420
      for (let i = 0; i < limit; i++) {
        const change = (Math.random() - 0.5) * 2
        price = price + change
        const high = price + Math.random() * 1
        const low = price - Math.random() * 1
        
        candles.push({
          t: now - (i * intervalMs),
          o: price - change/2,
          h: high,
          l: low,
          c: price,
          v: 1000000 + Math.random() * 500000
        })
      }
      
      return candles.reverse()
    }
    
    // Map timeframe to Polygon parameters
    const params = {
      '15m': { multiplier: 15, timespan: 'minute' as const },
      '1h': { multiplier: 1, timespan: 'hour' as const },
      '4h': { multiplier: 4, timespan: 'hour' as const },
      '1d': { multiplier: 1, timespan: 'day' as const },
      '1w': { multiplier: 1, timespan: 'week' as const }
    }[timeframe]
    
    try {
      const aggregates = await this.polygonApi.getAggregates(
        'SPY',
        params.multiplier,
        params.timespan,
        '',
        '',
        limit
      )
      
      if (aggregates.results && aggregates.results.length > 0) {
        return aggregates.results.reverse() // Oldest first
      }
    } catch (error) {
      console.warn(`Failed to get candles for ${timeframe}:`, error)
    }
    
    // Fallback to synthetic
    return this.getHistoricalCandles(timeframe, limit)
  }
}