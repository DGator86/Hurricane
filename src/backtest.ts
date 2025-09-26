// Hurricane SPY Backtesting Engine
import { PredictionEngine, TechnicalAnalysis, type Candle, type Prediction } from './models/prediction'
import { FinnhubDataService } from './finnhub-data'

export interface BacktestTrade {
  timestamp: Date
  timeframe: string
  direction: 'bullish' | 'bearish'
  entryPrice: number
  exitPrice: number
  targetPrice: number
  stopLoss: number
  positionSize: number
  confidence: number
  pnl: number
  pnlPercent: number
  outcome: 'win' | 'loss' | 'neutral'
  hurricaneLevel: number
  holdingPeriod: number // in minutes
}

export interface BacktestMetrics {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  sharpeRatio: number
  maxDrawdown: number
  totalPnL: number
  totalReturn: number
  kellyPerformance: number // How well Kelly sizing performed
  bestTimeframe: string
  worstTimeframe: string
  hurricaneAccuracy: { [level: number]: { trades: number; winRate: number } }
  dailyReturns: { date: string; return: number }[]
}

export interface BacktestResult {
  startDate: Date
  endDate: Date
  initialCapital: number
  finalCapital: number
  trades: BacktestTrade[]
  metrics: BacktestMetrics
  timeframeMetrics: { [timeframe: string]: BacktestMetrics }
  predictions: { timestamp: Date; prediction: Prediction; actual: number }[]
}

export class BacktestEngine {
  private finnhub: FinnhubDataService
  private initialCapital: number = 10000
  private maxPositionSize: number = 0.25 // Max 25% per Kelly Criterion

  constructor(finnhubApiKey: string) {
    this.finnhub = new FinnhubDataService(finnhubApiKey)
  }

