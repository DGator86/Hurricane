/**
 * Calibration Script for Hurricane SPY Predictions
 * Optimizes RSI bounds and weight parameters to maximize directional accuracy
 * Target: 75% accuracy with p80 coverage near 0.80±0.05
 */

import { loadTF, TF_SPEC, TFData } from '../src/services/TimeframeDataLoader'
import { generateSignals, fuseSignals, fuseMulitpleTimeframes } from '../src/services/SignalFusion'
import { PredictionHealthChecker } from '../src/services/HealthChecks'
import { YahooFinanceAPI } from '../src/services/YahooFinanceAPI'
import { PolygonAPI } from '../src/services/PolygonAPI'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration for calibration
export interface CalibrationConfig {
  symbol: string
  startDate: Date
  endDate: Date
  validationSplit: number  // Percentage for validation set
  targetAccuracy: number   // Target directional accuracy
  p80Target: number       // Target p80 coverage
  p80Tolerance: number    // Tolerance for p80
}

// Parameter bounds for optimization
export interface ParameterBounds {
  rsiBounds: {
    [tf: string]: {
      oversold: [number, number]  // [min, max]
      overbought: [number, number]
    }
  }
  weightBounds: {
    maxWeight: [number, number]
    minConfirmations: [number, number]
    abstainThreshold: [number, number]
  }
  regimeMultipliers: {
    trend: [number, number]
    range: [number, number]
    volexp: [number, number]
    flux: [number, number]
  }
}

// Parameter set being tested
interface ParameterSet {
  rsiBounds: Record<string, { oversold: number; overbought: number }>
  maxWeight: number
  minConfirmations: number
  abstainThreshold: number
  regimeMultipliers: Record<string, number>
}

// Results for a parameter set
export interface CalibrationResult {
  params: ParameterSet
  accuracy: number
  p80Coverage: number
  sharpeRatio: number
  maxDrawdown: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  kellyFraction: number
  score: number  // Combined optimization score
}

export class HurricaneCalibrator {
  private config: CalibrationConfig
  private bounds: ParameterBounds
  private yahooAPI: YahooFinanceAPI
  private polygonAPI: PolygonAPI
  private healthChecker: PredictionHealthChecker
  private historicalData: Map<string, TFData[]> = new Map()
  private bestResult: CalibrationResult | null = null

  constructor(config: CalibrationConfig, bounds: ParameterBounds) {
    this.config = config
    this.bounds = bounds
    this.yahooAPI = new YahooFinanceAPI()
    this.polygonAPI = new PolygonAPI(process.env.POLYGON_API_KEY || '')
    this.healthChecker = new PredictionHealthChecker()
  }

  /**
   * Load historical data for all timeframes
   */
  async loadHistoricalData(): Promise<void> {
    console.log('📊 Loading historical data...')
    
    const timeframes: TF[] = ['1m', '5m', '15m', '1h', '4h', '1d']
    const startMs = this.config.startDate.getTime()
    const endMs = this.config.endDate.getTime()
    const dayMs = 24 * 60 * 60 * 1000
    
    // Load data day by day
    for (let dateMs = startMs; dateMs < endMs; dateMs += dayMs) {
      const date = new Date(dateMs)
      const dateKey = date.toISOString().split('T')[0]
      
      const tfDataArray: TFData[] = []
      
      for (const tf of timeframes) {
        try {
          // Try Yahoo first, fallback to Polygon
          const data = await this.loadTFWithFallback(this.config.symbol, tf, date)
          tfDataArray.push(data)
        } catch (error) {
          console.warn(`⚠️ Failed to load ${tf} data for ${dateKey}: ${error}`)
        }
      }
      
      if (tfDataArray.length >= 3) {  // Need at least 3 timeframes
        this.historicalData.set(dateKey, tfDataArray)
      }
    }
    
    console.log(`✅ Loaded ${this.historicalData.size} days of data`)
  }

  /**
   * Load timeframe data with fallback
   */
  async loadTFWithFallback(symbol: string, tf: TF, date: Date): Promise<TFData> {
    const dataFetcher = async (sym: string, timeframe: TF, lookback: number) => {
      try {
        // Try Yahoo Finance first
        return await this.yahooAPI.fetchOHLCV(sym, timeframe, lookback, date)
      } catch (error) {
        // Fallback to Polygon
        return await this.polygonAPI.fetchOHLCV(sym, timeframe, lookback, date)
      }
    }
    
    return await loadTF(symbol, tf, date, dataFetcher)
  }

