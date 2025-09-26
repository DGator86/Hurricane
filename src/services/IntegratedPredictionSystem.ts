/**
 * Integrated Hurricane SPY Prediction System
 * Combines all components for 75%+ accuracy target
 */

import { HurricaneFeatureExtractor, HurricaneFeatures } from './HurricaneFeatureExtractor'
import { EnhancedPredictionModel, PredictionSignal } from './EnhancedPredictionModel'
import { TechnicalIndicators, OHLCV } from './TechnicalIndicators'
import { PolygonAPI } from './PolygonAPI'
import { EnhancedMarketDataService } from '../market-data-enhanced'
import { YahooFinanceAPI } from './YahooFinanceAPI'

export interface TimeframePrediction extends PredictionSignal {
  features: Partial<HurricaneFeatures>
  timestamp: number
}

export interface ComprehensivePrediction {
  timestamp: string
  currentPrice: number
  predictions: {
    '1m': TimeframePrediction
    '5m': TimeframePrediction
    '15m': TimeframePrediction
    '1h': TimeframePrediction
    '4h': TimeframePrediction
    '1d': TimeframePrediction
  }
  overallConfidence: number
  strongestSignal: string
  marketRegime: string
  kellySizing: number
  criticalLevels: {
    support: number[]
    resistance: number[]
    vwap: number
  }
  warnings: string[]
}

export class IntegratedPredictionSystem {
  private featureExtractor: HurricaneFeatureExtractor
  private predictionModel: EnhancedPredictionModel
  private marketDataService: EnhancedMarketDataService
  private polygonApi: PolygonAPI
  private yahooFinance: YahooFinanceAPI
  
  constructor(polygonKey: string, twelveDataKey?: string) {
    this.featureExtractor = new HurricaneFeatureExtractor(polygonKey)
    this.predictionModel = new EnhancedPredictionModel()
    this.marketDataService = new EnhancedMarketDataService(polygonKey, twelveDataKey)
    this.polygonApi = new PolygonAPI(polygonKey)
    this.yahooFinance = new YahooFinanceAPI()
  }
  
  /**
   * Generate comprehensive predictions using all available data
   */
  async generatePrediction(asofDate?: string): Promise<ComprehensivePrediction> {
    console.log(`🚀 Generating comprehensive prediction ${asofDate ? `for ${asofDate}` : 'for current market'}`)
    
    // Fetch market data for all timeframes
    const marketData = await this.fetchAllTimeframeData(asofDate)
    
    // Get current market status
    const marketStatus = asofDate 
      ? await this.marketDataService.getHistoricalMarketStatus(asofDate)
      : await this.marketDataService.getMarketStatus()
    
    const currentPrice = marketStatus.spy.price
    
    // Extract features for each timeframe
    const features1m = await this.featureExtractor.extractFeatures(
      currentPrice,
      marketData.candles1m,
      marketData.candles5m,
      marketData.candles15m,
      marketData.candles1h,
      marketData.candles4h,
      marketData.candles1d
    )
    
    // Generate predictions for each timeframe
    const predictions: any = {}
    const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
    
    for (const tf of timeframes) {
      const signal = this.predictionModel.predict(features1m, tf)
      const kellySize = this.predictionModel.calculateKellySize(
        signal.confidence,
        signal.expectedMove / 100
      )
      
      predictions[tf] = {
        ...signal,
        features: this.getKeyFeatures(features1m),
        timestamp: Date.now(),
        kellySize
      }
    }
    
    // Calculate overall confidence (weighted by timeframe importance)
    const weights = { '1m': 1, '5m': 2, '15m': 2, '1h': 3, '4h': 2, '1d': 1 }
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
    const overallConfidence = timeframes.reduce((sum, tf) => 
      sum + predictions[tf].confidence * weights[tf], 0
    ) / totalWeight
    
    // Find strongest signal
    const strongestSignal = timeframes.reduce((best, tf) => 
      predictions[tf].confidence > predictions[best].confidence ? tf : best
    , '1m')
    
    // Determine market regime
    const marketRegime = this.determineMarketRegime(features1m)
    
    // Calculate overall Kelly sizing
    const kellySizing = this.predictionModel.calculateKellySize(
      overallConfidence,
      predictions[strongestSignal].expectedMove / 100
    )
    
    // Get critical levels
    const criticalLevels = {
      support: [features1m.nearest_support, features1m.fib_382, features1m.bb_lower],
      resistance: [features1m.nearest_resistance, features1m.fib_618, features1m.bb_upper],
      vwap: features1m.vwap
    }
    
    // Generate warnings
    const warnings = this.generateWarnings(features1m, predictions)
    
    return {
      timestamp: new Date().toISOString(),
      currentPrice,
      predictions,
      overallConfidence,
      strongestSignal,
      marketRegime,
      kellySizing,
      criticalLevels,
      warnings
    }
  }
  