  // Run backtest for specified period
  async runBacktest(daysBack: number = 7): Promise<BacktestResult> {
    console.log(`Starting backtest for ${daysBack} days...`)
    
    // Fetch historical data
    const historicalData = await this.fetchHistoricalData(daysBack)
    if (historicalData.length < 20) {
      throw new Error('Insufficient historical data for backtesting')
    }

    // Initialize tracking variables
    let capital = this.initialCapital
    const trades: BacktestTrade[] = []
    const predictions: { timestamp: Date; prediction: Prediction; actual: number }[] = []
    const timeframes = ['15m', '1h', '4h', '1d']
    
    // Process each time period
    for (let i = 20; i < historicalData.length - 1; i++) {
      const currentCandles = historicalData.slice(0, i + 1)
      const currentPrice = currentCandles[i].close
      const nextPrice = historicalData[i + 1].close
      
      // Generate predictions for each timeframe
      for (const timeframe of timeframes) {
        const prediction = PredictionEngine.generatePrediction(
          currentCandles,
          timeframe,
          this.estimateVIX(currentCandles)
        )

        // Record prediction
        predictions.push({
          timestamp: currentCandles[i].timestamp,
          prediction,
          actual: nextPrice
        })

        // Simulate trade if confidence threshold met
        if (prediction.confidence >= 0.5) {
          const trade = this.simulateTrade(
            prediction,
            currentPrice,
            nextPrice,
            currentCandles[i].timestamp,
            timeframe,
            historicalData.slice(i + 1, Math.min(i + 10, historicalData.length))
          )

          if (trade) {
            // Apply position sizing
            const actualPositionSize = Math.min(
              prediction.positionSize,
              this.maxPositionSize,
              capital * 0.25 / currentPrice
            )

            trade.positionSize = actualPositionSize
            trade.pnl = trade.pnlPercent * capital * actualPositionSize
            capital += trade.pnl

            trades.push(trade)
          }
        }
      }
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(trades, this.initialCapital, capital)
    const timeframeMetrics = this.calculateTimeframeMetrics(trades)

    return {
      startDate: historicalData[0].timestamp,
      endDate: historicalData[historicalData.length - 1].timestamp,
      initialCapital: this.initialCapital,
      finalCapital: capital,
      trades,
      metrics,
      timeframeMetrics,
      predictions
    }
  }

  // Fetch historical data from Finnhub
  private async fetchHistoricalData(daysBack: number): Promise<Candle[]> {
    try {
      // Fetch daily data for the specified period
      const candles = await this.finnhub.getDailyData(daysBack + 30) // Extra days for indicators
      
      // If daily data not sufficient, try hourly
      if (candles.length < daysBack * 2) {
        console.log('Fetching hourly data for better granularity...')
        return await this.finnhub.getCandles('SPY', '60', daysBack * 24)
      }
      
      return candles
    } catch (error) {
      console.error('Error fetching historical data:', error)
      // Generate synthetic historical data based on current price if API fails
      const quote = await this.finnhub.getCurrentSPYQuote()
      return this.generateHistoricalData(quote.price, daysBack)
    }
  }

  // Generate synthetic historical data for testing
  private generateHistoricalData(currentPrice: number, days: number): Candle[] {
    const candles: Candle[] = []
    const now = Date.now()
    let price = currentPrice * 0.98 // Start 2% lower
    
    // Generate hourly candles
    const periods = days * 24
    for (let i = 0; i < periods; i++) {
      // Add realistic market movement
      const timeOfDay = i % 24
      const isMarketHours = timeOfDay >= 9 && timeOfDay <= 16
      
      const volatility = isMarketHours ? 0.002 : 0.0005
      const trend = 0.0001 // Slight upward bias
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

  // Estimate VIX from price movements
  private estimateVIX(candles: Candle[]): number {
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
    return Math.min(50, Math.max(10, std * Math.sqrt(252) * 100))
  }

  // Simulate a trade execution
  private simulateTrade(
    prediction: Prediction,
    entryPrice: number,
    nextPrice: number,
    timestamp: Date,
    timeframe: string,
    futureCandles: Candle[]
  ): BacktestTrade | null {
    if (futureCandles.length === 0) return null
    
    let exitPrice = nextPrice
    let outcome: 'win' | 'loss' | 'neutral' = 'neutral'
    let holdingPeriod = 1
    
    // Determine holding period based on timeframe
    const periodsToHold = {
      '15m': 1,
      '1h': 4,
      '4h': 16,
      '1d': 24
    }[timeframe] || 1
    
    // Simulate trade execution over holding period
    for (let i = 0; i < Math.min(periodsToHold, futureCandles.length); i++) {
      const candle = futureCandles[i]
      
      // Check if stop loss hit
      if (prediction.direction === 'bullish' && candle.low <= prediction.stopLoss) {
        exitPrice = prediction.stopLoss
        outcome = 'loss'
        holdingPeriod = i + 1
        break
      } else if (prediction.direction === 'bearish' && candle.high >= prediction.stopLoss) {
        exitPrice = prediction.stopLoss
        outcome = 'loss'
        holdingPeriod = i + 1
        break
      }
      
      // Check if target hit
      if (prediction.direction === 'bullish' && candle.high >= prediction.targetPrice) {
        exitPrice = prediction.targetPrice
        outcome = 'win'
        holdingPeriod = i + 1
        break
      } else if (prediction.direction === 'bearish' && candle.low <= prediction.targetPrice) {
        exitPrice = prediction.targetPrice
        outcome = 'win'
        holdingPeriod = i + 1
        break
      }
      
      // Otherwise, exit at end of holding period
      if (i === periodsToHold - 1) {
        exitPrice = candle.close
        const pnl = prediction.direction === 'bullish' ? 
          exitPrice - entryPrice : 
          entryPrice - exitPrice
        outcome = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'neutral'
        holdingPeriod = i + 1
      }
    }
    
    // Calculate P&L
    const pnlAmount = prediction.direction === 'bullish' ? 
      exitPrice - entryPrice : 
      entryPrice - exitPrice
    const pnlPercent = pnlAmount / entryPrice
    
    return {
      timestamp,
      timeframe,
      direction: prediction.direction,
      entryPrice,
      exitPrice,
      targetPrice: prediction.targetPrice,
      stopLoss: prediction.stopLoss,
      positionSize: prediction.positionSize,
      confidence: prediction.confidence,
      pnl: pnlAmount,
      pnlPercent,
      outcome,
      hurricaneLevel: prediction.hurricaneIntensity,
      holdingPeriod
    }
  }

  // Calculate comprehensive metrics
  private calculateMetrics(trades: BacktestTrade[], initialCapital: number, finalCapital: number): BacktestMetrics {
    if (trades.length === 0) {
      return this.getEmptyMetrics()
    }

    const winningTrades = trades.filter(t => t.outcome === 'win')
    const losingTrades = trades.filter(t => t.outcome === 'loss')
    
    const winRate = winningTrades.length / trades.length
    const avgWin = winningTrades.length > 0 ? 
      winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length : 0
    const avgLoss = losingTrades.length > 0 ? 
      Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losingTrades.length) : 0
    
    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0
    
    // Calculate Sharpe Ratio
    const returns = trades.map(t => t.pnlPercent)
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    )
    const sharpeRatio = stdDev > 0 ? (avgReturn * Math.sqrt(252)) / stdDev : 0
    
    // Calculate max drawdown
    let peak = initialCapital
    let maxDrawdown = 0
    let runningCapital = initialCapital
    
    for (const trade of trades) {
      runningCapital += trade.pnl
      if (runningCapital > peak) {
        peak = runningCapital
      }
      const drawdown = (peak - runningCapital) / peak
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    }
    
    // Calculate hurricane-level accuracy
    const hurricaneAccuracy: { [level: number]: { trades: number; winRate: number } } = {}
    for (let level = 0; level <= 5; level++) {
      const levelTrades = trades.filter(t => t.hurricaneLevel === level)
      if (levelTrades.length > 0) {
        hurricaneAccuracy[level] = {
          trades: levelTrades.length,
          winRate: levelTrades.filter(t => t.outcome === 'win').length / levelTrades.length
        }
      }
    }
    
    // Calculate daily returns
    const tradesByDay: { [date: string]: BacktestTrade[] } = {}
    trades.forEach(trade => {
      const dateKey = trade.timestamp.toISOString().split('T')[0]
      if (!tradesByDay[dateKey]) {
        tradesByDay[dateKey] = []
      }
      tradesByDay[dateKey].push(trade)
    })
    
    const dailyReturns = Object.entries(tradesByDay).map(([date, dayTrades]) => ({
      date,
      return: dayTrades.reduce((sum, t) => sum + t.pnlPercent, 0)
    }))
    
    // Find best and worst timeframes
    const timeframePerformance: { [tf: string]: number } = {}
    trades.forEach(trade => {
      if (!timeframePerformance[trade.timeframe]) {
        timeframePerformance[trade.timeframe] = 0
      }
      timeframePerformance[trade.timeframe] += trade.pnlPercent
    })
    
    const bestTimeframe = Object.entries(timeframePerformance)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
    const worstTimeframe = Object.entries(timeframePerformance)
      .sort((a, b) => a[1] - b[1])[0]?.[0] || 'N/A'
    
    // Calculate Kelly performance
    const kellyTrades = trades.filter(t => t.positionSize > 0.01)
    const kellyPerformance = kellyTrades.length > 0 ?
      kellyTrades.reduce((sum, t) => sum + (t.pnlPercent * t.positionSize), 0) / kellyTrades.length : 0
    
    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      totalPnL: finalCapital - initialCapital,
      totalReturn: (finalCapital - initialCapital) / initialCapital,
      kellyPerformance,
      bestTimeframe,
      worstTimeframe,
      hurricaneAccuracy,
      dailyReturns
    }
  }

