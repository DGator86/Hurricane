/**
 * Comprehensive Testing Harness for Hurricane SPY Predictions
 * Validates the complete prediction pipeline with real market data
 */

import { loadTF, TF_SPEC, TFData, TF } from '../src/services/TimeframeDataLoader'
import { fuseSignals, fuseMulitpleTimeframes } from '../src/services/SignalFusion'
import { healthChecker } from '../src/services/HealthChecks'
import { confidenceScorer, EnhancedConfidence } from '../src/services/ConfidenceScoring'
import { YahooFinanceAPI } from '../src/services/YahooFinanceAPI'
import { PolygonAPI } from '../src/services/PolygonAPI'
import * as fs from 'fs'
import * as path from 'path'

interface TestResult {
  timestamp: Date
  symbol: string
  predictions: {
    [tf: string]: {
      direction: string
      confidence: number
      kellyFraction: number
      regime: string
      targets: {
        target: number
        stop: number
      }
      rMultiple: number
    }
  }
  final: {
    direction: string
    confidence: number
    kellyFraction: number
    shouldTrade: boolean
  }
  health: {
    overall: boolean
    summary: string
    issues: string[]
  }
  actual?: {
    price: number
    return: number
    outcome: 'WIN' | 'LOSS' | 'NEUTRAL'
  }
}

interface TestMetrics {
  totalPredictions: number
  tradedPositions: number
  accuracy: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  sharpeRatio: number
  maxDrawdown: number
  kellyEfficiency: number
  p80Coverage: number
  regimeAccuracy: Record<string, number>
  timeframeAccuracy: Record<string, number>
}

export class HurricaneTestHarness {
  private yahooAPI: YahooFinanceAPI
  private polygonAPI: PolygonAPI
  private results: TestResult[] = []
  private metrics: TestMetrics = {
    totalPredictions: 0,
    tradedPositions: 0,
    accuracy: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    kellyEfficiency: 0,
    p80Coverage: 0,
    regimeAccuracy: {},
    timeframeAccuracy: {}
  }

  // Optimized parameters from calibration
  private optimizedParams = {
    rsiBounds: {
      "1m": [38, 62],
      "15m": [40, 60],
      "1h": [40, 60],
      "4h": [42, 58],
      "1d": [45, 55]
    },
    maxWeight: 0.20,
    minConfirmations: 3,
    abstainThreshold: 0.6
  }

  constructor() {
    this.yahooAPI = new YahooFinanceAPI()
    this.polygonAPI = new PolygonAPI(process.env.POLYGON_API_KEY || '')
  }

