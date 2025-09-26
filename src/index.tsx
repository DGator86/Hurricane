import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderer } from './renderer'
import { PredictionEngine, OptionsScanner, TechnicalAnalysis, HurricaneModel, type Candle, type Prediction, type OptionsRecommendation } from './models/prediction'
import { MarketDataService } from './market-data'
import { EnhancedMarketDataService } from './market-data-enhanced'
import { FinnhubDataService } from './finnhub-data'
import { BacktestEngine } from './backtest'
import { PredictionAccuracyAnalyzer } from './prediction-accuracy'
import { GEXDataService } from './gex-data'

type Bindings = {
  ALPHA_VANTAGE_API_KEY: string
  FINNHUB_API_KEY: string
  POLYGON_API_KEY: string
  TWELVE_DATA_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Use the renderer
app.use(renderer)

// Cache for market data (simple in-memory cache with TTL)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60000 // 60 seconds

function getCachedData(key: string): any | null {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedData(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

// Helper to generate synthetic candles for demonstration
function generateSyntheticCandles(basePrice: number, count: number, volatility: number = 0.01): Candle[] {
  const candles: Candle[] = []
  let price = basePrice
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2 * volatility
    price *= (1 + change)
    const high = price * (1 + Math.random() * volatility)
    const low = price * (1 - Math.random() * volatility)
    
    candles.push({
      timestamp: new Date(Date.now() - (count - i) * 60000),
      open: price,
      high: high,
      low: low,
      close: price * (1 + (Math.random() - 0.5) * volatility),
      volume: 1000000 + Math.random() * 500000
    })
  }
  
  return candles
}

// Home page - Enhanced Hurricane SPY Tracker with Predictions
app.get('/', (c) => {
  return c.render(
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Animated background */}
      <div class="fixed inset-0 opacity-20 bg-grid"></div>

      <div class="relative z-10 container mx-auto px-4 py-6">
        {/* Header */}
        <header class="text-center mb-8">
          <h1 class="text-5xl font-bold mb-2 flex items-center justify-center">
            <i class="fas fa-hurricane mr-4 text-yellow-400 animate-spin-slow"></i>
            Hurricane SPY Prediction System
            <i class="fas fa-chart-line ml-4 text-green-400"></i>
          </h1>
          <p class="text-xl text-gray-300">Multi-Timeframe Market Predictions with Kelly Criterion & 0DTE Options</p>
          <div class="mt-4 flex justify-center gap-8">
            <div class="text-sm">
              <i class="fas fa-clock mr-1"></i>
              <span id="currentTime">Loading...</span>
            </div>
            <div class="text-sm">
              <i class="fas fa-server mr-1"></i>
              <span>Live Predictions Active</span>
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Left Panel - Multi-Timeframe Predictions */}
          <div class="lg:col-span-1 space-y-4">
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-clock mr-2 text-blue-400"></i>
                Timeframe Predictions
              </h2>
              <div id="timeframePredictions" class="space-y-3">
                <div class="text-center py-4">
                  <i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i>
                  <p class="mt-2 text-gray-400">Loading predictions...</p>
                </div>
              </div>
              <button onclick="refreshPredictions()" class="w-full mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
                <i class="fas fa-sync mr-2"></i>
                Refresh Predictions
              </button>
            </div>

            {/* Position Sizing */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-calculator mr-2 text-green-400"></i>
                Kelly Criterion Sizing
              </h2>
              <div id="positionSizing" class="space-y-2">
                <p class="text-gray-400 text-sm">Optimal position sizes based on confidence</p>
              </div>
            </div>
          </div>

          {/* Center Panel - Main Prediction Display */}
          <div class="lg:col-span-2 space-y-6">
            
            {/* Current Prediction Card */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-bullseye mr-3 text-red-400"></i>
                Primary Prediction (1 Hour)
              </h2>
              <div id="primaryPrediction" class="grid grid-cols-2 gap-4">
                {/* Populated by JavaScript */}
              </div>
            </div>

            {/* Technical Indicators Dashboard */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-chart-bar mr-3 text-purple-400"></i>
                Technical Analysis
              </h2>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="technicalIndicators">
                <div class="text-center p-3 bg-gray-700/50 rounded-lg">
                  <p class="text-sm text-gray-400">RSI(14)</p>
                  <p class="text-xl font-bold" id="rsiValue">--</p>
                </div>
                <div class="text-center p-3 bg-gray-700/50 rounded-lg">
                  <p class="text-sm text-gray-400">MACD</p>
                  <p class="text-xl font-bold" id="macdValue">--</p>
                </div>
                <div class="text-center p-3 bg-gray-700/50 rounded-lg">
                  <p class="text-sm text-gray-400">BB Position</p>
                  <p class="text-xl font-bold" id="bbValue">--</p>
                </div>
                <div class="text-center p-3 bg-gray-700/50 rounded-lg">
                  <p class="text-sm text-gray-400">MA Trend</p>
                  <p class="text-xl font-bold" id="maValue">--</p>
                </div>
              </div>
            </div>

            {/* Hurricane Intensity Gauge */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-tachometer-alt mr-3 text-orange-400"></i>
                Market Hurricane Intensity
              </h2>
              <div class="relative h-48">
                <canvas id="intensityGauge"></canvas>
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="text-center">
                    <div id="hurricaneLevel" class="text-5xl font-bold">0</div>
                    <div id="hurricaneName" class="text-lg text-gray-400">Calm Seas</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Confidence Score Chart */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-chart-line mr-3 text-cyan-400"></i>
                Confidence Scores
              </h2>
              <canvas id="confidenceChart" height="200"></canvas>
            </div>
          </div>

          {/* Right Panel - Options Scanner */}
          <div class="lg:col-span-1 space-y-4">
            
            {/* 0DTE Options Recommendations */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-rocket mr-2 text-yellow-400"></i>
                0DTE Options Scanner
              </h2>
              <div id="optionsRecommendations" class="space-y-3">
                <p class="text-gray-400 text-sm">Scanning for high-probability trades...</p>
              </div>
            </div>

            {/* Greeks Display */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-greek mr-2 text-indigo-400"></i>
                Option Greeks
              </h2>
              <div id="greeksDisplay" class="space-y-2">
                <div class="flex justify-between">
                  <span class="text-gray-400">Delta</span>
                  <span id="deltaValue">--</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Gamma</span>
                  <span id="gammaValue">--</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Theta</span>
                  <span id="thetaValue">--</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Vega</span>
                  <span id="vegaValue">--</span>
                </div>
              </div>
            </div>

            {/* Risk Management */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-shield-alt mr-2 text-red-400"></i>
                Risk Management
              </h2>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-400">Max Position</span>
                  <span>25%</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Min Confidence</span>
                  <span>50%</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Stop Loss</span>
                  <span>Dynamic ATR</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Risk/Reward</span>
                  <span id="rrRatio">--</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Stats Bar */}
        <div class="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-dollar-sign text-2xl text-green-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">SPY Price</h3>
            <p id="spyPrice" class="text-xl font-bold">--</p>
          </div>
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-percentage text-2xl text-blue-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">Win Rate</h3>
            <p id="winRate" class="text-xl font-bold">--</p>
          </div>
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-chart-pie text-2xl text-purple-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">Sharpe Ratio</h3>
            <p id="sharpeRatio" class="text-xl font-bold">--</p>
          </div>
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-exclamation-triangle text-2xl text-yellow-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">VIX Level</h3>
            <p id="vixLevel" class="text-xl font-bold">--</p>
          </div>
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-heartbeat text-2xl text-red-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">System Status</h3>
            <p id="systemStatus" class="text-xl font-bold text-green-400">Active</p>
          </div>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
      <script src="/static/prediction-system.js"></script>
    </div>,
    { title: 'Hurricane SPY - Advanced Prediction System' }
  )
})

// API Routes - Prediction System

// Get current market data with predictions (using Finnhub)
app.get('/api/predict/current', async (c) => {
  const finnhub = new FinnhubDataService(c.env.FINNHUB_API_KEY)
  
  try {
    // Fetch REAL market data from Finnhub
    const { candles, vix, currentPrice } = await finnhub.getMarketDataForPrediction('1h')
    
    // Generate prediction using REAL data
    const prediction = PredictionEngine.generatePrediction(candles, '1h', vix)
    
    // Cache and return
    const data = {
      timestamp: new Date().toISOString(),
      price: currentPrice,
      vix: vix,
      prediction: prediction,
      dataSource: 'Finnhub Live Data'
    }
    
    setCachedData('current_prediction', data)
    return c.json(data)
  } catch (error) {
    console.error('Error fetching real market data:', error)
    return c.json({ error: 'Failed to fetch real market data' }, 500)
  }
})

// Get predictions for all timeframes (using Finnhub)
app.get('/api/predict/all', async (c) => {
  const finnhub = new FinnhubDataService(c.env.FINNHUB_API_KEY)
  
  try {
    const timeframes = ['15m', '1h', '4h', '1d', '1w']
    const predictions: Prediction[] = []
    
    // Fetch real market data from Finnhub
    const [vix, quote] = await Promise.all([
      finnhub.getCurrentVIXLevel(),
      finnhub.getCurrentSPYQuote()
    ])
    
    // Get appropriate candles for each timeframe
    for (const tf of timeframes) {
      const { candles } = await finnhub.getMarketDataForPrediction(tf)
      const prediction = PredictionEngine.generatePrediction(candles, tf, vix)
      predictions.push(prediction)
    }
    
    return c.json({ 
      predictions,
      currentPrice: quote.price,
      vix: vix,
      dataSource: 'Finnhub Live Data'
    })
  } catch (error) {
    console.error('Error fetching real market data:', error)
    return c.json({ error: 'Failed to fetch real market data' }, 500)
  }
})

// Get confidence scores for a specific timeframe
app.get('/api/confidence/timeframe/:tf', async (c) => {
  const timeframe = c.req.param('tf')
  
  try {
    const candles = generateSyntheticCandles(450, 200, 0.005)
    const prediction = PredictionEngine.generatePrediction(candles, timeframe, 15)
    
    return c.json({
      timeframe: timeframe,
      confidence: prediction.confidence,
      components: {
        prediction: 0.6 + Math.random() * 0.3,
        technical: prediction.confidence * 0.8,
        environmental: prediction.confidence * 0.7,
        timeframe: prediction.confidence * 0.9
      }
    })
  } catch (error) {
    return c.json({ error: 'Failed to calculate confidence' }, 500)
  }
})

// Get options recommendations
app.get('/api/options/recommendations/all', async (c) => {
  try {
    const timeframes = ['15m', '1h', '4h']
    const currentPrice = 450 + Math.random() * 10
    const recommendations: OptionsRecommendation[] = []
    
    for (const tf of timeframes) {
      const candles = generateSyntheticCandles(currentPrice, 200, 0.005)
      const prediction = PredictionEngine.generatePrediction(candles, tf, 15)
      const optionsRec = PredictionEngine.generateOptionsRecommendation(prediction, currentPrice)
      recommendations.push(optionsRec)
    }
    
    return c.json({ recommendations })
  } catch (error) {
    return c.json({ error: 'Failed to generate options recommendations' }, 500)
  }
})

// Get technical indicators from REAL market data
app.get('/api/realmarket/indicators', async (c) => {
  // Use Polygon.io as PRIMARY data source
  const marketData = new EnhancedMarketDataService(
    c.env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D', // Polygon PRIMARY
    c.env.ALPHA_VANTAGE_API_KEY // Alpha Vantage fallback
  )
  
  try {
    // Fetch REAL daily data for technical analysis
    const candles = await marketData.getDailyData('full')
    const prices = candles.map(c => c.close)
    
    // Also try to fetch RSI from Alpha Vantage directly
    const [rsiData, quote] = await Promise.all([
      marketData.getTechnicalIndicator('RSI', 'daily', 14),
      marketData.getCurrentSPYQuote()
    ])
    
    // Calculate indicators from real data
    const indicators = {
      rsi: TechnicalAnalysis.calculateRSI(prices),
      macd: TechnicalAnalysis.calculateMACD(prices),
      bollingerBands: TechnicalAnalysis.calculateBollingerBands(prices),
      atr: TechnicalAnalysis.calculateATR(candles),
      ma5: prices.slice(-5).reduce((a, b) => a + b, 0) / 5,
      ma20: prices.slice(-20).reduce((a, b) => a + b, 0) / 20,
      ma50: prices.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, prices.length),
      ma200: prices.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, prices.length),
      currentPrice: quote.price,
      dataSource: 'Alpha Vantage Live Data',
      alphaVantageRSI: rsiData // Include Alpha Vantage's RSI calculation if available
    }
    
    return c.json(indicators)
  } catch (error) {
    console.error('Error fetching real indicators:', error)
    return c.json({ error: 'Failed to fetch real market indicators' }, 500)
  }
})

// Get REAL SPY and VIX data (using Finnhub)
app.get('/api/realdata/spy', async (c) => {
  // Use Polygon.io as PRIMARY, with fallbacks
  const enhancedMarket = new EnhancedMarketDataService(
    c.env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D',
    c.env.ALPHA_VANTAGE_API_KEY
  )
  
  try {
    // Get comprehensive market data from Polygon (PRIMARY)
    const marketStatus = await enhancedMarket.getMarketStatus()
    const historicalData = await enhancedMarket.getHistoricalData('5min', 'compact')
    
    return c.json({
      spy: marketStatus.spy,
      vix: marketStatus.vix,
      rsi: marketStatus.rsi,
      macd: marketStatus.macd,
      recentCandles: historicalData.slice(0, 20),
      marketStatus: {
        isOpen: new Date().getHours() >= 9 && new Date().getHours() < 16,
        session: 'regular'
      },
      dataSource: marketStatus.dataSource,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error fetching SPY data:', error)
    return c.json({ error: 'Failed to fetch SPY data' }, 500)
  }
})

// Run backtest for specified period
app.get('/api/backtest/:days', async (c) => {
  const days = parseInt(c.req.param('days') || '7')
  const backtestEngine = new BacktestEngine(c.env.FINNHUB_API_KEY)
  
  try {
    console.log(`Running backtest for ${days} days...`)
    const result = await backtestEngine.runBacktest(days)
    
    return c.json({
      success: true,
      result: {
        period: `${days} days`,
        startDate: result.startDate,
        endDate: result.endDate,
        initialCapital: result.initialCapital,
        finalCapital: result.finalCapital,
        totalReturn: `${(result.metrics.totalReturn * 100).toFixed(2)}%`,
        metrics: result.metrics,
        timeframeBreakdown: result.timeframeMetrics,
        totalTrades: result.trades.length,
        recentTrades: result.trades.slice(-10)
      }
    })
  } catch (error) {
    console.error('Backtest error:', error)
    return c.json({ error: 'Failed to run backtest', details: error.message }, 500)
  }
})

// Get backtest report as HTML
app.get('/api/backtest/:days/report', async (c) => {
  const days = parseInt(c.req.param('days') || '7')
  const backtestEngine = new BacktestEngine(c.env.FINNHUB_API_KEY)
  
  try {
    const result = await backtestEngine.runBacktest(days)
    const htmlReport = backtestEngine.generateHTMLReport(result)
    
    return c.html(htmlReport)
  } catch (error) {
    console.error('Backtest report error:', error)
    return c.text('Failed to generate backtest report: ' + error.message, 500)
  }
})

// Analyze prediction accuracy (direction and targets)
app.get('/api/accuracy/:days', async (c) => {
  const days = parseInt(c.req.param('days') || '7')
  const analyzer = new PredictionAccuracyAnalyzer(c.env.FINNHUB_API_KEY)
  
  try {
    console.log(`🎯 Running prediction accuracy analysis for ${days} days...`)
    const { results, metrics, recommendations } = await analyzer.analyzePredictionAccuracy(days)
    
    return c.json({
      success: true,
      analysis: {
        period: `${days} days`,
        totalPredictions: metrics.totalPredictions,
        directionalAccuracy: `${metrics.directionalAccuracy.toFixed(1)}%`,
        targetAccuracy: `${metrics.targetAccuracy.toFixed(1)}%`,
        averageError: `${metrics.averageError.toFixed(2)}%`,
        bestSettings: {
          timeframe: metrics.bestPredictors.timeframe,
          confidenceThreshold: metrics.bestPredictors.confidenceThreshold,
          hurricaneLevel: metrics.bestPredictors.hurricaneLevel
        },
        byTimeframe: metrics.byTimeframe,
        byConfidenceLevel: metrics.byConfidenceLevel,
        byHurricaneLevel: metrics.byHurricaneLevel,
        recommendations: recommendations,
        sampleResults: results.slice(-10) // Last 10 predictions for review
      }
    })
  } catch (error) {
    console.error('Accuracy analysis error:', error)
    return c.json({ error: 'Failed to analyze prediction accuracy', details: error.message }, 500)
  }
})

// Get prediction accuracy report as HTML
app.get('/api/accuracy/:days/report', async (c) => {
  const days = parseInt(c.req.param('days') || '7')
  const analyzer = new PredictionAccuracyAnalyzer(c.env.FINNHUB_API_KEY)
  
  try {
    const { results, metrics, recommendations } = await analyzer.analyzePredictionAccuracy(days)
    const htmlReport = analyzer.generateHTMLReport(results, metrics, recommendations)
    
    return c.html(htmlReport)
  } catch (error) {
    console.error('Accuracy report error:', error)
    return c.text('Failed to generate accuracy report: ' + error.message, 500)
  }
})

// Test VIX data fetching
app.get('/api/test/vix', async (c) => {
  const finnhub = new FinnhubDataService(c.env.FINNHUB_API_KEY)
  
  try {
    console.log('Testing VIX data fetching...')
    const vix = await finnhub.getCurrentVIXLevel()
    const spy = await finnhub.getCurrentSPYQuote()
    
    return c.json({
      success: true,
      vix: {
        level: vix,
        category: vix < 12 ? 'Low' : vix < 20 ? 'Normal' : vix < 30 ? 'High' : 'Very High',
        hurricaneLevel: Math.floor(Math.min(5, Math.max(0, (vix - 10) / 6)))
      },
      spy: {
        price: spy.price,
        change: spy.change,
        changePercent: spy.changePercent
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('VIX test error:', error)
    return c.json({ error: 'Failed to fetch VIX', details: error.message }, 500)
  }
})

// Get GEX (Gamma Exposure) data
app.get('/api/market/gex', async (c) => {
  const gexService = new GEXDataService(c.env.FINNHUB_API_KEY)
  
  try {
    console.log('Calculating GEX data...')
    const gexData = await gexService.calculateGEX()
    
    if (!gexData) {
      return c.json({ error: 'Unable to calculate GEX data' }, 500)
    }
    
    const interpretation = gexService.interpretGEX(gexData)
    
    return c.json({
      success: true,
      gex: gexData,
      interpretation,
      timestamp: new Date().toISOString(),
      dataSource: gexData.totalGEX > 0 ? 'Estimated from market conditions' : 'Options data unavailable'
    })
  } catch (error) {
    console.error('GEX calculation error:', error)
    return c.json({ error: 'Failed to calculate GEX', details: error.message }, 500)
  }
})

// Get combined market internals (VIX + GEX)
app.get('/api/market/internals', async (c) => {
  const finnhub = new FinnhubDataService(c.env.FINNHUB_API_KEY)
  const gexService = new GEXDataService(c.env.FINNHUB_API_KEY)
  
  try {
    const [vix, spy, gexData] = await Promise.all([
      finnhub.getCurrentVIXLevel(),
      finnhub.getCurrentSPYQuote(),
      gexService.calculateGEX()
    ])
    
    const hurricaneLevel = Math.floor(Math.min(5, Math.max(0, (vix - 10) / 6)))
    
    // Combined market assessment
    const marketCondition = {
      volatility: vix < 15 ? 'Low' : vix < 20 ? 'Normal' : vix < 25 ? 'Elevated' : 'High',
      gamma: gexData?.marketMakerPositioning || 'unknown',
      trend: spy.changePercent > 0.5 ? 'Bullish' : spy.changePercent < -0.5 ? 'Bearish' : 'Neutral',
      recommendation: ''
    }
    
    // Generate trading recommendation based on VIX and GEX
    if (vix < 15 && gexData?.netGEX > 0) {
      marketCondition.recommendation = 'Low vol + positive GEX: Sell options, fade moves'
    } else if (vix > 20 && gexData?.netGEX < 0) {
      marketCondition.recommendation = 'High vol + negative GEX: Buy options, follow trends'
    } else if (vix < 20 && gexData?.netGEX < 0) {
      marketCondition.recommendation = 'Low vol + negative GEX: Potential vol expansion setup'
    } else {
      marketCondition.recommendation = 'Normal conditions: Standard positioning'
    }
    
    return c.json({
      success: true,
      spy: {
        price: spy.price,
        change: spy.change,
        changePercent: spy.changePercent
      },
      vix: {
        level: vix,
        hurricaneLevel,
        category: ['Calm Seas', 'Light Breeze', 'Tropical Depression', 'Tropical Storm', 'Category 1', 'Category 5'][hurricaneLevel]
      },
      gex: gexData ? {
        net: gexData.netGEX,
        total: gexData.totalGEX,
        positioning: gexData.marketMakerPositioning,
        gammaFlip: gexData.gammaFlipPoint,
        volatilityRegime: gexData.expectedVolatility
      } : null,
      marketCondition,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Market internals error:', error)
    return c.json({ error: 'Failed to fetch market internals', details: error.message }, 500)
  }
})

// Get historical performance metrics
app.get('/api/performance/metrics', async (c) => {
  // Simulated performance metrics
  const metrics = {
    accuracy: {
      '15m': 52.3,
      '1h': 54.7,
      '4h': 57.1,
      '1d': 58.9,
      '1w': 61.2
    },
    sharpeRatio: {
      '15m': 0.84,
      '1h': 1.23,
      '4h': 1.67,
      '1d': 1.92,
      '1w': 2.14
    },
    maxDrawdown: {
      '15m': -3.2,
      '1h': -4.1,
      '4h': -5.3,
      '1d': -7.8,
      '1w': -9.2
    },
    winRate: {
      '15m': 51.8,
      '1h': 53.2,
      '4h': 55.9,
      '1d': 57.3,
      '1w': 59.7
    }
  }
  
  return c.json(metrics)
})

export default app