  // Calculate metrics per timeframe
  private calculateTimeframeMetrics(trades: BacktestTrade[]): { [timeframe: string]: BacktestMetrics } {
    const timeframes = ['15m', '1h', '4h', '1d']
    const metrics: { [timeframe: string]: BacktestMetrics } = {}
    
    for (const tf of timeframes) {
      const tfTrades = trades.filter(t => t.timeframe === tf)
      if (tfTrades.length > 0) {
        const tfCapital = this.initialCapital + 
          tfTrades.reduce((sum, t) => sum + t.pnl, 0)
        metrics[tf] = this.calculateMetrics(tfTrades, this.initialCapital, tfCapital)
      }
    }
    
    return metrics
  }

  // Get empty metrics object
  private getEmptyMetrics(): BacktestMetrics {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      totalPnL: 0,
      totalReturn: 0,
      kellyPerformance: 0,
      bestTimeframe: 'N/A',
      worstTimeframe: 'N/A',
      hurricaneAccuracy: {},
      dailyReturns: []
    }
  }

  // Generate HTML report
  generateHTMLReport(result: BacktestResult): string {
    const m = result.metrics
    const formatPercent = (n: number) => (n * 100).toFixed(2) + '%'
    const formatMoney = (n: number) => '$' + n.toFixed(2)
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Hurricane SPY Backtest Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-900 text-white">
    <div class="container mx-auto px-4 py-8">
        <h1 class="text-4xl font-bold mb-8 text-center">
            <i class="fas fa-hurricane text-yellow-400 animate-spin mr-3"></i>
            Hurricane SPY Backtest Report
        </h1>
        
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-sm text-gray-400 mb-2">Total Return</h3>
                <p class="text-2xl font-bold ${m.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}">
                    ${formatPercent(m.totalReturn)}
                </p>
            </div>
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-sm text-gray-400 mb-2">Win Rate</h3>
                <p class="text-2xl font-bold text-blue-400">${formatPercent(m.winRate)}</p>
            </div>
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-sm text-gray-400 mb-2">Sharpe Ratio</h3>
                <p class="text-2xl font-bold text-purple-400">${m.sharpeRatio.toFixed(2)}</p>
            </div>
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-sm text-gray-400 mb-2">Max Drawdown</h3>
                <p class="text-2xl font-bold text-orange-400">${formatPercent(m.maxDrawdown)}</p>
            </div>
        </div>
        
        <!-- Detailed Metrics -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">Performance Metrics</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <p class="text-gray-400">Total Trades</p>
                    <p class="text-xl">${m.totalTrades}</p>
                </div>
                <div>
                    <p class="text-gray-400">Winning Trades</p>
                    <p class="text-xl text-green-400">${m.winningTrades}</p>
                </div>
                <div>
                    <p class="text-gray-400">Losing Trades</p>
                    <p class="text-xl text-red-400">${m.losingTrades}</p>
                </div>
                <div>
                    <p class="text-gray-400">Profit Factor</p>
                    <p class="text-xl">${m.profitFactor.toFixed(2)}</p>
                </div>
                <div>
                    <p class="text-gray-400">Avg Win</p>
                    <p class="text-xl text-green-400">${formatPercent(m.avgWin)}</p>
                </div>
                <div>
                    <p class="text-gray-400">Avg Loss</p>
                    <p class="text-xl text-red-400">${formatPercent(m.avgLoss)}</p>
                </div>
                <div>
                    <p class="text-gray-400">Best Timeframe</p>
                    <p class="text-xl text-blue-400">${m.bestTimeframe}</p>
                </div>
                <div>
                    <p class="text-gray-400">Kelly Performance</p>
                    <p class="text-xl">${formatPercent(m.kellyPerformance)}</p>
                </div>
            </div>
        </div>
        
        <!-- Hurricane Level Accuracy -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">Hurricane Level Performance</h2>
            <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
                ${Object.entries(m.hurricaneAccuracy).map(([level, data]) => `
                <div class="text-center">
                    <p class="text-gray-400">Level ${level}</p>
                    <p class="text-xl">${formatPercent(data.winRate)}</p>
                    <p class="text-sm text-gray-500">${data.trades} trades</p>
                </div>
                `).join('')}
            </div>
        </div>
        
        <!-- Equity Curve Chart -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">Equity Curve</h2>
            <canvas id="equityChart" height="100"></canvas>
        </div>
        
        <!-- Daily Returns Chart -->
        <div class="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 class="text-2xl font-bold mb-4">Daily Returns</h2>
            <canvas id="dailyReturnsChart" height="100"></canvas>
        </div>
        
        <!-- Recent Trades Table -->
        <div class="bg-gray-800 p-6 rounded-lg">
            <h2 class="text-2xl font-bold mb-4">Recent Trades</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-gray-700">
                            <th class="text-left p-2">Date</th>
                            <th class="text-left p-2">Timeframe</th>
                            <th class="text-left p-2">Direction</th>
                            <th class="text-right p-2">Entry</th>
                            <th class="text-right p-2">Exit</th>
                            <th class="text-right p-2">P&L</th>
                            <th class="text-right p-2">Confidence</th>
                            <th class="text-center p-2">Outcome</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${result.trades.slice(-10).reverse().map(t => `
                        <tr class="border-b border-gray-700">
                            <td class="p-2">${t.timestamp.toLocaleDateString()}</td>
                            <td class="p-2">${t.timeframe}</td>
                            <td class="p-2 ${t.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}">
                                ${t.direction}
                            </td>
                            <td class="text-right p-2">${formatMoney(t.entryPrice)}</td>
                            <td class="text-right p-2">${formatMoney(t.exitPrice)}</td>
                            <td class="text-right p-2 ${t.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}">
                                ${formatPercent(t.pnlPercent)}
                            </td>
                            <td class="text-right p-2">${formatPercent(t.confidence)}</td>
                            <td class="text-center p-2">
                                <span class="px-2 py-1 rounded text-xs ${
                                    t.outcome === 'win' ? 'bg-green-600' : 
                                    t.outcome === 'loss' ? 'bg-red-600' : 'bg-gray-600'
                                }">
                                    ${t.outcome}
                                </span>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script>
        // Equity Curve Chart
        const equityCtx = document.getElementById('equityChart').getContext('2d');
        const equityData = [${result.trades.reduce((acc, t) => {
            const last = acc[acc.length - 1] || result.initialCapital;
            acc.push(last + t.pnl);
            return acc;
        }, []).join(',')}];
        
        new Chart(equityCtx, {
            type: 'line',
            data: {
                labels: [${result.trades.map((_, i) => i).join(',')}],
                datasets: [{
                    label: 'Equity',
                    data: equityData,
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
        
        // Daily Returns Chart
        const dailyCtx = document.getElementById('dailyReturnsChart').getContext('2d');
        new Chart(dailyCtx, {
            type: 'bar',
            data: {
                labels: [${m.dailyReturns.map(d => `'${d.date.split('-')[2]}'`).join(',')}],
                datasets: [{
                    label: 'Daily Return',
                    data: [${m.dailyReturns.map(d => (d.return * 100).toFixed(2)).join(',')}],
                    backgroundColor: [${m.dailyReturns.map(d => 
                        d.return >= 0 ? "'rgba(34, 197, 94, 0.5)'" : "'rgba(239, 68, 68, 0.5)'"
                    ).join(',')}]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    </script>
</body>
</html>
    `
  }
}