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

// Home page
app.get('/', (c) => {
  return c.render(
    <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div class="container mx-auto px-4 py-8">
        <header class="mb-8">
          <h1 class="text-4xl font-bold text-gray-800 mb-2">
            <i class="fas fa-chart-line mr-3 text-indigo-600"></i>
            Stock Market Dashboard
          </h1>
          <p class="text-gray-600">Real-time stock data powered by Alpha Vantage</p>
        </header>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Search Section */}
          <div class="lg:col-span-1">
            <div class="bg-white rounded-lg shadow-lg p-6">
              <h2 class="text-xl font-semibold mb-4 text-gray-800">
                <i class="fas fa-search mr-2"></i>Search Stock
              </h2>
              <div class="space-y-4">
                <input
                  type="text"
                  id="stockSymbol"
                  placeholder="Enter symbol (e.g., AAPL)"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select id="functionType" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="GLOBAL_QUOTE">Current Price</option>
                  <option value="TIME_SERIES_DAILY">Daily Series</option>
                  <option value="TIME_SERIES_WEEKLY">Weekly Series</option>
                  <option value="TIME_SERIES_MONTHLY">Monthly Series</option>
                </select>
                <button
                  onclick="fetchStockData()"
                  class="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <i class="fas fa-chart-bar mr-2"></i>Get Data
                </button>
              </div>

              {/* Popular Stocks */}
              <div class="mt-6">
                <h3 class="text-lg font-semibold mb-3 text-gray-700">Quick Access</h3>
                <div class="flex flex-wrap gap-2">
                  <button onclick="quickSearch('AAPL')" class="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm">AAPL</button>
                  <button onclick="quickSearch('GOOGL')" class="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm">GOOGL</button>
                  <button onclick="quickSearch('MSFT')" class="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm">MSFT</button>
                  <button onclick="quickSearch('AMZN')" class="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm">AMZN</button>
                  <button onclick="quickSearch('TSLA')" class="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm">TSLA</button>
                  <button onclick="quickSearch('META')" class="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm">META</button>
                </div>
              </div>
            </div>

            {/* Search Companies */}
            <div class="bg-white rounded-lg shadow-lg p-6 mt-6">
              <h2 class="text-xl font-semibold mb-4 text-gray-800">
                <i class="fas fa-building mr-2"></i>Search Companies
              </h2>
              <div class="space-y-4">
                <input
                  type="text"
                  id="companyKeywords"
                  placeholder="Company name or keywords"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onclick="searchCompanies()"
                  class="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <i class="fas fa-search mr-2"></i>Search
                </button>
              </div>
              <div id="searchResults" class="mt-4 max-h-64 overflow-y-auto"></div>
            </div>
          </div>

          {/* Data Display Section */}
          <div class="lg:col-span-2">
            {/* Current Quote Display */}
            <div id="quoteDisplay" class="bg-white rounded-lg shadow-lg p-6 mb-6 hidden">
              <h2 class="text-xl font-semibold mb-4 text-gray-800">
                <i class="fas fa-dollar-sign mr-2"></i>Current Quote
              </h2>
              <div id="quoteContent"></div>
            </div>

            {/* Chart Display */}
            <div class="bg-white rounded-lg shadow-lg p-6">
              <h2 class="text-xl font-semibold mb-4 text-gray-800">
                <i class="fas fa-chart-area mr-2"></i>Price Chart
              </h2>
              <canvas id="stockChart"></canvas>
              <div id="chartMessage" class="text-gray-500 text-center py-8">
                <i class="fas fa-info-circle text-4xl mb-2"></i>
                <p>Search for a stock to display chart data</p>
              </div>
            </div>

            {/* Time Series Table */}
            <div id="dataTable" class="bg-white rounded-lg shadow-lg p-6 mt-6 hidden">
              <h2 class="text-xl font-semibold mb-4 text-gray-800">
                <i class="fas fa-table mr-2"></i>Historical Data
              </h2>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead id="tableHead"></thead>
                  <tbody id="tableBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        <div id="loadingIndicator" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
          <div class="bg-white rounded-lg p-8 flex flex-col items-center">
            <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
            <p class="text-gray-700">Loading stock data...</p>
          </div>
        </div>

        {/* Error Display */}
        <div id="errorDisplay" class="fixed bottom-4 right-4 max-w-md hidden">
          <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg">
            <strong class="font-bold mr-2">Error!</strong>
            <span id="errorMessage"></span>
            <button onclick="document.getElementById('errorDisplay').classList.add('hidden')" class="ml-4">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
      <script src="/static/app.js"></script>
    </div>,
    { title: 'Stock Market Dashboard' }
  )
})

// API route for stock quote
app.get('/api/quote/:symbol', async (c) => {
  const symbol = c.req.param('symbol')
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
    )
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch stock data' }, 500)
  }
})

// API route for time series data
app.get('/api/timeseries/:function/:symbol', async (c) => {
  const functionType = c.req.param('function')
  const symbol = c.req.param('symbol')
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=${functionType}&symbol=${symbol}&apikey=${apiKey}`
    )
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch time series data' }, 500)
  }
})

// API route for symbol search
app.get('/api/search/:keywords', async (c) => {
  const keywords = c.req.param('keywords')
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${keywords}&apikey=${apiKey}`
    )
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to search symbols' }, 500)
  }
})

// API route for company overview
app.get('/api/company/:symbol', async (c) => {
  const symbol = c.req.param('symbol')
  const apiKey = c.env.ALPHA_VANTAGE_API_KEY

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`
    )
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch company overview' }, 500)
  }
})

export default app