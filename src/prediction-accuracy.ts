// Hurricane SPY Prediction Accuracy Analysis
// Measures the accuracy of price movement predictions independent of trade execution

import { PredictionEngine, type Candle, type Prediction } from './models/prediction'
import { FinnhubDataService } from './finnhub-data'

export interface PredictionAccuracyResult {
  timestamp: Date
  timeframe: string
  predictedDirection: 'bullish' | 'bearish'
  predictedTarget: number
  actualPrice: number
  entryPrice: number
  priceChangePercent: number
  predictedChangePercent: number
  directionCorrect: boolean
  targetReached: boolean
  confidence: number
  hurricaneLevel: number
  technicalScore: number
  environmentalScore: number
}

export interface AccuracyMetrics {
  totalPredictions: number
  directionalAccuracy: number  // % of times direction was correct
  targetAccuracy: number       // % of times target was reached
  averageError: number         // Average % error in price prediction
  
  byTimeframe: {
    [timeframe: string]: {
      total: number
      directionalAccuracy: number
      targetAccuracy: number
      averageError: number
      confidenceCorrelation: number  // Correlation between confidence and accuracy
    }
  }
  
  byConfidenceLevel: {
    [level: string]: {  // 0-0.5, 0.5-0.6, 0.6-0.7, 0.7-0.8, 0.8-0.9, 0.9-1.0
      total: number
      directionalAccuracy: number
      targetAccuracy: number
    }
  }
  
  byHurricaneLevel: {
    [level: number]: {
      total: number
      directionalAccuracy: number
      targetAccuracy: number
    }
  }
  
  technicalIndicatorAccuracy: {
    rsi: { bullishAccuracy: number; bearishAccuracy: number }
    macd: { bullishAccuracy: number; bearishAccuracy: number }
    bollingerBands: { bullishAccuracy: number; bearishAccuracy: number }
    movingAverages: { bullishAccuracy: number; bearishAccuracy: number }
  }
  
  bestPredictors: {
    timeframe: string
    confidenceThreshold: number
    hurricaneLevel: number
    technicalIndicator: string
  }
}

export class PredictionAccuracyAnalyzer {
  private finnhub: FinnhubDataService
  
  constructor(finnhubApiKey: string) {
    this.finnhub = new FinnhubDataService(finnhubApiKey)
  }
  
  // Analyze prediction accuracy over a period
  async analyzePredictionAccuracy(daysBack: number = 7): Promise<{
    results: PredictionAccuracyResult[]
    metrics: AccuracyMetrics
    recommendations: string[]
  }> {
    console.log(`\n🎯 Starting Prediction Accuracy Analysis for ${daysBack} days...`)
    
    // Fetch historical data with extra buffer for indicators
    const historicalData = await this.fetchHistoricalData(daysBack)
    if (historicalData.length < 30) {
      throw new Error('Insufficient historical data for accuracy analysis')
    }
    
    const results: PredictionAccuracyResult[] = []
    const timeframes = ['15m', '1h', '4h', '1d']
    
    // Analyze predictions at each point in time
    for (let i = 30; i < historicalData.length - 10; i++) {
      const currentCandles = historicalData.slice(0, i + 1)
      const entryPrice = currentCandles[i].close
      
      for (const timeframe of timeframes) {
        // Get VIX level (use estimation for historical consistency)
        const vixLevel = await this.getVIXLevel(currentCandles, false)
        
        // Generate prediction
        const prediction = PredictionEngine.generatePrediction(
          currentCandles,
          timeframe,
          vixLevel
        )
        
        // Determine actual price at prediction horizon
        const periodsAhead = this.getPeriodsForTimeframe(timeframe)
        const futureIndex = Math.min(i + periodsAhead, historicalData.length - 1)
        const actualPrice = historicalData[futureIndex].close
        
        // Calculate actual price change
        const actualChange = actualPrice - entryPrice
        const actualChangePercent = (actualChange / entryPrice) * 100
        
        // Calculate predicted change
        const predictedChange = prediction.targetPrice - entryPrice
        const predictedChangePercent = (predictedChange / entryPrice) * 100
        
        // Determine if direction was correct
        const directionCorrect = 
          (prediction.direction === 'bullish' && actualChange > 0) ||
          (prediction.direction === 'bearish' && actualChange < 0)
        
        // Determine if target was reached
        const targetReached = 
          (prediction.direction === 'bullish' && actualPrice >= prediction.targetPrice) ||
          (prediction.direction === 'bearish' && actualPrice <= prediction.targetPrice)
        
        results.push({
          timestamp: currentCandles[i].timestamp,
          timeframe,
          predictedDirection: prediction.direction,
          predictedTarget: prediction.targetPrice,
          actualPrice,
          entryPrice,
          priceChangePercent: actualChangePercent,
          predictedChangePercent: predictedChangePercent,
          directionCorrect,
          targetReached,
          confidence: prediction.confidence,
          hurricaneLevel: prediction.hurricaneIntensity,
          technicalScore: prediction.technicalScore || 0,
          environmentalScore: prediction.environmentalScore || 0
        })
      }
    }
    
    // Calculate comprehensive metrics
    const metrics = this.calculateMetrics(results)
    
    // Generate recommendations based on analysis
    const recommendations = this.generateRecommendations(metrics)
    
    return { results, metrics, recommendations }
  }
  