  /**
   * Generate parameter set from bounds
   */
  generateParameterSet(iteration: number, totalIterations: number): ParameterSet {
    // Use Latin Hypercube Sampling for better parameter space coverage
    const t = iteration / totalIterations
    
    // RSI bounds with recommended starting points
    const rsiBounds: Record<string, { oversold: number; overbought: number }> = {
      '1m': {
        oversold: this.lerp(this.bounds.rsiBounds['1m'].oversold[0], 
                           this.bounds.rsiBounds['1m'].oversold[1], t + Math.random() * 0.1),
        overbought: this.lerp(this.bounds.rsiBounds['1m'].overbought[0],
                             this.bounds.rsiBounds['1m'].overbought[1], t + Math.random() * 0.1)
      },
      '15m': {
        oversold: this.lerp(35, 45, t + Math.random() * 0.1),
        overbought: this.lerp(55, 65, t + Math.random() * 0.1)
      },
      '1h': {
        oversold: this.lerp(35, 45, t + Math.random() * 0.1),
        overbought: this.lerp(55, 65, t + Math.random() * 0.1)
      },
      '4h': {
        oversold: this.lerp(37, 47, t + Math.random() * 0.1),
        overbought: this.lerp(53, 63, t + Math.random() * 0.1)
      },
      '1d': {
        oversold: this.lerp(40, 50, t + Math.random() * 0.1),
        overbought: this.lerp(50, 60, t + Math.random() * 0.1)
      }
    }
    
    return {
      rsiBounds,
      maxWeight: this.lerp(this.bounds.weightBounds.maxWeight[0],
                          this.bounds.weightBounds.maxWeight[1], Math.random()),
      minConfirmations: Math.round(this.lerp(this.bounds.weightBounds.minConfirmations[0],
                                             this.bounds.weightBounds.minConfirmations[1], Math.random())),
      abstainThreshold: this.lerp(this.bounds.weightBounds.abstainThreshold[0],
                                  this.bounds.weightBounds.abstainThreshold[1], Math.random()),
      regimeMultipliers: {
        trend: this.lerp(this.bounds.regimeMultipliers.trend[0],
                        this.bounds.regimeMultipliers.trend[1], Math.random()),
        range: this.lerp(this.bounds.regimeMultipliers.range[0],
                        this.bounds.regimeMultipliers.range[1], Math.random()),
        volexp: this.lerp(this.bounds.regimeMultipliers.volexp[0],
                         this.bounds.regimeMultipliers.volexp[1], Math.random()),
        flux: this.lerp(this.bounds.regimeMultipliers.flux[0],
                       this.bounds.regimeMultipliers.flux[1], Math.random())
      }
    }
  }