  /**
   * Fetch candle data for all timeframes
   */
  private async fetchAllTimeframeData(asofDate?: string): Promise<{
    candles1m?: OHLCV[]
    candles5m?: OHLCV[]
    candles15m?: OHLCV[]
    candles1h?: OHLCV[]
    candles4h?: OHLCV[]
    candles1d?: OHLCV[]
  }> {
    try {
      // For historical data, we'll use daily candles
      if (asofDate) {
        const endDate = new Date(asofDate)
        const startDate = new Date(endDate)
        startDate.setDate(startDate.getDate() - 30)
        
        const dailyData = await this.polygonApi.getAggregates(
          'SPY',
          1,
          'day',
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        ).catch(() => null)
        
        if (dailyData) {
          const candles1d = this.convertToOHLCV(dailyData.results)
          
          return {
            candles1d,
            candles4h: candles1d,  // Use daily as proxy for historical
            candles1h: candles1d,
            candles15m: candles1d,
            candles5m: candles1d,
            candles1m: candles1d
          }
        }
      }
      
      // For live data, try Yahoo Finance FIRST for intraday data
      console.log('🎯 Attempting to fetch intraday data from Yahoo Finance...')
      
      try {
        const yahooData = await this.yahooFinance.getAllTimeframeData('SPY')
        
        if (yahooData.candles1m && yahooData.candles1m.length > 0) {
          console.log('✅ Successfully fetched Yahoo Finance intraday data!')
          console.log(`  • 1m candles: ${yahooData.candles1m.length}`)
          console.log(`  • 5m candles: ${yahooData.candles5m.length}`)
          console.log(`  • 15m candles: ${yahooData.candles15m.length}`)
          console.log(`  • 1h candles: ${yahooData.candles1h.length}`)
          console.log(`  • 1d candles: ${yahooData.candles1d.length}`)
          
          // Also fetch options data for better predictions
          const optionsChain = await this.yahooFinance.getOptionsChain('SPY')
          if (optionsChain) {
            console.log(`  • Options: ${optionsChain.calls.length} calls, ${optionsChain.puts.length} puts`)
          }
          
          return {
            candles1m: yahooData.candles1m,
            candles5m: yahooData.candles5m,
            candles15m: yahooData.candles15m,
            candles1h: yahooData.candles1h,
            candles4h: yahooData.candles1h,  // Use 1h as proxy for 4h
            candles1d: yahooData.candles1d
          }
        }
      } catch (yahooError) {
        console.warn('⚠️ Yahoo Finance failed, falling back to Polygon...', yahooError)
      }
      
      // Fallback to Polygon if Yahoo fails
      const now = new Date()
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      
      // Fetch what we can from Polygon
      const [data1h, data1d] = await Promise.all([
        this.polygonApi.getAggregates('SPY', 1, 'hour', 
          dayAgo.toISOString().split('T')[0],
          now.toISOString().split('T')[0]
        ).catch(() => null),
        
        this.polygonApi.getAggregates('SPY', 1, 'day',
          monthAgo.toISOString().split('T')[0],
          now.toISOString().split('T')[0]
        ).catch(() => null)
      ])
      
      return {
        candles1m: data1h ? this.convertToOHLCV(data1h.results).slice(-60) : undefined,
        candles5m: data1h ? this.convertToOHLCV(data1h.results).slice(-12) : undefined,
        candles15m: data1h ? this.convertToOHLCV(data1h.results).slice(-4) : undefined,
        candles1h: data1h ? this.convertToOHLCV(data1h.results) : undefined,
        candles4h: data1d ? this.convertToOHLCV(data1d.results).slice(-30) : undefined,
        candles1d: data1d ? this.convertToOHLCV(data1d.results) : undefined
      }
    } catch (error) {
      console.warn('Error fetching timeframe data:', error)
      return {}
    }
  }
  
