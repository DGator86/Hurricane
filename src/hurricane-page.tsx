import { FC } from 'hono/jsx'

export const HurricaneDashboard: FC = () => {
  return (
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Animated background */}
      <div class="fixed inset-0 opacity-20 bg-grid"></div>
      
      <div class="relative z-10 container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <header class="text-center mb-6">
          <h1 class="text-4xl font-bold mb-2 flex items-center justify-center">
            <i class="fas fa-hurricane mr-3 text-yellow-400 animate-spin-slow"></i>
            Hurricane SPY Prediction System
            <i class="fas fa-chart-line ml-3 text-green-400"></i>
          </h1>
          <p class="text-lg text-gray-300">75% Accuracy Target • Kelly Criterion Position Sizing • Multi-Timeframe Analysis</p>
          <div class="mt-3 flex justify-center gap-6 text-sm">
            <div>
              <i class="fas fa-clock mr-1"></i>
              <span id="currentTime">Loading...</span>
            </div>
            <div>
              <i class="fas fa-server mr-1 text-green-400"></i>
              <span>System Active</span>
            </div>
            <div id="systemHealth"></div>
          </div>
        </header>

        {/* Main Content Grid */}
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Left Column - Timeframe Predictions */}
          <div class="xl:col-span-1">
            <div class="bg-gray-800/60 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
              <h2 class="text-xl font-bold mb-4 flex items-center justify-between">
                <span>
                  <i class="fas fa-clock mr-2 text-blue-400"></i>
                  Hurricane Signals
                </span>
                <button onclick="refreshPredictions()" class="text-sm bg-blue-600/20 hover:bg-blue-600/30 px-3 py-1 rounded-lg transition-colors">
                  <i class="fas fa-sync mr-1"></i>
                  Refresh
                </button>
              </h2>
              
              {/* Timeframe Grid */}
              <div id="timeframePredictions" class="grid grid-cols-2 gap-3">
                {/* Populated by JavaScript */}
                <div class="text-center py-8 col-span-2">
                  <i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i>
                  <p class="mt-2 text-gray-400">Loading predictions...</p>
                </div>
              </div>
            </div>
          </div>

          {/* Center Column - High Confidence Trades */}
          <div class="xl:col-span-1">
            <div class="bg-gray-800/60 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
              <h2 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-rocket mr-2 text-yellow-400"></i>
                High Confidence Trades
                <span class="ml-auto text-sm text-gray-400">≥75% Confidence</span>
              </h2>
              
              <div id="highConfidenceTrades" class="space-y-3">
                {/* Populated by JavaScript */}
                <div class="text-center py-8 text-gray-400">
                  <i class="fas fa-search text-3xl mb-3"></i>
                  <p>Scanning for opportunities...</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Market Indicators */}
          <div class="xl:col-span-1">
            <div class="bg-gray-800/60 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
              <h2 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-chart-bar mr-2 text-purple-400"></i>
                Real-Time SPY Indicators
              </h2>
              
              <div id="marketIndicators">
                {/* Populated by JavaScript */}
                <div class="text-center py-8">
                  <i class="fas fa-spinner fa-spin text-3xl text-purple-400"></i>
                  <p class="mt-2 text-gray-400">Loading indicators...</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section - Performance Metrics */}
        <div class="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-dollar-sign text-2xl text-green-400 mb-2"></i>
            <div class="text-xs text-gray-400">SPY Price</div>
            <div id="spyPrice" class="text-xl font-bold">--</div>
          </div>
          
          <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-bolt text-2xl text-yellow-400 mb-2"></i>
            <div class="text-xs text-gray-400">VIX Level</div>
            <div id="vixLevel" class="text-xl font-bold">--</div>
          </div>
          
          <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-percentage text-2xl text-blue-400 mb-2"></i>
            <div class="text-xs text-gray-400">Accuracy</div>
            <div id="accuracy" class="text-xl font-bold">--</div>
          </div>
          
          <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-trophy text-2xl text-yellow-400 mb-2"></i>
            <div class="text-xs text-gray-400">Win Rate</div>
            <div id="winRate" class="text-xl font-bold">--</div>
          </div>
          
          <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-chart-line text-2xl text-purple-400 mb-2"></i>
            <div class="text-xs text-gray-400">Sharpe</div>
            <div id="sharpeRatio" class="text-xl font-bold">--</div>
          </div>
          
          <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 text-center border border-gray-700">
            <i class="fas fa-heartbeat text-2xl text-red-400 mb-2"></i>
            <div class="text-xs text-gray-400">Status</div>
            <div id="systemStatus" class="text-xl font-bold text-green-400">Active</div>
          </div>
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        .bg-grid {
          background-image: 
            linear-gradient(to right, rgba(59, 130, 246, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(59, 130, 246, 0.1) 1px, transparent 1px);
          background-size: 50px 50px;
        }
      `}</style>

      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
      <script src="/static/hurricane-dashboard.js"></script>
      <script src="/static/hurricane-enhanced.js"></script>
    </div>
  )
}