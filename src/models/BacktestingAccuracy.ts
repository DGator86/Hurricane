// Backtesting Accuracy Tracking System

export interface PredictionRecord {
  id: string
  timestamp: Date
  timeframe: string
  prediction: {
    direction: 'bullish' | 'bearish' | 'neutral'
    expectedReturn: number
    confidence: number
    entryPrice: number
    targetPrice: number
    stopLoss: number
  }
  actual?: {
    exitPrice: number
    actualReturn: number
    hitTarget: boolean
    hitStopLoss: boolean
    maxMove: number
    minMove: number
  }
  accuracy?: {
    directionCorrect: boolean
    targetHit: boolean
    stopLossHit: boolean
    profitLoss: number
  }
}

export interface AccuracyMetrics {
  timeframe: string
  lookbackPeriod: string  // e.g., "15m", "30m", "1h", "4h", "1d"
  totalPredictions: number
  correctDirections: number
  directionAccuracy: number  // percentage
  targetsHit: number
  targetHitRate: number  // percentage
  stopLossesHit: number
  stopLossRate: number  // percentage
  averageReturn: number
  winRate: number
  profitFactor: number  // gross profit / gross loss
  sharpeRatio: number
  maxDrawdown: number
  currentStreak: number  // positive for winning streak, negative for losing
  bestStreak: number
  worstStreak: number
}

export interface BacktestSummary {
  period: string  // e.g., "30 days"
  startDate: Date
  endDate: Date
  metrics: {
    '15m': AccuracyMetrics
    '30m': AccuracyMetrics
    '1h': AccuracyMetrics
    '4h': AccuracyMetrics
    '1d': AccuracyMetrics
  }
  overallStats: {
    totalPredictions: number
    totalWins: number
    totalLosses: number
    winRate: number
    averageWin: number
    averageLoss: number
    profitFactor: number
    totalReturn: number
    sharpeRatio: number
    calmarRatio: number
    maxDrawdown: number
    recoveryTime: number  // days to recover from max drawdown
  }
  bestPerformers: {
    timeframe: string
    metric: string
    value: number
  }[]
  worstPerformers: {
    timeframe: string
    metric: string
    value: number
  }[]
}

export class BacktestingAccuracy {
  private predictions: Map<string, PredictionRecord[]> = new Map()
  private readonly maxHistoryDays = 30
  
  constructor() {
    // Initialize storage for each lookback period
    const periods = ['15m', '30m', '1h', '4h', '1d']
    periods.forEach(period => {
      this.predictions.set(period, [])
    })
  }