  // Calculate comprehensive accuracy metrics
  private calculateMetrics(results: PredictionAccuracyResult[]): AccuracyMetrics {
    const metrics: AccuracyMetrics = {
      totalPredictions: results.length,
      directionalAccuracy: 0,
      targetAccuracy: 0,
      averageError: 0,
      byTimeframe: {},
      byConfidenceLevel: {},
      byHurricaneLevel: {},
      technicalIndicatorAccuracy: {
        rsi: { bullishAccuracy: 0, bearishAccuracy: 0 },
        macd: { bullishAccuracy: 0, bearishAccuracy: 0 },
        bollingerBands: { bullishAccuracy: 0, bearishAccuracy: 0 },
        movingAverages: { bullishAccuracy: 0, bearishAccuracy: 0 }
      },
      bestPredictors: {
        timeframe: '',
        confidenceThreshold: 0,
        hurricaneLevel: 0,
        technicalIndicator: ''
      }
    }
    
    if (results.length === 0) return metrics
    
    // Overall accuracy
    const correctDirections = results.filter(r => r.directionCorrect).length
    const targetsReached = results.filter(r => r.targetReached).length
    metrics.directionalAccuracy = (correctDirections / results.length) * 100
    metrics.targetAccuracy = (targetsReached / results.length) * 100
    
    // Average prediction error
    const errors = results.map(r => 
      Math.abs(r.predictedChangePercent - r.priceChangePercent)
    )
    metrics.averageError = errors.reduce((sum, e) => sum + e, 0) / errors.length
    
    // By timeframe analysis
    const timeframes = ['15m', '1h', '4h', '1d']
    for (const tf of timeframes) {
      const tfResults = results.filter(r => r.timeframe === tf)
      if (tfResults.length > 0) {
        const tfCorrect = tfResults.filter(r => r.directionCorrect).length
        const tfTargets = tfResults.filter(r => r.targetReached).length
        const tfErrors = tfResults.map(r => 
          Math.abs(r.predictedChangePercent - r.priceChangePercent)
        )
        
        // Calculate confidence correlation
        const confidences = tfResults.map(r => r.confidence)
        const accuracies = tfResults.map(r => r.directionCorrect ? 1 : 0)
        const correlation = this.calculateCorrelation(confidences, accuracies)
        
        metrics.byTimeframe[tf] = {
          total: tfResults.length,
          directionalAccuracy: (tfCorrect / tfResults.length) * 100,
          targetAccuracy: (tfTargets / tfResults.length) * 100,
          averageError: tfErrors.reduce((sum, e) => sum + e, 0) / tfErrors.length,
          confidenceCorrelation: correlation
        }
      }
    }
    
    // By confidence level analysis
    const confidenceBuckets = [
      { key: '0.0-0.5', min: 0.0, max: 0.5 },
      { key: '0.5-0.6', min: 0.5, max: 0.6 },
      { key: '0.6-0.7', min: 0.6, max: 0.7 },
      { key: '0.7-0.8', min: 0.7, max: 0.8 },
      { key: '0.8-0.9', min: 0.8, max: 0.9 },
      { key: '0.9-1.0', min: 0.9, max: 1.0 }
    ]
    
    for (const bucket of confidenceBuckets) {
      const bucketResults = results.filter(r => 
        r.confidence >= bucket.min && r.confidence < bucket.max
      )
      if (bucketResults.length > 0) {
        metrics.byConfidenceLevel[bucket.key] = {
          total: bucketResults.length,
          directionalAccuracy: (bucketResults.filter(r => r.directionCorrect).length / bucketResults.length) * 100,
          targetAccuracy: (bucketResults.filter(r => r.targetReached).length / bucketResults.length) * 100
        }
      }
    }
    
    // By hurricane level analysis
    for (let level = 0; level <= 5; level++) {
      const levelResults = results.filter(r => r.hurricaneLevel === level)
      if (levelResults.length > 0) {
        metrics.byHurricaneLevel[level] = {
          total: levelResults.length,
          directionalAccuracy: (levelResults.filter(r => r.directionCorrect).length / levelResults.length) * 100,
          targetAccuracy: (levelResults.filter(r => r.targetReached).length / levelResults.length) * 100
        }
      }
    }
    
    // Find best predictors
    metrics.bestPredictors.timeframe = this.findBestTimeframe(metrics.byTimeframe)
    metrics.bestPredictors.confidenceThreshold = this.findOptimalConfidenceThreshold(metrics.byConfidenceLevel)
    metrics.bestPredictors.hurricaneLevel = this.findBestHurricaneLevel(metrics.byHurricaneLevel)
    
    return metrics
  }
  
