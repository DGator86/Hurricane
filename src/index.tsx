import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderer } from './renderer'

type Bindings = {
  ALPHA_VANTAGE_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Use the renderer
app.use(renderer)

// Home page - SPY Hurricane Tracker
app.get('/', (c) => {
  return c.render(
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Animated background effect */}
      <div class="fixed inset-0 opacity-20 bg-grid"></div>

      <div class="relative z-10 container mx-auto px-4 py-6">
        {/* Header */}
        <header class="text-center mb-8">
          <h1 class="text-5xl font-bold mb-2 flex items-center justify-center">
            <i class="fas fa-hurricane mr-4 text-yellow-400 animate-spin-slow"></i>
            SPY Hurricane Tracker
            <i class="fas fa-satellite mr-4 ml-4 text-blue-400"></i>
          </h1>
          <p class="text-xl text-gray-300">Tracking Market Storms in Real-Time</p>
          <div class="mt-4 flex justify-center gap-8">
            <div class="text-sm">
              <i class="fas fa-clock mr-1"></i>
              <span id="currentTime">Loading...</span>
            </div>
            <div class="text-sm">
              <i class="fas fa-calendar mr-1"></i>
              <span id="currentDate">Loading...</span>
            </div>
          </div>
        </header>

        {/* Alert Banner */}
        <div id="alertBanner" class="mb-6 hidden">
          <div class="bg-red-900/50 border-2 border-red-500 rounded-lg p-4 flex items-center animate-pulse">
            <i class="fas fa-exclamation-triangle text-3xl text-yellow-400 mr-4"></i>
            <div>
              <h3 class="text-xl font-bold">MARKET STORM WARNING</h3>
              <p id="alertMessage" class="text-gray-200"></p>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Panel - Storm Status */}
          <div class="lg:col-span-1 space-y-6">
            
            {/* Current Conditions */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-wind mr-3 text-cyan-400"></i>
                Current Conditions
              </h2>
              <div id="currentConditions" class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">SPY Price</span>
                  <span id="spyPrice" class="text-2xl font-bold">--</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Change</span>
                  <span id="spyChange" class="text-xl font-bold">--</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Volatility (VIX)</span>
                  <span id="vixLevel" class="text-xl font-bold">--</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Volume Surge</span>
                  <span id="volumeSurge" class="text-xl font-bold">--</span>
                </div>
              </div>
            </div>

            {/* Storm Category */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-tornado mr-3 text-orange-400"></i>
                Storm Category
              </h2>
              <div id="stormCategory" class="text-center py-4">
                <div id="categoryIcon" class="text-6xl mb-3">
                  <i class="fas fa-sun text-green-400"></i>
                </div>
                <h3 id="categoryName" class="text-2xl font-bold mb-2">Calm Markets</h3>
                <p id="categoryDesc" class="text-gray-400 text-sm">Normal trading conditions</p>
                <div class="mt-4 bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div id="categoryBar" class="h-full bg-green-500 transition-all duration-1000" style="width: 20%"></div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-xl font-bold mb-4">Quick Analysis</h2>
              <div class="space-y-3">
                <button onclick="analyzeMarket()" class="w-full bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-lg transition-colors flex items-center justify-center">
                  <i class="fas fa-satellite-dish mr-2"></i>
                  Scan Market Conditions
                </button>
                <button onclick="loadHistoricalStorms()" class="w-full bg-purple-600 hover:bg-purple-700 px-4 py-3 rounded-lg transition-colors flex items-center justify-center">
                  <i class="fas fa-history mr-2"></i>
                  Historical Storms
                </button>
                <button onclick="predictNextStorm()" class="w-full bg-orange-600 hover:bg-orange-700 px-4 py-3 rounded-lg transition-colors flex items-center justify-center">
                  <i class="fas fa-crystal-ball mr-2"></i>
                  Storm Forecast
                </button>
              </div>
            </div>
          </div>

          {/* Center Panel - Hurricane Visualization */}
          <div class="lg:col-span-2 space-y-6">
            
            {/* Hurricane Eye Visualization */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-radar mr-3 text-green-400"></i>
                Market Hurricane Radar
              </h2>
              <div class="relative">
                <canvas id="hurricaneRadar" class="w-full" height="400"></canvas>
                <div id="radarOverlay" class="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div class="text-center">
                    <div id="hurricaneEye" class="w-32 h-32 rounded-full border-4 border-yellow-400 animate-pulse relative">
                      <div class="absolute inset-0 rounded-full border-2 border-orange-400 animate-spin-slow"></div>
                      <div class="absolute inset-0 rounded-full border-2 border-red-400 animate-spin-slow-reverse"></div>
                      <div class="absolute inset-0 flex items-center justify-center">
                        <span id="stormIntensity" class="text-2xl font-bold">0%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Volatility Chart */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-chart-line mr-3 text-cyan-400"></i>
                Volatility Tracking
              </h2>
              <canvas id="volatilityChart" height="200"></canvas>
            </div>

            {/* Market Pressure Map */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-map mr-3 text-indigo-400"></i>
                Market Pressure Systems
              </h2>
              <div class="grid grid-cols-3 gap-4">
                <div class="text-center p-4 bg-gray-700/50 rounded-lg">
                  <i class="fas fa-arrow-up text-3xl text-green-400 mb-2"></i>
                  <h3 class="font-bold">Buy Pressure</h3>
                  <p id="buyPressure" class="text-2xl">--</p>
                </div>
                <div class="text-center p-4 bg-gray-700/50 rounded-lg">
                  <i class="fas fa-balance-scale text-3xl text-yellow-400 mb-2"></i>
                  <h3 class="font-bold">Equilibrium</h3>
                  <p id="equilibrium" class="text-2xl">--</p>
                </div>
                <div class="text-center p-4 bg-gray-700/50 rounded-lg">
                  <i class="fas fa-arrow-down text-3xl text-red-400 mb-2"></i>
                  <h3 class="font-bold">Sell Pressure</h3>
                  <p id="sellPressure" class="text-2xl">--</p>
                </div>
              </div>
            </div>

            {/* Storm Timeline */}
            <div class="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fas fa-timeline mr-3 text-purple-400"></i>
                Storm Timeline
              </h2>
              <div id="stormTimeline" class="space-y-3">
                <p class="text-gray-400 text-center">Loading storm data...</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div class="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-thermometer-half text-2xl text-red-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">Market Temp</h3>
            <p id="marketTemp" class="text-xl font-bold">--°F</p>
          </div>
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-tachometer-alt text-2xl text-blue-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">Wind Speed</h3>
            <p id="windSpeed" class="text-xl font-bold">-- mph</p>
          </div>
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-compress-arrows-alt text-2xl text-purple-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">Pressure</h3>
            <p id="pressure" class="text-xl font-bold">-- mb</p>
          </div>
          <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-eye text-2xl text-yellow-400 mb-2"></i>
            <h3 class="text-sm text-gray-400">Visibility</h3>
            <p id="visibility" class="text-xl font-bold">-- mi</p>
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      <div id="loadingOverlay" class="fixed inset-0 bg-black/75 flex items-center justify-center hidden z-50">
        <div class="text-center">
          <div class="relative">
            <i class="fas fa-hurricane text-6xl text-yellow-400 animate-spin"></i>
          </div>
          <p class="mt-4 text-xl">Scanning Market Conditions...</p>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
      <script src="/static/hurricane.js"></script>
    </div>,
    { title: 'SPY Hurricane Tracker - Market Storm Analysis' }
  )
})

// API Routes
app.get('/api/spy/current', async (c) => {
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY
  
  try {
    const [spyResponse, vixResponse] = await Promise.all([
      fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${apiKey}`),
      fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=VIX&apikey=${apiKey}`)
    ])
    
    const [spyData, vixData] = await Promise.all([
      spyResponse.json(),
      vixResponse.json()
    ])
    
    return c.json({ spy: spyData, vix: vixData })
  } catch (error) {
    return c.json({ error: 'Failed to fetch market data' }, 500)
  }
})

app.get('/api/spy/intraday', async (c) => {
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY
  
  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=SPY&interval=5min&apikey=${apiKey}`
    )
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch intraday data' }, 500)
  }
})

app.get('/api/spy/daily', async (c) => {
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY
  
  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SPY&outputsize=compact&apikey=${apiKey}`
    )
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch daily data' }, 500)
  }
})

app.get('/api/spy/volatility', async (c) => {
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY
  
  try {
    // Get historical volatility data
    const response = await fetch(
      `https://www.alphavantage.co/query?function=BBANDS&symbol=SPY&interval=daily&time_period=20&series_type=close&apikey=${apiKey}`
    )
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch volatility data' }, 500)
  }
})

app.get('/api/market/indicators', async (c) => {
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY
  
  try {
    // Get RSI and other indicators
    const [rsiResponse, macdResponse] = await Promise.all([
      fetch(`https://www.alphavantage.co/query?function=RSI&symbol=SPY&interval=daily&time_period=14&series_type=close&apikey=${apiKey}`),
      fetch(`https://www.alphavantage.co/query?function=MACD&symbol=SPY&interval=daily&series_type=close&apikey=${apiKey}`)
    ])
    
    const [rsiData, macdData] = await Promise.all([
      rsiResponse.json(),
      macdResponse.json()
    ])
    
    return c.json({ rsi: rsiData, macd: macdData })
  } catch (error) {
    return c.json({ error: 'Failed to fetch indicators' }, 500)
  }
})

export default app