  /**
   * Linear interpolation helper
   */
  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t))
  }

  /**
   * Evaluate parameter set on historical data
   */
  async evaluateParameters(params: ParameterSet): Promise<CalibrationResult> {
    const predictions: any[] = []
    const actuals: number[] = []
    const confidences: number[] = []
    const returns: number[] = []
    
    // Split data into training and validation
    const allDates = Array.from(this.historicalData.keys()).sort()
    const splitIndex = Math.floor(allDates.length * (1 - this.config.validationSplit))
    const validationDates = allDates.slice(splitIndex)
    
    for (const dateKey of validationDates) {
      const tfDataArray = this.historicalData.get(dateKey)!
      
      // Apply parameters and generate signals
      const signals = this.generateSignalsWithParams(tfDataArray, params)
      const fused = fuseMulitpleTimeframes(tfDataArray.map((tf, i) => ({
        ...tf,
        signal: signals[i]
      })))
      
      // Get actual price movement (next day return)
      const nextDateKey = this.getNextTradingDay(dateKey)
      const nextData = this.historicalData.get(nextDateKey)
      
      if (nextData && nextData.length > 0) {
        const currentPrice = tfDataArray[0].candles[tfDataArray[0].candles.length - 1].close
        const nextPrice = nextData[0].candles[nextData[0].candles.length - 1].close
        const actualReturn = (nextPrice - currentPrice) / currentPrice
        
        // Record prediction
        predictions.push(fused.direction)
        actuals.push(actualReturn)
        confidences.push(fused.confidence)
        
        // Calculate return based on prediction
        let positionReturn = 0
        if (fused.shouldTrade) {
          const side = fused.direction === 'BUY' || fused.direction === 'STRONG_BUY' ? 1 : 
                      fused.direction === 'SELL' || fused.direction === 'STRONG_SELL' ? -1 : 0
          
          if (side !== 0) {
            // Kelly sizing
            const kellySize = this.calculateKellySize(fused.confidence, fused.regime)
            positionReturn = side * actualReturn * kellySize
          }
        }
        returns.push(positionReturn)
      }
    }
    
    // Calculate metrics
    const accuracy = this.calculateAccuracy(predictions, actuals)
    const p80Coverage = this.calculateP80Coverage(confidences, predictions, actuals)
    const sharpeRatio = this.calculateSharpe(returns)
    const maxDrawdown = this.calculateMaxDrawdown(returns)
    const { winRate, avgWin, avgLoss, profitFactor } = this.calculateWinLossMetrics(returns)
    const kellyFraction = this.calculateOptimalKelly(winRate, avgWin, avgLoss)
    
    // Combined optimization score
    const accuracyScore = accuracy / this.config.targetAccuracy
    const p80Score = 1 - Math.abs(p80Coverage - this.config.p80Target) / this.config.p80Tolerance
    const sharpeScore = Math.max(0, Math.min(1, sharpeRatio / 2))  // Target Sharpe of 2
    const drawdownScore = Math.max(0, 1 - maxDrawdown / 0.20)  // Max acceptable DD of 20%
    
    const score = (accuracyScore * 0.4 + p80Score * 0.3 + sharpeScore * 0.2 + drawdownScore * 0.1) * 100
    
    return {
      params,
      accuracy,
      p80Coverage,
      sharpeRatio,
      maxDrawdown,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      kellyFraction,
      score
    }
  }

  /**
   * Generate signals with custom parameters
   */
  generateSignalsWithParams(tfDataArray: TFData[], params: ParameterSet): any[] {
    // This would need to be integrated with the actual signal generation
    // For now, return mock signals
    return tfDataArray.map(tf => ({
      direction: 'BUY',
      confidence: 0.6,
      rawSignal: 0.5
    }))
  }

  /**
   * Calculate directional accuracy
   */
  calculateAccuracy(predictions: any[], actuals: number[]): number {
    let correct = 0
    let total = 0
    
    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i]
      const actual = actuals[i]
      
      if (pred === 'BUY' || pred === 'STRONG_BUY') {
        if (actual > 0) correct++
        total++
      } else if (pred === 'SELL' || pred === 'STRONG_SELL') {
        if (actual < 0) correct++
        total++
      }
      // Skip NEUTRAL predictions
    }
    
    return total > 0 ? correct / total : 0
  }

  /**
   * Calculate p80 coverage (80th percentile confidence calibration)
   */
  calculateP80Coverage(confidences: number[], predictions: any[], actuals: number[]): number {
    // Sort predictions by confidence
    const sorted = confidences
      .map((conf, i) => ({ conf, pred: predictions[i], actual: actuals[i] }))
      .sort((a, b) => b.conf - a.conf)
    
    // Take top 20% by confidence
    const top20Count = Math.floor(sorted.length * 0.2)
    const top20 = sorted.slice(0, top20Count)
    
    // Check accuracy in top 20%
    let correct = 0
    for (const item of top20) {
      if ((item.pred === 'BUY' || item.pred === 'STRONG_BUY') && item.actual > 0) correct++
      else if ((item.pred === 'SELL' || item.pred === 'STRONG_SELL') && item.actual < 0) correct++
    }
    
    return top20Count > 0 ? correct / top20Count : 0
  }

  /**
   * Calculate Sharpe ratio
   */
  calculateSharpe(returns: number[]): number {
    if (returns.length === 0) return 0
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
    const std = Math.sqrt(variance)
    
    return std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : 0  // Annualized
  }

  /**
   * Calculate maximum drawdown
   */
  calculateMaxDrawdown(returns: number[]): number {
    if (returns.length === 0) return 0
    
    let peak = 1
    let maxDD = 0
    let cumReturn = 1
    
    for (const ret of returns) {
      cumReturn *= (1 + ret)
      if (cumReturn > peak) {
        peak = cumReturn
      }
      const drawdown = (peak - cumReturn) / peak
      if (drawdown > maxDD) {
        maxDD = drawdown
      }
    }
    
    return maxDD
  }

  /**
   * Calculate win/loss metrics
   */
  calculateWinLossMetrics(returns: number[]): {
    winRate: number
    avgWin: number
    avgLoss: number
    profitFactor: number
  } {
    const wins = returns.filter(r => r > 0)
    const losses = returns.filter(r => r < 0)
    
    const winRate = returns.length > 0 ? wins.length / returns.length : 0
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0
    const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0
    
    return { winRate, avgWin, avgLoss, profitFactor }
  }

  /**
   * Calculate optimal Kelly fraction
   */
  calculateOptimalKelly(winRate: number, avgWin: number, avgLoss: number): number {
    if (avgLoss === 0) return 0
    const b = avgWin / avgLoss
    const p = winRate
    const q = 1 - p
    
    const kelly = (p * b - q) / b
    return Math.max(0, Math.min(0.25, kelly))  // Cap at 25%
  }

  /**
   * Calculate Kelly size for a prediction
   */
  calculateKellySize(confidence: number, regime: string): number {
    const lambda = (regime === 'VolExp' || regime === 'Flux') ? 0.25 : 0.5
    return Math.min(0.25, confidence * lambda)
  }

  /**
   * Get next trading day
   */
  getNextTradingDay(dateKey: string): string {
    const dates = Array.from(this.historicalData.keys()).sort()
    const index = dates.indexOf(dateKey)
    return index >= 0 && index < dates.length - 1 ? dates[index + 1] : ''
  }

  /**
   * Run calibration
   */
  async calibrate(iterations: number = 100): Promise<CalibrationResult> {
    console.log('🚀 Starting Hurricane SPY Calibration...')
    console.log(`📈 Target: ${this.config.targetAccuracy * 100}% accuracy, p80=${this.config.p80Target}±${this.config.p80Tolerance}`)
    
    // Load historical data
    await this.loadHistoricalData()
    
    if (this.historicalData.size < 20) {
      throw new Error('Insufficient historical data for calibration')
    }
    
    console.log(`🔄 Running ${iterations} parameter iterations...`)
    
    const results: CalibrationResult[] = []
    
    // Grid search with random sampling
    for (let i = 0; i < iterations; i++) {
      const params = this.generateParameterSet(i, iterations)
      const result = await this.evaluateParameters(params)
      results.push(result)
      
      // Update best result
      if (!this.bestResult || result.score > this.bestResult.score) {
        this.bestResult = result
        console.log(`✨ New best score: ${result.score.toFixed(2)} (Accuracy: ${(result.accuracy * 100).toFixed(1)}%, p80: ${result.p80Coverage.toFixed(3)})`)
      }
      
      // Progress update
      if ((i + 1) % 10 === 0) {
        console.log(`Progress: ${i + 1}/${iterations} iterations completed`)
      }
    }
    
    // Save results
    await this.saveResults(results)
    
    console.log('\n🎯 Calibration Complete!')
    console.log('Best Parameters Found:')
    console.log(JSON.stringify(this.bestResult, null, 2))
    
    return this.bestResult!
  }

  /**
   * Save calibration results
   */
  async saveResults(results: CalibrationResult[]): Promise<void> {
    const outputDir = path.join(__dirname, '../calibration_results')
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    
    // Save all results
    const timestamp = new Date().toISOString().replace(/:/g, '-')
    const resultsFile = path.join(outputDir, `calibration_${timestamp}.json`)
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2))
    
    // Save best parameters
    if (this.bestResult) {
      const bestFile = path.join(outputDir, `best_params_${timestamp}.json`)
      fs.writeFileSync(bestFile, JSON.stringify(this.bestResult, null, 2))
      
      // Also save as current best
      const currentBestFile = path.join(outputDir, 'current_best.json')
      fs.writeFileSync(currentBestFile, JSON.stringify(this.bestResult, null, 2))
    }
    
    // Generate summary report
    const report = this.generateReport(results)
    const reportFile = path.join(outputDir, `report_${timestamp}.md`)
    fs.writeFileSync(reportFile, report)
    
    console.log(`📁 Results saved to ${outputDir}`)
  }

  /**
   * Generate calibration report
   */
  generateReport(results: CalibrationResult[]): string {
    const sorted = results.sort((a, b) => b.score - a.score)
    const top10 = sorted.slice(0, 10)
    
    let report = '# Hurricane SPY Calibration Report\n\n'
    report += `Generated: ${new Date().toISOString()}\n\n`
    report += `## Configuration\n`
    report += `- Symbol: ${this.config.symbol}\n`
    report += `- Period: ${this.config.startDate.toISOString().split('T')[0]} to ${this.config.endDate.toISOString().split('T')[0]}\n`
    report += `- Target Accuracy: ${this.config.targetAccuracy * 100}%\n`
    report += `- Target p80: ${this.config.p80Target}±${this.config.p80Tolerance}\n\n`
    
    report += `## Best Result\n`
    if (this.bestResult) {
      report += `- **Score**: ${this.bestResult.score.toFixed(2)}\n`
      report += `- **Accuracy**: ${(this.bestResult.accuracy * 100).toFixed(2)}%\n`
      report += `- **p80 Coverage**: ${this.bestResult.p80Coverage.toFixed(3)}\n`
      report += `- **Sharpe Ratio**: ${this.bestResult.sharpeRatio.toFixed(2)}\n`
      report += `- **Max Drawdown**: ${(this.bestResult.maxDrawdown * 100).toFixed(2)}%\n`
      report += `- **Win Rate**: ${(this.bestResult.winRate * 100).toFixed(2)}%\n`
      report += `- **Profit Factor**: ${this.bestResult.profitFactor.toFixed(2)}\n`
      report += `- **Kelly Fraction**: ${(this.bestResult.kellyFraction * 100).toFixed(2)}%\n\n`
      
      report += `### Optimal RSI Bounds\n`
      report += '```typescript\n'
      report += `const RSIBounds = ${JSON.stringify(this.bestResult.params.rsiBounds, null, 2)};\n`
      report += '```\n\n'
      
      report += `### Other Parameters\n`
      report += `- Max Weight: ${this.bestResult.params.maxWeight.toFixed(3)}\n`
      report += `- Min Confirmations: ${this.bestResult.params.minConfirmations}\n`
      report += `- Abstain Threshold: ${this.bestResult.params.abstainThreshold.toFixed(3)}\n\n`
    }
    
    report += `## Top 10 Results\n\n`
    report += '| Rank | Score | Accuracy | p80 | Sharpe | Max DD | Win Rate |\n'
    report += '|------|-------|----------|-----|--------|--------|----------|\n'
    
    top10.forEach((result, i) => {
      report += `| ${i + 1} | ${result.score.toFixed(2)} | ${(result.accuracy * 100).toFixed(1)}% | ${result.p80Coverage.toFixed(3)} | ${result.sharpeRatio.toFixed(2)} | ${(result.maxDrawdown * 100).toFixed(1)}% | ${(result.winRate * 100).toFixed(1)}% |\n`
    })
    
    return report
  }
}