  /**
   * Run complete test suite
   */
  async runTest(
    symbol: string,
    startDate: Date,
    endDate: Date,
    realtime: boolean = false
  ): Promise<TestMetrics> {
    console.log('🚀 Starting Hurricane SPY Test Harness')
    console.log(`📊 Symbol: ${symbol}`)
    console.log(`📅 Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
    console.log(`⚡ Mode: ${realtime ? 'Real-time' : 'Backtest'}`)
    
    if (realtime) {
      return await this.runRealtimeTest(symbol)
    } else {
      return await this.runBacktest(symbol, startDate, endDate)
    }
  }

  /**
   * Run backtest on historical data
   */
  async runBacktest(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<TestMetrics> {
    const timeframes: TF[] = ['1m', '15m', '1h', '4h', '1d']
    const dayMs = 24 * 60 * 60 * 1000
    
    console.log('\n📈 Running backtest...')
    
    // Process each trading day
    for (let dateMs = startDate.getTime(); dateMs < endDate.getTime(); dateMs += dayMs) {
      const testDate = new Date(dateMs)
      
      // Skip weekends
      if (testDate.getDay() === 0 || testDate.getDay() === 6) continue
      
      try {
        const result = await this.testSingleDay(symbol, testDate, timeframes)
        this.results.push(result)
        
        // Get next day's actual price for outcome
        const nextDate = new Date(dateMs + dayMs)
        const actualOutcome = await this.getActualOutcome(symbol, testDate, nextDate)
        result.actual = actualOutcome
        
        // Update confidence scorer with outcome
        if (actualOutcome && result.final.shouldTrade) {
          const magnitude = Math.abs(actualOutcome.return)
          confidenceScorer.updateHistory(
            {} as TFData,  // Would need actual TF data
            actualOutcome.outcome,
            magnitude
          )
        }
        
        // Progress update
        if (this.results.length % 10 === 0) {
          console.log(`Processed ${this.results.length} predictions...`)
          this.printIntermediateMetrics()
        }
      } catch (error) {
        console.warn(`⚠️ Failed to test ${testDate.toISOString()}: ${error}`)
      }
    }
    
    // Calculate final metrics
    this.calculateMetrics()
    
    // Save results
    await this.saveResults()
    
    return this.metrics
  }

  /**
   * Run real-time test
   */
  async runRealtimeTest(symbol: string): Promise<TestMetrics> {
    console.log('\n🔴 Running real-time test...')
    
    const timeframes: TF[] = ['1m', '15m', '1h', '4h', '1d']
    const testDate = new Date()
    
    const result = await this.testSingleDay(symbol, testDate, timeframes)
    this.results.push(result)
    
    // Print detailed results
    this.printDetailedResult(result)
    
    return this.metrics
  }

  /**
   * Test single day prediction
   */
  async testSingleDay(
    symbol: string,
    date: Date,
    timeframes: TF[]
  ): Promise<TestResult> {
    const predictions: TestResult['predictions'] = {}
    const tfDataArray: TFData[] = []
    
    // Load data for each timeframe
    for (const tf of timeframes) {
      try {
        const tfData = await this.loadTimeframeData(symbol, tf, date)
        tfDataArray.push(tfData)
        
        // Generate signals
        const fusedSignal = fuseSignals(tfData)
        
        // Calculate enhanced confidence
        const confidence = confidenceScorer.calculateConfidence(
          tfData,
          fusedSignal
        )
        
        // Calculate targets (simplified for now)
        const currentPrice = tfData.candles[tfData.candles.length - 1].close
        const atr = tfData.indicators.atr
        const multiplier = this.getATRMultiplier(tf)
        
        predictions[tf] = {
          direction: fusedSignal.direction,
          confidence: confidence.calibrated,
          kellyFraction: confidence.kellyFraction,
          regime: tfData.regime,
          targets: {
            target: currentPrice + (fusedSignal.rawSignal > 0 ? 1 : -1) * atr * multiplier,
            stop: currentPrice - (fusedSignal.rawSignal > 0 ? 1 : -1) * atr
          },
          rMultiple: multiplier
        }
      } catch (error) {
        console.warn(`⚠️ Failed to load ${tf} data: ${error}`)
      }
    }
    
    // Multi-timeframe fusion
    const mtfSignals = tfDataArray.map(tf => fuseSignals(tf))
    const finalSignal = fuseMulitpleTimeframes(tfDataArray)
    
    // Calculate final confidence
    const finalConfidence = confidenceScorer.calculateConfidence(
      tfDataArray[0],  // Use shortest timeframe as reference
      finalSignal,
      mtfSignals
    )
    
    // Run health checks
    const healthResult = healthChecker.runFullHealthCheck(predictions)
    
    // Determine if we should trade
    const shouldTrade = finalSignal.shouldTrade && 
                       healthResult.overall && 
                       finalConfidence.calibrated > 0.55
    
    return {
      timestamp: date,
      symbol,
      predictions,
      final: {
        direction: finalSignal.direction,
        confidence: finalConfidence.calibrated,
        kellyFraction: finalConfidence.kellyFraction,
        shouldTrade
      },
      health: {
        overall: healthResult.overall,
        summary: healthResult.summary,
        issues: healthResult.checks
          .filter(c => c.severity === 'critical' || c.severity === 'warning')
          .map(c => c.message)
      }
    }
  }

  /**
   * Load timeframe data with fallback
   */
  async loadTimeframeData(symbol: string, tf: TF, date: Date): Promise<TFData> {
    const dataFetcher = async (sym: string, timeframe: TF, lookback: number) => {
      try {
        return await this.yahooAPI.fetchOHLCV(sym, timeframe, lookback, date)
      } catch (error) {
        return await this.polygonAPI.fetchOHLCV(sym, timeframe, lookback, date)
      }
    }
    
    return await loadTF(symbol, tf, date, dataFetcher)
  }

  /**
   * Get ATR multiplier for timeframe
   */
  getATRMultiplier(tf: TF): number {
    const multipliers: Record<TF, number> = {
      '1m': 1.5,
      '5m': 2.0,
      '15m': 2.5,
      '1h': 3.0,
      '4h': 4.0,
      '1d': 5.0
    }
    return multipliers[tf] || 2.0
  }

  /**
   * Get actual price outcome
   */
  async getActualOutcome(
    symbol: string,
    predictionDate: Date,
    outcomeDate: Date
  ): Promise<TestResult['actual']> {
    try {
      // Get closing prices
      const predData = await this.loadTimeframeData(symbol, '1d', predictionDate)
      const outcomeData = await this.loadTimeframeData(symbol, '1d', outcomeDate)
      
      const predPrice = predData.candles[predData.candles.length - 1].close
      const outcomePrice = outcomeData.candles[outcomeData.candles.length - 1].close
      const returnPct = (outcomePrice - predPrice) / predPrice
      
      // Determine outcome based on 0.5% threshold
      let outcome: 'WIN' | 'LOSS' | 'NEUTRAL'
      if (Math.abs(returnPct) < 0.005) {
        outcome = 'NEUTRAL'
      } else if (returnPct > 0) {
        outcome = 'WIN'
      } else {
        outcome = 'LOSS'
      }
      
      return {
        price: outcomePrice,
        return: returnPct,
        outcome
      }
    } catch (error) {
      console.warn(`Failed to get actual outcome: ${error}`)
      return undefined
    }
  }

  /**
   * Calculate comprehensive metrics
   */
  calculateMetrics(): void {
    const tradedResults = this.results.filter(r => r.final.shouldTrade && r.actual)
    
    if (tradedResults.length === 0) {
      console.warn('⚠️ No traded positions to calculate metrics')
      return
    }
    
    // Accuracy metrics
    let correct = 0
    let wins = 0
    let losses = 0
    let totalWin = 0
    let totalLoss = 0
    const returns: number[] = []
    const regimeStats: Record<string, { correct: number; total: number }> = {}
    const tfStats: Record<string, { correct: number; total: number }> = {}
    
    for (const result of tradedResults) {
      const predicted = result.final.direction
      const actual = result.actual!
      
      // Check directional accuracy
      const predBullish = predicted === 'BUY' || predicted === 'STRONG_BUY'
      const predBearish = predicted === 'SELL' || predicted === 'STRONG_SELL'
      const actualBullish = actual.return > 0
      const actualBearish = actual.return < 0
      
      if ((predBullish && actualBullish) || (predBearish && actualBearish)) {
        correct++
      }
      
      // Calculate returns with Kelly sizing
      const side = predBullish ? 1 : predBearish ? -1 : 0
      const kellyReturn = side * actual.return * result.final.kellyFraction
      returns.push(kellyReturn)
      
      if (kellyReturn > 0) {
        wins++
        totalWin += kellyReturn
      } else if (kellyReturn < 0) {
        losses++
        totalLoss += Math.abs(kellyReturn)
      }
      
      // Track regime accuracy
      for (const [tf, pred] of Object.entries(result.predictions)) {
        const regime = pred.regime
        if (!regimeStats[regime]) {
          regimeStats[regime] = { correct: 0, total: 0 }
        }
        regimeStats[regime].total++
        
        const tfPredBullish = pred.direction === 'BUY' || pred.direction === 'STRONG_BUY'
        const tfPredBearish = pred.direction === 'SELL' || pred.direction === 'STRONG_SELL'
        
        if ((tfPredBullish && actualBullish) || (tfPredBearish && actualBearish)) {
          regimeStats[regime].correct++
        }
        
        // Track timeframe accuracy
        if (!tfStats[tf]) {
          tfStats[tf] = { correct: 0, total: 0 }
        }
        tfStats[tf].total++
        
        if ((tfPredBullish && actualBullish) || (tfPredBearish && actualBearish)) {
          tfStats[tf].correct++
        }
      }
    }
    
    // Calculate final metrics
    this.metrics = {
      totalPredictions: this.results.length,
      tradedPositions: tradedResults.length,
      accuracy: correct / tradedResults.length,
      winRate: wins / tradedResults.length,
      avgWin: wins > 0 ? totalWin / wins : 0,
      avgLoss: losses > 0 ? totalLoss / losses : 0,
      profitFactor: totalLoss > 0 ? totalWin / totalLoss : 0,
      sharpeRatio: this.calculateSharpe(returns),
      maxDrawdown: this.calculateMaxDrawdown(returns),
      kellyEfficiency: this.calculateKellyEfficiency(tradedResults),
      p80Coverage: this.calculateP80Coverage(tradedResults),
      regimeAccuracy: Object.entries(regimeStats).reduce((acc, [regime, stats]) => {
        acc[regime] = stats.total > 0 ? stats.correct / stats.total : 0
        return acc
      }, {} as Record<string, number>),
      timeframeAccuracy: Object.entries(tfStats).reduce((acc, [tf, stats]) => {
        acc[tf] = stats.total > 0 ? stats.correct / stats.total : 0
        return acc
      }, {} as Record<string, number>)
    }
  }

  /**
   * Calculate Sharpe ratio
   */
  calculateSharpe(returns: number[]): number {
    if (returns.length === 0) return 0
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
    const std = Math.sqrt(variance)
    
    return std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : 0
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
   * Calculate Kelly efficiency
   */
  calculateKellyEfficiency(results: TestResult[]): number {
    // Compare actual Kelly fractions to optimal
    const efficiencies: number[] = []
    
    for (const result of results) {
      if (result.actual) {
        const optimalKelly = this.calculateOptimalKellyEx(
          result.final.confidence,
          result.actual.return
        )
        const actualKelly = result.final.kellyFraction
        
        const efficiency = 1 - Math.abs(optimalKelly - actualKelly) / Math.max(optimalKelly, 0.01)
        efficiencies.push(Math.max(0, efficiency))
      }
    }
    
    return efficiencies.length > 0
      ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
      : 0
  }

  /**
   * Calculate optimal Kelly ex-post
   */
  calculateOptimalKellyEx(confidence: number, actualReturn: number): number {
    const p = confidence
    const b = Math.abs(actualReturn) * 100
    const kelly = ((p * (1 + b)) - 1) / b
    return Math.max(0, Math.min(0.25, kelly))
  }

  /**
   * Calculate P80 coverage
   */
  calculateP80Coverage(results: TestResult[]): number {
    // Sort by confidence
    const sorted = results
      .filter(r => r.actual)
      .sort((a, b) => b.final.confidence - a.final.confidence)
    
    // Take top 20%
    const top20Count = Math.floor(sorted.length * 0.2)
    const top20 = sorted.slice(0, top20Count)
    
    // Check accuracy in top 20%
    let correct = 0
    for (const result of top20) {
      const predicted = result.final.direction
      const actual = result.actual!
      
      const predBullish = predicted === 'BUY' || predicted === 'STRONG_BUY'
      const predBearish = predicted === 'SELL' || predicted === 'STRONG_SELL'
      
      if ((predBullish && actual.return > 0) || (predBearish && actual.return < 0)) {
        correct++
      }
    }
    
    return top20Count > 0 ? correct / top20Count : 0
  }

  /**
   * Print intermediate metrics
   */
  printIntermediateMetrics(): void {
    const tempMetrics = { ...this.metrics }
    this.calculateMetrics()
    
    console.log('\n📊 Intermediate Metrics:')
    console.log(`Accuracy: ${(this.metrics.accuracy * 100).toFixed(1)}%`)
    console.log(`Win Rate: ${(this.metrics.winRate * 100).toFixed(1)}%`)
    console.log(`Sharpe: ${this.metrics.sharpeRatio.toFixed(2)}`)
    
    this.metrics = tempMetrics  // Restore
  }

  /**
   * Print detailed result
   */
  printDetailedResult(result: TestResult): void {
    console.log('\n' + '='.repeat(80))
    console.log(`📅 ${result.timestamp.toISOString()}`)
    console.log(`📈 ${result.symbol}`)
    console.log('='.repeat(80))
    
    // Health status
    console.log('\n🏥 Health Check:')
    console.log(`Status: ${result.health.overall ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`Summary: ${result.health.summary}`)
    if (result.health.issues.length > 0) {
      console.log('Issues:')
      result.health.issues.forEach(issue => console.log(`  - ${issue}`))
    }
    
    // Predictions by timeframe
    console.log('\n📊 Predictions by Timeframe:')
    console.log('TF    | Direction    | Confidence | Kelly | Regime    | Target    | Stop')
    console.log('------|-------------|------------|-------|-----------|-----------|----------')
    
    for (const [tf, pred] of Object.entries(result.predictions)) {
      console.log(
        `${tf.padEnd(5)} | ` +
        `${pred.direction.padEnd(11)} | ` +
        `${(pred.confidence * 100).toFixed(1).padStart(9)}% | ` +
        `${(pred.kellyFraction * 100).toFixed(1).padStart(5)}% | ` +
        `${pred.regime.padEnd(9)} | ` +
        `$${pred.targets.target.toFixed(2).padStart(8)} | ` +
        `$${pred.targets.stop.toFixed(2)}`
      )
    }
    
    // Final decision
    console.log('\n🎯 Final Decision:')
    console.log(`Direction: ${result.final.direction}`)
    console.log(`Confidence: ${(result.final.confidence * 100).toFixed(1)}%`)
    console.log(`Kelly Fraction: ${(result.final.kellyFraction * 100).toFixed(1)}%`)
    console.log(`Should Trade: ${result.final.shouldTrade ? '✅ YES' : '❌ NO'}`)
    
    // Actual outcome (if available)
    if (result.actual) {
      console.log('\n📈 Actual Outcome:')
      console.log(`Price: $${result.actual.price.toFixed(2)}`)
      console.log(`Return: ${(result.actual.return * 100).toFixed(2)}%`)
      console.log(`Result: ${result.actual.outcome}`)
    }
    
    console.log('\n' + '='.repeat(80))
  }

  /**
   * Save test results
   */
  async saveResults(): Promise<void> {
    const outputDir = path.join(__dirname, '../test_results')
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-')
    
    // Save detailed results
    const resultsFile = path.join(outputDir, `results_${timestamp}.json`)
    fs.writeFileSync(resultsFile, JSON.stringify(this.results, null, 2))
    
    // Save metrics
    const metricsFile = path.join(outputDir, `metrics_${timestamp}.json`)
    fs.writeFileSync(metricsFile, JSON.stringify(this.metrics, null, 2))
    
    // Generate report
    const report = this.generateReport()
    const reportFile = path.join(outputDir, `report_${timestamp}.md`)
    fs.writeFileSync(reportFile, report)
    
    console.log(`\n📁 Results saved to ${outputDir}`)
  }

  /**
   * Generate test report
   */
  generateReport(): string {
    let report = '# Hurricane SPY Test Report\n\n'
    report += `Generated: ${new Date().toISOString()}\n\n`
    
    report += '## Overall Performance\n'
    report += `- **Total Predictions**: ${this.metrics.totalPredictions}\n`
    report += `- **Traded Positions**: ${this.metrics.tradedPositions}\n`
    report += `- **Accuracy**: ${(this.metrics.accuracy * 100).toFixed(2)}%\n`
    report += `- **Win Rate**: ${(this.metrics.winRate * 100).toFixed(2)}%\n`
    report += `- **Average Win**: ${(this.metrics.avgWin * 100).toFixed(2)}%\n`
    report += `- **Average Loss**: ${(this.metrics.avgLoss * 100).toFixed(2)}%\n`
    report += `- **Profit Factor**: ${this.metrics.profitFactor.toFixed(2)}\n`
    report += `- **Sharpe Ratio**: ${this.metrics.sharpeRatio.toFixed(2)}\n`
    report += `- **Max Drawdown**: ${(this.metrics.maxDrawdown * 100).toFixed(2)}%\n`
    report += `- **Kelly Efficiency**: ${(this.metrics.kellyEfficiency * 100).toFixed(2)}%\n`
    report += `- **P80 Coverage**: ${(this.metrics.p80Coverage * 100).toFixed(2)}%\n\n`
    
    report += '## Regime Accuracy\n'
    for (const [regime, accuracy] of Object.entries(this.metrics.regimeAccuracy)) {
      report += `- **${regime}**: ${(accuracy * 100).toFixed(2)}%\n`
    }
    
    report += '\n## Timeframe Accuracy\n'
    for (const [tf, accuracy] of Object.entries(this.metrics.timeframeAccuracy)) {
      report += `- **${tf}**: ${(accuracy * 100).toFixed(2)}%\n`
    }
    
    return report
  }
}

// Run test if executed directly
if (require.main === module) {
  const harness = new HurricaneTestHarness()
  
  const args = process.argv.slice(2)
  const mode = args[0] || 'backtest'
  
  if (mode === 'realtime') {
    // Real-time test
    harness.runTest('SPY', new Date(), new Date(), true)
      .then(metrics => {
        console.log('\n✅ Test complete!')
        console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`)
      })
      .catch(error => {
        console.error('❌ Test failed:', error)
        process.exit(1)
      })
  } else {
    // Backtest
    const startDate = new Date('2024-10-01')
    const endDate = new Date('2024-12-01')
    
    harness.runTest('SPY', startDate, endDate, false)
      .then(metrics => {
        console.log('\n✅ Backtest complete!')
        console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`)
        console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`)
        
        // Check if we hit the target
        if (metrics.accuracy >= 0.75) {
          console.log('🎉 TARGET ACHIEVED: 75% accuracy!')
        } else {
          console.log(`📈 Need ${((0.75 - metrics.accuracy) * 100).toFixed(1)}% more to reach target`)
        }
      })
      .catch(error => {
        console.error('❌ Backtest failed:', error)
        process.exit(1)
      })
  }
}

export { HurricaneTestHarness, TestResult, TestMetrics }