  /**
   * Convert Polygon data to OHLCV format
   */
  private convertToOHLCV(data: any[]): OHLCV[] {
    if (!data || !Array.isArray(data)) return []
    
    return data.map(bar => ({
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      timestamp: bar.t
    }))
  }
  
  /**
   * Get key features for display
   */
  private getKeyFeatures(features: HurricaneFeatures): Partial<HurricaneFeatures> {
    return {
      rsi14: features.rsi14,
      macd: features.macd,
      macd_signal: features.macd_signal,
      macd_crossover: features.macd_crossover,
      adx14: features.adx14,
      bb_percentB: features.bb_percentB,
      volume_ratio: features.volume_ratio,
      vwap_distance: features.vwap_distance,
      momentum_score: features.momentum_score,
      trend_regime: features.trend_regime,
      volatility_regime: features.volatility_regime,
      gex: features.gex,
      dix: features.dix,
      put_call_ratio: features.put_call_ratio
    }
  }
  
  /**
   * Determine overall market regime
   */
  private determineMarketRegime(features: HurricaneFeatures): string {
    // Combine multiple regime indicators
    const regimes = []
    
    // Trend regime
    if (features.trend_regime === 'strong_up') {
      regimes.push('STRONG_BULLISH_TREND')
    } else if (features.trend_regime === 'strong_down') {
      regimes.push('STRONG_BEARISH_TREND')
    } else if (features.trending) {
      regimes.push('TRENDING')
    } else {
      regimes.push('RANGING')
    }
    
    // Volatility regime
    if (features.volatility_regime === 'extreme') {
      regimes.push('EXTREME_VOL')
    } else if (features.volatility_regime === 'high') {
      regimes.push('HIGH_VOL')
    }
    
    // Volume regime
    if (features.volume_regime === 'high') {
      regimes.push('HIGH_VOLUME')
    }
    
    // Options flow
    if (features.gex < -1e9) {
      regimes.push('NEGATIVE_GEX')
    }
    
    return regimes.join(' | ')
  }
  
  /**
   * Generate warnings based on market conditions
   */
  private generateWarnings(features: HurricaneFeatures, predictions: any): string[] {
    const warnings = []
    
    // Extreme volatility warning
    if (features.volatility_regime === 'extreme' || features.vix > 30) {
      warnings.push('⚠️ Extreme volatility detected - reduce position size')
    }
    
    // Divergence warning
    const bullishCount = Object.values(predictions).filter((p: any) => 
      p.direction === 'BUY' || p.direction === 'STRONG_BUY'
    ).length
    
    const bearishCount = Object.values(predictions).filter((p: any) => 
      p.direction === 'SELL' || p.direction === 'STRONG_SELL'
    ).length
    
    if (bullishCount > 0 && bearishCount > 0 && Math.abs(bullishCount - bearishCount) <= 1) {
      warnings.push('⚠️ Mixed signals across timeframes - wait for clarity')
    }
    
    // Low volume warning
    if (features.volume_regime === 'low') {
      warnings.push('⚠️ Low volume - signals may be less reliable')
    }
    
    // Overbought/Oversold warning
    if (features.rsi14 > 80) {
      warnings.push('⚠️ Extremely overbought (RSI > 80)')
    } else if (features.rsi14 < 20) {
      warnings.push('⚠️ Extremely oversold (RSI < 20)')
    }
    
    // Options flow warning
    if (features.put_call_ratio > 1.5) {
      warnings.push('⚠️ Extreme put buying detected')
    } else if (features.put_call_ratio < 0.4) {
      warnings.push('⚠️ Extreme call buying detected')
    }
    
    // Support/Resistance warning
    if (Math.abs(features.resistance_distance) < 0.002) {
      warnings.push('⚠️ At major resistance level')
    } else if (Math.abs(features.support_distance) < 0.002) {
      warnings.push('⚠️ At major support level')
    }
    
    return warnings
  }
}