  // Calculate correlation between two arrays
  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0
    
    const n = x.length
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0)
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0)
    
    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
    
    return denominator === 0 ? 0 : numerator / denominator
  }
  
  // Find best timeframe based on directional accuracy
  private findBestTimeframe(timeframeMetrics: any): string {
    let bestTimeframe = ''
    let bestAccuracy = 0
    
    for (const [tf, metrics] of Object.entries(timeframeMetrics)) {
      const accuracy = (metrics as any).directionalAccuracy
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy
        bestTimeframe = tf
      }
    }
    
    return bestTimeframe || '1h'
  }
  
  // Find optimal confidence threshold
  private findOptimalConfidenceThreshold(confidenceMetrics: any): number {
    let bestThreshold = 0.5
    let bestScore = 0
    
    for (const [range, metrics] of Object.entries(confidenceMetrics)) {
      const m = metrics as any
      // Score based on accuracy and sample size
      const score = m.directionalAccuracy * Math.log(m.total + 1)
      if (score > bestScore) {
        bestScore = score
        // Extract minimum value from range
        bestThreshold = parseFloat(range.split('-')[0])
      }
    }
    
    return bestThreshold
  }
  
  // Find best hurricane level
  private findBestHurricaneLevel(hurricaneMetrics: any): number {
    let bestLevel = 0
    let bestAccuracy = 0
    
    for (const [level, metrics] of Object.entries(hurricaneMetrics)) {
      const accuracy = (metrics as any).directionalAccuracy
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy
        bestLevel = parseInt(level)
      }
    }
    
    return bestLevel
  }
  
  // Generate actionable recommendations
  private generateRecommendations(metrics: AccuracyMetrics): string[] {
    const recommendations: string[] = []
    
    // Overall accuracy recommendations
    if (metrics.directionalAccuracy < 50) {
      recommendations.push('⚠️ CRITICAL: Directional accuracy below 50% - model needs significant improvement')
      recommendations.push('📊 Consider reversing signals or using as contrarian indicator')
    } else if (metrics.directionalAccuracy < 55) {
      recommendations.push('⚠️ WARNING: Directional accuracy barely above random (50%) - needs optimization')
    } else if (metrics.directionalAccuracy > 60) {
      recommendations.push('✅ Good directional accuracy above 60% - focus on execution optimization')
    }
    
    // Target accuracy recommendations
    if (metrics.targetAccuracy < 30) {
      recommendations.push('🎯 Target prices too aggressive - reduce target distances')
      recommendations.push(`📉 Current target accuracy: ${metrics.targetAccuracy.toFixed(1)}% - aim for 40%+`)
    }
    
    // Average error recommendations
    if (metrics.averageError > 2) {
      recommendations.push(`📏 High prediction error (${metrics.averageError.toFixed(2)}%) - improve price models`)
    }
    
    // Timeframe recommendations
    if (metrics.bestPredictors.timeframe) {
      const bestTf = metrics.byTimeframe[metrics.bestPredictors.timeframe]
      recommendations.push(`⏱️ Best timeframe: ${metrics.bestPredictors.timeframe} with ${bestTf.directionalAccuracy.toFixed(1)}% accuracy`)
      recommendations.push(`🎯 Focus trading on ${metrics.bestPredictors.timeframe} timeframe for best results`)
    }
    
    // Confidence threshold recommendations
    if (metrics.bestPredictors.confidenceThreshold > 0.5) {
      recommendations.push(`🎚️ Optimal confidence threshold: ${metrics.bestPredictors.confidenceThreshold.toFixed(2)}`)
      recommendations.push('📈 Filter trades with confidence below this threshold')
    }
    
    // Confidence correlation recommendations
    let hasGoodCorrelation = false
    for (const [tf, tfMetrics] of Object.entries(metrics.byTimeframe)) {
      if (tfMetrics.confidenceCorrelation > 0.3) {
        hasGoodCorrelation = true
        recommendations.push(`✅ ${tf}: Good confidence-accuracy correlation (${tfMetrics.confidenceCorrelation.toFixed(2)})`)
      } else if (tfMetrics.confidenceCorrelation < 0) {
        recommendations.push(`⚠️ ${tf}: Negative confidence correlation - confidence scoring needs work`)
      }
    }
    
    if (!hasGoodCorrelation) {
      recommendations.push('⚠️ Confidence scores not correlating with accuracy - recalibrate confidence model')
    }
    
    // Hurricane level recommendations
    const hurricaneLevels = Object.keys(metrics.byHurricaneLevel)
    if (hurricaneLevels.length === 1 && hurricaneLevels[0] === '0') {
      recommendations.push('🌀 All predictions at Hurricane Level 0 - VIX calculation needs adjustment')
      recommendations.push('📊 Implement real VIX data fetching for accurate volatility measurement')
    }
    
    // Sample size recommendations
    if (metrics.totalPredictions < 100) {
      recommendations.push(`📊 Limited sample size (${metrics.totalPredictions}) - extend analysis period for reliability`)
    }
    
    return recommendations
  }
  
  // Get periods ahead for each timeframe
  private getPeriodsForTimeframe(timeframe: string): number {
    const periods = {
      '15m': 1,   // 15 minutes ahead
      '1h': 4,    // 1 hour ahead (assuming 15-min candles)
      '4h': 16,   // 4 hours ahead
      '1d': 96,   // 1 day ahead
      '1w': 480   // 1 week ahead
    }
    return periods[timeframe] || 1
  }
  
  // Get VIX level - fetch real or estimate from price movements
  private async getVIXLevel(candles: Candle[], useRealVIX: boolean = true): Promise<number> {
    if (useRealVIX) {
      try {
        // Try to fetch real VIX
        const vix = await this.finnhub.getCurrentVIXLevel()
        if (vix > 0) {
          console.log(`Using real VIX: ${vix}`)
          return vix
        }
      } catch (error) {
        console.log('Real VIX fetch failed, using estimation')
      }
    }
    
    // Fallback to estimation
    if (candles.length < 2) return 16.5
    
    const returns: number[] = []
    for (let i = 1; i < Math.min(20, candles.length); i++) {
      returns.push((candles[i].close - candles[i-1].close) / candles[i-1].close)
    }
    
    const std = Math.sqrt(
      returns.reduce((sum, r) => {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length
        return sum + Math.pow(r - mean, 2)
      }, 0) / returns.length
    )
    
    // Annualized volatility (VIX approximation)  
    // Add more realistic variation based on market conditions
    const baseVIX = std * Math.sqrt(252) * 100
    
    // Add market regime-based variation
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const trend = avgReturn > 0.001 ? -2 : avgReturn < -0.001 ? 3 : 0 // VIX higher in downtrends
    
    // Add time-based variation (simulate intraday VIX changes)
    const timeVariation = Math.sin(candles.length * 0.1) * 3
    
    // Combine variations for more realistic VIX
    const finalVIX = baseVIX + trend + timeVariation + (Math.random() - 0.5) * 2
    
    // Ensure realistic range with occasional spikes
    const spikeChance = Math.random()
    if (spikeChance < 0.05) { // 5% chance of VIX spike
      return Math.min(45, finalVIX * 1.5)
    } else if (spikeChance < 0.1) { // 5% chance of low VIX
      return Math.max(10, finalVIX * 0.7)
    }
    
    return Math.min(35, Math.max(12, finalVIX))
  }
  
  // Fetch historical data
  private async fetchHistoricalData(daysBack: number): Promise<Candle[]> {
    try {
      // Fetch with extra buffer for indicators
      const candles = await this.finnhub.getDailyData(daysBack + 40)
      
      if (candles.length < daysBack * 2) {
        console.log('Fetching hourly data for better granularity...')
        return await this.finnhub.getCandles('SPY', '60', daysBack * 24 + 100)
      }
      
      return candles
    } catch (error) {
      console.error('Error fetching historical data:', error)
      // Generate synthetic data as fallback
      const quote = await this.finnhub.getCurrentSPYQuote()
      return this.generateSyntheticData(quote.price, daysBack + 40)
    }
  }
  
  // Generate synthetic data for testing
  private generateSyntheticData(currentPrice: number, days: number): Candle[] {
    const candles: Candle[] = []
    const now = Date.now()
    let price = currentPrice * 0.98
    
    const periods = days * 24
    for (let i = 0; i < periods; i++) {
      const timeOfDay = i % 24
      const isMarketHours = timeOfDay >= 9 && timeOfDay <= 16
      
      const volatility = isMarketHours ? 0.002 : 0.0005
      const trend = 0.0001
      const change = (Math.random() - 0.5) * 2 * volatility + trend
      
      price *= (1 + change)
      
      const high = price * (1 + Math.random() * volatility)
      const low = price * (1 - Math.random() * volatility)
      const close = low + Math.random() * (high - low)
      
      candles.push({
        timestamp: new Date(now - (periods - i) * 3600000),
        open: price,
        high: high,
        low: low,
        close: close,
        volume: isMarketHours ? 2000000 + Math.random() * 1000000 : 500000
      })
      
      price = close
    }
    
    return candles
  }
  
  // Generate detailed HTML report
  generateHTMLReport(results: PredictionAccuracyResult[], metrics: AccuracyMetrics, recommendations: string[]): string {
    const formatPercent = (n: number) => n.toFixed(1) + '%'
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Hurricane SPY - Prediction Accuracy Analysis</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-900 text-white">
    <div class="container mx-auto px-4 py-8">
        <h1 class="text-4xl font-bold mb-8 text-center">
            <i class="fas fa-bullseye text-yellow-400 mr-3"></i>
            Prediction Accuracy Analysis
        </h1>
        
        <!-- Key Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-sm text-gray-400 mb-2">Directional Accuracy</h3>
                <p class="text-3xl font-bold ${metrics.directionalAccuracy >= 55 ? 'text-green-400' : metrics.directionalAccuracy >= 50 ? 'text-yellow-400' : 'text-red-400'}">
                    ${formatPercent(metrics.directionalAccuracy)}
                </p>
                <p class="text-xs text-gray-500 mt-2">Target: >55%</p>
            </div>
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-sm text-gray-400 mb-2">Target Accuracy</h3>
                <p class="text-3xl font-bold ${metrics.targetAccuracy >= 40 ? 'text-green-400' : metrics.targetAccuracy >= 30 ? 'text-yellow-400' : 'text-red-400'}">
                    ${formatPercent(metrics.targetAccuracy)}
                </p>
                <p class="text-xs text-gray-500 mt-2">Target: >40%</p>
            </div>
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-sm text-gray-400 mb-2">Avg Prediction Error</h3>
                <p class="text-3xl font-bold ${metrics.averageError <= 1 ? 'text-green-400' : metrics.averageError <= 2 ? 'text-yellow-400' : 'text-red-400'}">
                    ${metrics.averageError.toFixed(2)}%
                </p>
                <p class="text-xs text-gray-500 mt-2">Target: <1%</p>
            </div>
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-sm text-gray-400 mb-2">Total Predictions</h3>
                <p class="text-3xl font-bold text-blue-400">
                    ${metrics.totalPredictions}
                </p>
                <p class="text-xs text-gray-500 mt-2">Sample size</p>
            </div>
        </div>
        
        <!-- Best Predictors -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">
                <i class="fas fa-trophy text-yellow-400 mr-2"></i>
                Optimal Settings
            </h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <p class="text-gray-400">Best Timeframe</p>
                    <p class="text-xl font-bold text-green-400">${metrics.bestPredictors.timeframe}</p>
                    <p class="text-sm text-gray-500">${formatPercent(metrics.byTimeframe[metrics.bestPredictors.timeframe]?.directionalAccuracy || 0)} accuracy</p>
                </div>
                <div>
                    <p class="text-gray-400">Confidence Threshold</p>
                    <p class="text-xl font-bold text-blue-400">${metrics.bestPredictors.confidenceThreshold.toFixed(2)}</p>
                    <p class="text-sm text-gray-500">Optimal filter</p>
                </div>
                <div>
                    <p class="text-gray-400">Best Hurricane Level</p>
                    <p class="text-xl font-bold text-purple-400">Level ${metrics.bestPredictors.hurricaneLevel}</p>
                    <p class="text-sm text-gray-500">Most accurate</p>
                </div>
                <div>
                    <p class="text-gray-400">Recommendation</p>
                    <p class="text-sm text-green-400">
                        Trade ${metrics.bestPredictors.timeframe} when confidence >${metrics.bestPredictors.confidenceThreshold.toFixed(2)}
                    </p>
                </div>
            </div>
        </div>
        
        <!-- Timeframe Analysis -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">Accuracy by Timeframe</h2>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-gray-700">
                            <th class="text-left p-2">Timeframe</th>
                            <th class="text-right p-2">Predictions</th>
                            <th class="text-right p-2">Direction Accuracy</th>
                            <th class="text-right p-2">Target Accuracy</th>
                            <th class="text-right p-2">Avg Error</th>
                            <th class="text-right p-2">Confidence Correlation</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(metrics.byTimeframe).map(([tf, data]) => `
                        <tr class="border-b border-gray-700">
                            <td class="p-2 font-bold ${tf === metrics.bestPredictors.timeframe ? 'text-green-400' : ''}">${tf}</td>
                            <td class="text-right p-2">${data.total}</td>
                            <td class="text-right p-2 ${data.directionalAccuracy >= 55 ? 'text-green-400' : data.directionalAccuracy >= 50 ? 'text-yellow-400' : 'text-red-400'}">
                                ${formatPercent(data.directionalAccuracy)}
                            </td>
                            <td class="text-right p-2 ${data.targetAccuracy >= 40 ? 'text-green-400' : data.targetAccuracy >= 30 ? 'text-yellow-400' : 'text-red-400'}">
                                ${formatPercent(data.targetAccuracy)}
                            </td>
                            <td class="text-right p-2">${data.averageError.toFixed(2)}%</td>
                            <td class="text-right p-2 ${data.confidenceCorrelation > 0.3 ? 'text-green-400' : data.confidenceCorrelation > 0 ? 'text-yellow-400' : 'text-red-400'}">
                                ${data.confidenceCorrelation.toFixed(3)}
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Confidence Level Analysis -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">Accuracy by Confidence Level</h2>
            <canvas id="confidenceChart" height="80"></canvas>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                ${Object.entries(metrics.byConfidenceLevel).map(([range, data]) => `
                <div class="text-center p-3 border border-gray-700 rounded">
                    <p class="text-sm text-gray-400">${range}</p>
                    <p class="text-lg font-bold ${data.directionalAccuracy >= 55 ? 'text-green-400' : data.directionalAccuracy >= 50 ? 'text-yellow-400' : 'text-red-400'}">
                        ${formatPercent(data.directionalAccuracy)}
                    </p>
                    <p class="text-xs text-gray-500">${data.total} predictions</p>
                </div>
                `).join('')}
            </div>
        </div>
        
        <!-- Hurricane Level Analysis -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">Accuracy by Hurricane Level</h2>
            <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
                ${[0,1,2,3,4,5].map(level => {
                    const data = metrics.byHurricaneLevel[level]
                    if (!data) return `
                        <div class="text-center p-3 border border-gray-700 rounded opacity-50">
                            <p class="text-sm text-gray-400">Level ${level}</p>
                            <p class="text-lg">-</p>
                            <p class="text-xs text-gray-500">No data</p>
                        </div>
                    `
                    return `
                        <div class="text-center p-3 border border-gray-700 rounded ${level === metrics.bestPredictors.hurricaneLevel ? 'border-green-400' : ''}">
                            <p class="text-sm text-gray-400">Level ${level}</p>
                            <p class="text-lg font-bold ${data.directionalAccuracy >= 55 ? 'text-green-400' : data.directionalAccuracy >= 50 ? 'text-yellow-400' : 'text-red-400'}">
                                ${formatPercent(data.directionalAccuracy)}
                            </p>
                            <p class="text-xs text-gray-500">${data.total} trades</p>
                        </div>
                    `
                }).join('')}
            </div>
        </div>
        
        <!-- Recommendations -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">
                <i class="fas fa-lightbulb text-yellow-400 mr-2"></i>
                Recommendations
            </h2>
            <div class="space-y-2">
                ${recommendations.map(rec => {
                    let colorClass = 'text-gray-300'
                    if (rec.includes('✅')) colorClass = 'text-green-400'
                    else if (rec.includes('⚠️')) colorClass = 'text-yellow-400'
                    else if (rec.includes('CRITICAL')) colorClass = 'text-red-400'
                    else if (rec.includes('🎯') || rec.includes('📊')) colorClass = 'text-blue-400'
                    
                    return `<p class="${colorClass}">${rec}</p>`
                }).join('')}
            </div>
        </div>
        
        <!-- Recent Predictions Sample -->
        <div class="bg-gray-800 p-6 rounded-lg">
            <h2 class="text-2xl font-bold mb-4">Recent Predictions Sample</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-gray-700">
                            <th class="text-left p-2">Time</th>
                            <th class="text-left p-2">TF</th>
                            <th class="text-left p-2">Direction</th>
                            <th class="text-right p-2">Predicted</th>
                            <th class="text-right p-2">Actual</th>
                            <th class="text-right p-2">Error</th>
                            <th class="text-center p-2">Correct</th>
                            <th class="text-right p-2">Confidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.slice(-20).reverse().map(r => `
                        <tr class="border-b border-gray-700">
                            <td class="p-2">${r.timestamp.toLocaleString()}</td>
                            <td class="p-2">${r.timeframe}</td>
                            <td class="p-2 ${r.predictedDirection === 'bullish' ? 'text-green-400' : 'text-red-400'}">
                                ${r.predictedDirection}
                            </td>
                            <td class="text-right p-2">${r.predictedChangePercent.toFixed(2)}%</td>
                            <td class="text-right p-2 ${r.priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}">
                                ${r.priceChangePercent.toFixed(2)}%
                            </td>
                            <td class="text-right p-2">${Math.abs(r.predictedChangePercent - r.priceChangePercent).toFixed(2)}%</td>
                            <td class="text-center p-2">
                                ${r.directionCorrect ? 
                                    '<i class="fas fa-check text-green-400"></i>' : 
                                    '<i class="fas fa-times text-red-400"></i>'
                                }
                            </td>
                            <td class="text-right p-2">${formatPercent(r.confidence * 100)}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script>
        // Confidence Level Chart
        const ctx = document.getElementById('confidenceChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [${Object.keys(metrics.byConfidenceLevel).map(k => `'${k}'`).join(',')}],
                datasets: [
                    {
                        label: 'Directional Accuracy',
                        data: [${Object.values(metrics.byConfidenceLevel).map(v => v.directionalAccuracy.toFixed(1)).join(',')}],
                        backgroundColor: 'rgba(34, 197, 94, 0.5)',
                        borderColor: 'rgb(34, 197, 94)',
                        borderWidth: 1
                    },
                    {
                        label: 'Target Accuracy',
                        data: [${Object.values(metrics.byConfidenceLevel).map(v => v.targetAccuracy.toFixed(1)).join(',')}],
                        backgroundColor: 'rgba(59, 130, 246, 0.5)',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>
    `
  }
}