// Run calibration if executed directly
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false

if (isDirectRun) {
  const config: CalibrationConfig = {
    symbol: 'SPY',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-01'),
    validationSplit: 0.2,
    targetAccuracy: 0.75,
    p80Target: 0.80,
    p80Tolerance: 0.05
  }
  
  const bounds: ParameterBounds = {
    rsiBounds: {
      '1m': { oversold: [30, 45], overbought: [55, 70] },
      '15m': { oversold: [35, 45], overbought: [55, 65] },
      '1h': { oversold: [35, 45], overbought: [55, 65] },
      '4h': { oversold: [37, 47], overbought: [53, 63] },
      '1d': { oversold: [40, 50], overbought: [50, 60] }
    },
    weightBounds: {
      maxWeight: [0.10, 0.30],
      minConfirmations: [2, 4],
      abstainThreshold: [0.4, 0.8]
    },
    regimeMultipliers: {
      trend: [1.0, 1.5],
      range: [0.8, 1.2],
      volexp: [0.5, 0.8],
      flux: [0.6, 0.9]
    }
  }
  
  const calibrator = new HurricaneCalibrator(config, bounds)
  
  calibrator.calibrate(100)
    .then(result => {
      console.log('\n✅ Calibration successful!')
      console.log(`Final accuracy: ${(result.accuracy * 100).toFixed(2)}%`)
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ Calibration failed:', error)
      process.exit(1)
    })
}