  /**
   * Record a new prediction
   */
  recordPrediction(
    timeframe: string,
    prediction: PredictionRecord['prediction']
  ): string {
    const id = `${timeframe}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const record: PredictionRecord = {
      id,
      timestamp: new Date(),
      timeframe,
      prediction,
    }
    
    // Add to appropriate storage
    const storage = this.predictions.get(timeframe) || []
    storage.push(record)
    
    // Clean up old records
    this.cleanOldRecords(timeframe)
    
    this.predictions.set(timeframe, storage)
    return id
  }

  /**
   * Update prediction with actual results
   */
  updatePredictionResult(
    id: string,
    actual: PredictionRecord['actual']
  ): void {
    // Find and update the prediction across all timeframes
    for (const [timeframe, records] of this.predictions) {
      const index = records.findIndex(r => r.id === id)
      if (index !== -1) {
        const record = records[index]
        record.actual = actual
        
        // Calculate accuracy metrics
        record.accuracy = this.calculateAccuracy(record.prediction, actual)
        
        records[index] = record
        this.predictions.set(timeframe, records)
        break
      }
    }
  }

  /**
   * Get accuracy metrics for a specific lookback period
   */
  getAccuracyMetrics(lookbackPeriod: string): AccuracyMetrics | null {
    const records = this.predictions.get(lookbackPeriod)
    if (!records || records.length === 0) {
      return null
    }
    
    // Filter completed predictions
    const completed = records.filter(r => r.actual && r.accuracy)
    if (completed.length === 0) {
      return this.createEmptyMetrics(lookbackPeriod)
    }
    
    // Calculate metrics
    const correctDirections = completed.filter(r => r.accuracy!.directionCorrect).length
    const targetsHit = completed.filter(r => r.accuracy!.targetHit).length
    const stopLossesHit = completed.filter(r => r.accuracy!.stopLossHit).length
    const profits = completed.map(r => r.accuracy!.profitLoss)
    const wins = profits.filter(p => p > 0)
    const losses = profits.filter(p => p < 0)
    
    // Calculate streaks
    const { currentStreak, bestStreak, worstStreak } = this.calculateStreaks(completed)
    
    // Calculate drawdown
    const { maxDrawdown } = this.calculateDrawdown(profits)
    
    return {
      timeframe: lookbackPeriod,
      lookbackPeriod,
      totalPredictions: completed.length,
      correctDirections,
      directionAccuracy: (correctDirections / completed.length) * 100,
      targetsHit,
      targetHitRate: (targetsHit / completed.length) * 100,
      stopLossesHit,
      stopLossRate: (stopLossesHit / completed.length) * 100,
      averageReturn: profits.reduce((a, b) => a + b, 0) / profits.length,
      winRate: (wins.length / completed.length) * 100,
      profitFactor: this.calculateProfitFactor(wins, losses),
      sharpeRatio: this.calculateSharpeRatio(profits),
      maxDrawdown,
      currentStreak,
      bestStreak,
      worstStreak
    }
  }

  /**
   * Get comprehensive backtest summary
   */
  getBacktestSummary(): BacktestSummary {
    const periods = ['15m', '30m', '1h', '4h', '1d'] as const
    const metrics: BacktestSummary['metrics'] = {} as any
    
    let totalPredictions = 0
    let totalWins = 0
    let totalLosses = 0
    let allReturns: number[] = []
    
    // Collect metrics for each period
    periods.forEach(period => {
      const m = this.getAccuracyMetrics(period)
      if (m) {
        metrics[period as keyof BacktestSummary['metrics']] = m
        totalPredictions += m.totalPredictions
        totalWins += Math.round(m.totalPredictions * m.winRate / 100)
        totalLosses += m.totalPredictions - Math.round(m.totalPredictions * m.winRate / 100)
        
        // Collect returns
        const records = this.predictions.get(period) || []
        records.forEach(r => {
          if (r.accuracy) {
            allReturns.push(r.accuracy.profitLoss)
          }
        })
      } else {
        metrics[period as keyof BacktestSummary['metrics']] = this.createEmptyMetrics(period)
      }
    })
    
    // Calculate overall statistics
    const winReturns = allReturns.filter(r => r > 0)
    const lossReturns = allReturns.filter(r => r < 0)
    const { maxDrawdown, recoveryTime } = this.calculateDrawdown(allReturns)
    
    const overallStats = {
      totalPredictions,
      totalWins,
      totalLosses,
      winRate: totalPredictions > 0 ? (totalWins / totalPredictions) * 100 : 0,
      averageWin: winReturns.length > 0 ? winReturns.reduce((a, b) => a + b, 0) / winReturns.length : 0,
      averageLoss: lossReturns.length > 0 ? Math.abs(lossReturns.reduce((a, b) => a + b, 0) / lossReturns.length) : 0,
      profitFactor: this.calculateProfitFactor(winReturns, lossReturns),
      totalReturn: allReturns.reduce((a, b) => a + b, 0),
      sharpeRatio: this.calculateSharpeRatio(allReturns),
      calmarRatio: this.calculateCalmarRatio(allReturns, maxDrawdown),
      maxDrawdown,
      recoveryTime
    }
    
    // Find best and worst performers
    const bestPerformers = this.findBestPerformers(metrics)
    const worstPerformers = this.findWorstPerformers(metrics)
    
    // Calculate date range
    const allRecords = Array.from(this.predictions.values()).flat()
    const dates = allRecords.map(r => r.timestamp)
    const startDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date()
    const endDate = new Date()
    
    return {
      period: '30 days',
      startDate,
      endDate,
      metrics,
      overallStats,
      bestPerformers,
      worstPerformers
    }
  }

  /**
   * Calculate accuracy metrics for a prediction
   */
  private calculateAccuracy(
    prediction: PredictionRecord['prediction'],
    actual: NonNullable<PredictionRecord['actual']>
  ): PredictionRecord['accuracy'] {
    const directionCorrect = 
      (prediction.direction === 'bullish' && actual.actualReturn > 0) ||
      (prediction.direction === 'bearish' && actual.actualReturn < 0)
    
    const profitLoss = actual.actualReturn * 
      (actual.hitTarget ? 2 : actual.hitStopLoss ? -1 : 1)
    
    return {
      directionCorrect,
      targetHit: actual.hitTarget,
      stopLossHit: actual.hitStopLoss,
      profitLoss
    }
  }

  /**
   * Calculate profit factor
   */
  private calculateProfitFactor(wins: number[], losses: number[]): number {
    const grossProfit = wins.reduce((a, b) => a + b, 0)
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
    return grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  }

  /**
   * Calculate Sharpe ratio
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length
    const stdDev = Math.sqrt(variance)
    
    return stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0  // Annualized
  }

  /**
   * Calculate Calmar ratio
   */
  private calculateCalmarRatio(returns: number[], maxDrawdown: number): number {
    const annualReturn = returns.reduce((a, b) => a + b, 0) * (252 / returns.length)
    return maxDrawdown !== 0 ? Math.abs(annualReturn / maxDrawdown) : 0
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateDrawdown(returns: number[]): { maxDrawdown: number; recoveryTime: number } {
    if (returns.length === 0) return { maxDrawdown: 0, recoveryTime: 0 }
    
    let peak = 0
    let maxDrawdown = 0
    let drawdownStart = 0
    let recoveryTime = 0
    let currentValue = 0
    
    for (let i = 0; i < returns.length; i++) {
      currentValue += returns[i]
      
      if (currentValue > peak) {
        peak = currentValue
        if (drawdownStart > 0) {
          const recovery = i - drawdownStart
          recoveryTime = Math.max(recoveryTime, recovery)
          drawdownStart = 0
        }
      }
      
      const drawdown = peak - currentValue
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
        if (drawdownStart === 0) {
          drawdownStart = i
        }
      }
    }
    
    return { 
      maxDrawdown: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
      recoveryTime: recoveryTime / 24  // Convert to days
    }
  }

  /**
   * Calculate winning/losing streaks
   */
  private calculateStreaks(
    completed: PredictionRecord[]
  ): { currentStreak: number; bestStreak: number; worstStreak: number } {
    let currentStreak = 0
    let bestStreak = 0
    let worstStreak = 0
    
    for (const record of completed) {
      if (record.accuracy!.profitLoss > 0) {
        currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1
        bestStreak = Math.max(bestStreak, currentStreak)
      } else {
        currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1
        worstStreak = Math.min(worstStreak, currentStreak)
      }
    }
    
    return { currentStreak, bestStreak, worstStreak: Math.abs(worstStreak) }
  }

  /**
   * Find best performing metrics
   */
  private findBestPerformers(metrics: BacktestSummary['metrics']): BacktestSummary['bestPerformers'] {
    const performers: BacktestSummary['bestPerformers'] = []
    
    // Find best accuracy
    let bestAccuracy = { timeframe: '', value: 0 }
    Object.entries(metrics).forEach(([tf, m]) => {
      if (m.directionAccuracy > bestAccuracy.value) {
        bestAccuracy = { timeframe: tf, value: m.directionAccuracy }
      }
    })
    if (bestAccuracy.value > 0) {
      performers.push({ ...bestAccuracy, metric: 'Direction Accuracy' })
    }
    
    // Find best win rate
    let bestWinRate = { timeframe: '', value: 0 }
    Object.entries(metrics).forEach(([tf, m]) => {
      if (m.winRate > bestWinRate.value) {
        bestWinRate = { timeframe: tf, value: m.winRate }
      }
    })
    if (bestWinRate.value > 0) {
      performers.push({ ...bestWinRate, metric: 'Win Rate' })
    }
    
    // Find best Sharpe ratio
    let bestSharpe = { timeframe: '', value: -Infinity }
    Object.entries(metrics).forEach(([tf, m]) => {
      if (m.sharpeRatio > bestSharpe.value) {
        bestSharpe = { timeframe: tf, value: m.sharpeRatio }
      }
    })
    if (bestSharpe.value > -Infinity) {
      performers.push({ ...bestSharpe, metric: 'Sharpe Ratio' })
    }
    
    return performers
  }

  /**
   * Find worst performing metrics
   */
  private findWorstPerformers(metrics: BacktestSummary['metrics']): BacktestSummary['worstPerformers'] {
    const performers: BacktestSummary['worstPerformers'] = []
    
    // Find worst drawdown
    let worstDrawdown = { timeframe: '', value: 0 }
    Object.entries(metrics).forEach(([tf, m]) => {
      if (m.maxDrawdown > worstDrawdown.value) {
        worstDrawdown = { timeframe: tf, value: m.maxDrawdown }
      }
    })
    if (worstDrawdown.value > 0) {
      performers.push({ ...worstDrawdown, metric: 'Max Drawdown' })
    }
    
    // Find worst streak
    let worstStreak = { timeframe: '', value: 0 }
    Object.entries(metrics).forEach(([tf, m]) => {
      if (m.worstStreak > worstStreak.value) {
        worstStreak = { timeframe: tf, value: m.worstStreak }
      }
    })
    if (worstStreak.value > 0) {
      performers.push({ ...worstStreak, metric: 'Worst Streak' })
    }
    
    return performers
  }

  /**
   * Clean up old records
   */
  private cleanOldRecords(timeframe: string): void {
    const records = this.predictions.get(timeframe) || []
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.maxHistoryDays)
    
    const filtered = records.filter(r => r.timestamp > cutoffDate)
    this.predictions.set(timeframe, filtered)
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(timeframe: string): AccuracyMetrics {
    return {
      timeframe,
      lookbackPeriod: timeframe,
      totalPredictions: 0,
      correctDirections: 0,
      directionAccuracy: 0,
      targetsHit: 0,
      targetHitRate: 0,
      stopLossesHit: 0,
      stopLossRate: 0,
      averageReturn: 0,
      winRate: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0
    }
  }

  /**
   * Generate synthetic historical data for testing
   */
  static generateSyntheticHistory(days: number = 30): BacktestingAccuracy {
    const tracker = new BacktestingAccuracy()
    const periods = ['15m', '30m', '1h', '4h', '1d']
    
    // Generate predictions for each period
    periods.forEach(period => {
      const numPredictions = Math.floor(days * (24 / this.periodToHours(period)))
      
      for (let i = 0; i < numPredictions; i++) {
        // Create prediction
        const direction = Math.random() > 0.5 ? 'bullish' : 'bearish'
        const confidence = 0.5 + Math.random() * 0.4
        const entryPrice = 450 + Math.random() * 10
        
        const id = tracker.recordPrediction(period, {
          direction: direction as any,
          expectedReturn: (Math.random() * 0.02 - 0.01),
          confidence,
          entryPrice,
          targetPrice: entryPrice * (1 + (direction === 'bullish' ? 0.01 : -0.01)),
          stopLoss: entryPrice * (1 + (direction === 'bullish' ? -0.005 : 0.005))
        })
        
        // Simulate actual result
        const success = Math.random() < (0.45 + confidence * 0.2)  // 45-65% success rate
        const actualReturn = success 
          ? (direction === 'bullish' ? 1 : -1) * (0.005 + Math.random() * 0.015)
          : (direction === 'bullish' ? -1 : 1) * (0.002 + Math.random() * 0.008)
        
        tracker.updatePredictionResult(id, {
          exitPrice: entryPrice * (1 + actualReturn),
          actualReturn,
          hitTarget: success && Math.random() > 0.3,
          hitStopLoss: !success && Math.random() > 0.5,
          maxMove: Math.abs(actualReturn) * 1.2,
          minMove: Math.abs(actualReturn) * 0.8
        })
      }
    })
    
    return tracker
  }

  /**
   * Convert period string to hours
   */
  private static periodToHours(period: string): number {
    const map: { [key: string]: number } = {
      '15m': 0.25,
      '30m': 0.5,
      '1h': 1,
      '4h': 4,
      '1d': 24
    }
    return map[period] || 1
  }
}

export default BacktestingAccuracy