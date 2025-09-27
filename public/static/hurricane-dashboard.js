/**
 * Hurricane SPY Dashboard - Real-time predictions with confidence scoring
 */

// Configuration
const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d'];
const CONFIDENCE_THRESHOLD = 0.75; // 75% minimum for high confidence trades
const UPDATE_INTERVAL = 30000; // Update every 30 seconds

// State management
let currentPredictions = {};
let highConfidenceTrades = [];
let marketIndicators = {};
let systemHealth = { status: 'initializing', checks: [] };

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
    loadPredictions();
    startAutoRefresh();
});

/**
 * Initialize dashboard components
 */
function initializeDashboard() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    initializeCharts();
}

/**
 * Update current time display
 */
function updateCurrentTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    const dateStr = now.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    
    const timeEl = document.getElementById('currentTime');
    if (timeEl) {
        timeEl.innerHTML = `${dateStr} ${timeStr}`;
    }
}

/**
 * Load all predictions from API
 */
async function loadPredictions() {
    try {
        // Show loading state
        showLoadingState();
        
        // Fetch Hurricane predictions
        const [hurricaneData, marketData, healthData] = await Promise.all([
            axios.get('/api/meteorology/predict?symbol=SPY'),
            axios.get('/api/meteorology/regime?symbol=SPY'),
            axios.get('/api/meteorology/health')
        ]);
        
        // Process predictions
        processPredictions(hurricaneData.data);
        processMarketRegime(marketData.data);
        processHealthCheck(healthData.data);
        
        // Update UI components
        updateTimeframePredictions();
        updateHighConfidenceTrades();
        updateMarketIndicators();
        updateSystemStatus();
        
    } catch (error) {
        console.error('Error loading predictions:', error);
        showErrorState(error.message);
    }
}

/**
 * Process Hurricane predictions
 */
function processPredictions(data) {
    if (!data || !data.perTF) return;
    
    currentPredictions = {};
    highConfidenceTrades = [];
    
    // Process each timeframe
    TIMEFRAMES.forEach(tf => {
        const prediction = data.perTF.find(p => p.tf === tf);
        if (prediction) {
            currentPredictions[tf] = {
                direction: prediction.side,
                confidence: prediction.confidence,
                regime: prediction.regime,
                signal: prediction.signal || 0,
                targets: prediction.targets,
                stop: prediction.stop,
                kellySize: prediction.size,
                rMultiple: prediction.rMultiple
            };
            
            // Check for high confidence trades
            if (prediction.confidence >= CONFIDENCE_THRESHOLD && prediction.side !== 'NONE') {
                highConfidenceTrades.push({
                    timeframe: tf,
                    ...prediction
                });
            }
        }
    });
    
    // Sort high confidence trades by confidence
    highConfidenceTrades.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Process market regime data
 */
function processMarketRegime(data) {
    if (!data) return;
    
    marketIndicators = {
        regime: data.regime || 'Unknown',
        volatility: data.volatility || 0,
        trend: data.trend || 'Neutral',
        sentiment: data.sentiment || 'Neutral',
        vix: data.vix || 0,
        spy: data.spy || 0,
        indicators: data.indicators || {}
    };
}

/**
 * Process health check data
 */
function processHealthCheck(data) {
    if (!data) return;
    
    systemHealth = {
        status: data.overall ? 'healthy' : 'warning',
        checks: data.checks || [],
        summary: data.summary || ''
    };
}

/**
 * Update timeframe predictions display
 */
function updateTimeframePredictions() {
    const container = document.getElementById('timeframePredictions');
    if (!container) return;
    
    let html = '';
    
    TIMEFRAMES.forEach(tf => {
        const pred = currentPredictions[tf];
        if (!pred) {
            html += createTimeframeCard(tf, null);
            return;
        }
        
        html += createTimeframeCard(tf, pred);
    });
    
    container.innerHTML = html;
}

/**
 * Create timeframe prediction card
 */
function createTimeframeCard(timeframe, prediction) {
    if (!prediction) {
        return `
            <div class="timeframe-card bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-lg font-bold">${timeframe.toUpperCase()}</span>
                    <span class="text-gray-500">No Data</span>
                </div>
            </div>
        `;
    }
    
    const directionColor = getDirectionColor(prediction.direction);
    const confidenceBar = createConfidenceBar(prediction.confidence);
    const regimeIcon = getRegimeIcon(prediction.regime);
    
    return `
        <div class="timeframe-card bg-gray-700/30 rounded-lg p-4 border border-gray-600 hover:border-blue-500 transition-all">
            <div class="flex justify-between items-center mb-3">
                <span class="text-lg font-bold text-white">${timeframe.toUpperCase()}</span>
                <span class="${directionColor} font-bold">${prediction.direction}</span>
            </div>
            
            <div class="space-y-2">
                <!-- Hurricane Strength -->
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-400">Signal</span>
                    <span class="text-sm font-mono">${(prediction.signal * 100).toFixed(1)}%</span>
                </div>
                
                <!-- Confidence -->
                <div>
                    <div class="flex justify-between text-xs mb-1">
                        <span class="text-gray-400">Confidence</span>
                        <span class="${prediction.confidence >= CONFIDENCE_THRESHOLD ? 'text-green-400' : 'text-yellow-400'}">
                            ${(prediction.confidence * 100).toFixed(1)}%
                        </span>
                    </div>
                    ${confidenceBar}
                </div>
                
                <!-- Regime -->
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-400">Regime</span>
                    <span class="flex items-center gap-1">
                        ${regimeIcon}
                        <span class="text-xs">${prediction.regime}</span>
                    </span>
                </div>
                
                <!-- Kelly Size -->
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-400">Kelly Size</span>
                    <span class="text-sm font-bold text-blue-400">
                        ${(prediction.kellySize * 100).toFixed(1)}%
                    </span>
                </div>
                
                <!-- Risk/Reward -->
                ${prediction.rMultiple ? `
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-400">R:R</span>
                    <span class="text-sm ${prediction.rMultiple.rr >= 2 ? 'text-green-400' : 'text-yellow-400'}">
                        1:${prediction.rMultiple.rr.toFixed(2)}
                    </span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Create confidence bar visualization
 */
function createConfidenceBar(confidence) {
    const percentage = confidence * 100;
    const color = confidence >= CONFIDENCE_THRESHOLD ? 'bg-green-500' : 
                  confidence >= 0.6 ? 'bg-yellow-500' : 
                  confidence >= 0.5 ? 'bg-orange-500' : 'bg-red-500';
    
    return `
        <div class="w-full bg-gray-600 rounded-full h-2">
            <div class="${color} h-2 rounded-full transition-all" style="width: ${percentage}%"></div>
        </div>
    `;
}

/**
 * Update high confidence trades display
 */
function updateHighConfidenceTrades() {
    const container = document.getElementById('highConfidenceTrades');
    if (!container) return;
    
    if (highConfidenceTrades.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-search text-3xl mb-3"></i>
                <p>No high confidence trades found</p>
                <p class="text-sm mt-2">Minimum confidence: ${(CONFIDENCE_THRESHOLD * 100)}%</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="space-y-4">';
    
    highConfidenceTrades.slice(0, 5).forEach((trade, index) => {
        html += createTradeCard(trade, index + 1);
    });
    
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Create high confidence trade card
 */
function createTradeCard(trade, rank) {
    const directionColor = trade.side === 'CALL' ? 'text-green-400' : 'text-red-400';
    const directionIcon = trade.side === 'CALL' ? 'fa-arrow-up' : 'fa-arrow-down';
    
    return `
        <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-600 hover:border-yellow-500 transition-all">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                    <span class="text-2xl font-bold text-yellow-400">#${rank}</span>
                    <div>
                        <span class="text-lg font-bold">${trade.tf.toUpperCase()}</span>
                        <span class="${directionColor} ml-2">
                            <i class="fas ${directionIcon}"></i> ${trade.side}
                        </span>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-bold text-green-400">
                        ${(trade.confidence * 100).toFixed(1)}%
                    </div>
                    <div class="text-xs text-gray-400">confidence</div>
                </div>
            </div>
            
            <div class="grid grid-cols-3 gap-4 text-sm">
                <!-- Entry -->
                <div>
                    <div class="text-xs text-gray-400 mb-1">Entry</div>
                    <div class="font-mono">$${trade.entryPx ? trade.entryPx.toFixed(2) : '--'}</div>
                </div>
                
                <!-- Target -->
                <div>
                    <div class="text-xs text-gray-400 mb-1">Target</div>
                    <div class="font-mono text-green-400">
                        $${trade.targets && trade.targets.target ? trade.targets.target.toFixed(2) : '--'}
                    </div>
                </div>
                
                <!-- Stop -->
                <div>
                    <div class="text-xs text-gray-400 mb-1">Stop</div>
                    <div class="font-mono text-red-400">
                        $${trade.stop ? trade.stop.toFixed(2) : '--'}
                    </div>
                </div>
            </div>
            
            <div class="mt-3 pt-3 border-t border-gray-700">
                <div class="grid grid-cols-3 gap-4 text-sm">
                    <!-- Position Size -->
                    <div>
                        <div class="text-xs text-gray-400 mb-1">Size (Kelly)</div>
                        <div class="font-bold text-blue-400">
                            ${(trade.size * 100).toFixed(1)}%
                        </div>
                    </div>
                    
                    <!-- Risk/Reward -->
                    <div>
                        <div class="text-xs text-gray-400 mb-1">Risk/Reward</div>
                        <div class="font-bold ${trade.rMultiple && trade.rMultiple.rr >= 2 ? 'text-green-400' : 'text-yellow-400'}">
                            1:${trade.rMultiple ? trade.rMultiple.rr.toFixed(2) : '--'}
                        </div>
                    </div>
                    
                    <!-- Option Strike -->
                    <div>
                        <div class="text-xs text-gray-400 mb-1">Strike</div>
                        <div class="font-bold">
                            ${trade.option && trade.option.strike ? `$${trade.option.strike}` : '--'}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Scaling Units -->
            <div class="mt-3 pt-3 border-t border-gray-700">
                <div class="text-xs text-gray-400 mb-2">Recommended Scaling (10k account)</div>
                <div class="grid grid-cols-3 gap-2 text-sm">
                    <div class="bg-gray-700/50 rounded px-2 py-1">
                        <span class="text-gray-400">1 unit:</span> 
                        <span class="font-bold">$${(10000 * trade.size * 0.33).toFixed(0)}</span>
                    </div>
                    <div class="bg-gray-700/50 rounded px-2 py-1">
                        <span class="text-gray-400">2 units:</span> 
                        <span class="font-bold">$${(10000 * trade.size * 0.66).toFixed(0)}</span>
                    </div>
                    <div class="bg-gray-700/50 rounded px-2 py-1">
                        <span class="text-gray-400">3 units:</span> 
                        <span class="font-bold">$${(10000 * trade.size).toFixed(0)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Update market indicators display
 */
function updateMarketIndicators() {
    const container = document.getElementById('marketIndicators');
    if (!container) return;
    
    const indicators = marketIndicators.indicators || {};
    
    container.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <!-- SPY Price -->
            <div class="bg-gray-800/50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-gray-400">SPY</span>
                    <i class="fas fa-chart-line text-blue-400"></i>
                </div>
                <div class="text-2xl font-bold">$${marketIndicators.spy || '--'}</div>
            </div>
            
            <!-- VIX Level -->
            <div class="bg-gray-800/50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-gray-400">VIX</span>
                    <i class="fas fa-bolt text-yellow-400"></i>
                </div>
                <div class="text-2xl font-bold ${getVIXColor(marketIndicators.vix)}">
                    ${marketIndicators.vix ? marketIndicators.vix.toFixed(2) : '--'}
                </div>
            </div>
            
            <!-- RSI -->
            <div class="bg-gray-800/50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-gray-400">RSI(14)</span>
                    ${getRSIIcon(indicators.rsi)}
                </div>
                <div class="text-xl font-bold ${getRSIColor(indicators.rsi)}">
                    ${indicators.rsi ? indicators.rsi.toFixed(1) : '--'}
                </div>
            </div>
            
            <!-- MACD -->
            <div class="bg-gray-800/50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-gray-400">MACD</span>
                    ${getMACDIcon(indicators.macd)}
                </div>
                <div class="text-xl font-bold ${getMACDColor(indicators.macd)}">
                    ${indicators.macd ? indicators.macd.toFixed(3) : '--'}
                </div>
            </div>
            
            <!-- ATR -->
            <div class="bg-gray-800/50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-gray-400">ATR</span>
                    <i class="fas fa-wave-square text-purple-400"></i>
                </div>
                <div class="text-xl font-bold">
                    ${indicators.atr ? `$${indicators.atr.toFixed(2)}` : '--'}
                </div>
            </div>
            
            <!-- Volume -->
            <div class="bg-gray-800/50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-gray-400">Volume</span>
                    <i class="fas fa-volume-up text-cyan-400"></i>
                </div>
                <div class="text-xl font-bold">
                    ${indicators.volumeRatio ? `${indicators.volumeRatio.toFixed(2)}x` : '--'}
                </div>
            </div>
        </div>
        
        <!-- Market Sentiment -->
        <div class="mt-4 bg-gray-800/50 rounded-lg p-4">
            <div class="flex items-center justify-between mb-3">
                <span class="text-lg font-bold">Market Sentiment</span>
                ${getSentimentIcon(marketIndicators.sentiment)}
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-gray-400">Regime:</span>
                    <span class="font-bold ${getRegimeColor(marketIndicators.regime)}">
                        ${marketIndicators.regime || 'Unknown'}
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-400">Trend:</span>
                    <span class="font-bold ${getTrendColor(marketIndicators.trend)}">
                        ${marketIndicators.trend || 'Neutral'}
                    </span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Update system status display
 */
function updateSystemStatus() {
    const statusEl = document.getElementById('systemStatus');
    const healthEl = document.getElementById('systemHealth');
    
    if (statusEl) {
        const isHealthy = systemHealth.status === 'healthy';
        statusEl.innerHTML = `
            <span class="${isHealthy ? 'text-green-400' : 'text-yellow-400'}">
                <i class="fas ${isHealthy ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
                ${isHealthy ? 'Active' : 'Warning'}
            </span>
        `;
    }
    
    if (healthEl && systemHealth.checks.length > 0) {
        const criticalIssues = systemHealth.checks.filter(c => c.severity === 'critical');
        const warnings = systemHealth.checks.filter(c => c.severity === 'warning');
        
        if (criticalIssues.length > 0 || warnings.length > 0) {
            let html = '<div class="mt-2 text-sm">';
            if (criticalIssues.length > 0) {
                html += '<div class="text-red-400">Critical: ' + criticalIssues.length + ' issues</div>';
            }
            if (warnings.length > 0) {
                html += '<div class="text-yellow-400">Warnings: ' + warnings.length + '</div>';
            }
            html += '</div>';
            healthEl.innerHTML = html;
        }
    }
}

/**
 * Helper functions for colors and icons
 */
function getDirectionColor(direction) {
    switch(direction) {
        case 'CALL':
        case 'STRONG_BUY':
        case 'BUY':
            return 'text-green-400';
        case 'PUT':
        case 'STRONG_SELL':
        case 'SELL':
            return 'text-red-400';
        default:
            return 'text-gray-400';
    }
}

function getRegimeIcon(regime) {
    const icons = {
        'Trend': '<i class="fas fa-arrow-trend-up text-blue-400"></i>',
        'Range': '<i class="fas fa-equals text-yellow-400"></i>',
        'VolExp': '<i class="fas fa-explosion text-red-400"></i>',
        'Flux': '<i class="fas fa-water text-cyan-400"></i>'
    };
    return icons[regime] || '<i class="fas fa-question text-gray-400"></i>';
}

function getVIXColor(vix) {
    if (!vix) return 'text-gray-400';
    if (vix < 15) return 'text-green-400';
    if (vix < 20) return 'text-yellow-400';
    if (vix < 25) return 'text-orange-400';
    return 'text-red-400';
}

function getRSIColor(rsi) {
    if (!rsi) return 'text-gray-400';
    if (rsi < 30) return 'text-red-400';
    if (rsi > 70) return 'text-green-400';
    return 'text-yellow-400';
}

function getRSIIcon(rsi) {
    if (!rsi) return '';
    if (rsi < 30) return '<i class="fas fa-arrow-down text-red-400"></i>';
    if (rsi > 70) return '<i class="fas fa-arrow-up text-green-400"></i>';
    return '<i class="fas fa-minus text-yellow-400"></i>';
}

function getMACDColor(macd) {
    if (!macd) return 'text-gray-400';
    return macd > 0 ? 'text-green-400' : 'text-red-400';
}

function getMACDIcon(macd) {
    if (!macd) return '';
    return macd > 0 ? 
        '<i class="fas fa-chevron-up text-green-400"></i>' : 
        '<i class="fas fa-chevron-down text-red-400"></i>';
}

function getRegimeColor(regime) {
    const colors = {
        'Trend': 'text-blue-400',
        'Range': 'text-yellow-400',
        'VolExp': 'text-red-400',
        'Flux': 'text-cyan-400'
    };
    return colors[regime] || 'text-gray-400';
}

function getTrendColor(trend) {
    if (!trend) return 'text-gray-400';
    if (trend.includes('Bull')) return 'text-green-400';
    if (trend.includes('Bear')) return 'text-red-400';
    return 'text-yellow-400';
}

function getSentimentIcon(sentiment) {
    if (!sentiment) return '';
    if (sentiment.includes('Bull')) return '<i class="fas fa-smile text-green-400"></i>';
    if (sentiment.includes('Bear')) return '<i class="fas fa-frown text-red-400"></i>';
    return '<i class="fas fa-meh text-yellow-400"></i>';
}

/**
 * Show loading state
 */
function showLoadingState() {
    const containers = [
        'timeframePredictions',
        'highConfidenceTrades',
        'marketIndicators'
    ];
    
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i>
                    <p class="mt-2 text-gray-400">Loading...</p>
                </div>
            `;
        }
    });
}

/**
 * Show error state
 */
function showErrorState(message) {
    const containers = [
        'timeframePredictions',
        'highConfidenceTrades',
        'marketIndicators'
    ];
    
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `
                <div class="text-center py-8 text-red-400">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                    <p>Error loading data</p>
                    <p class="text-sm mt-2">${message}</p>
                    <button onclick="loadPredictions()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Retry
                    </button>
                </div>
            `;
        }
    });
}

/**
 * Initialize charts
 */
function initializeCharts() {
    // Initialize confidence chart if needed
    const confidenceCanvas = document.getElementById('confidenceChart');
    if (confidenceCanvas) {
        // Chart initialization code
    }
}

/**
 * Start auto-refresh
 */
function startAutoRefresh() {
    setInterval(() => {
        loadPredictions();
    }, UPDATE_INTERVAL);
}

/**
 * Manual refresh function
 */
window.refreshPredictions = function() {
    loadPredictions();
};

// Export for global access
window.hurricaneDashboard = {
    loadPredictions,
    refreshPredictions: loadPredictions,
    getHighConfidenceTrades: () => highConfidenceTrades,
    getCurrentPredictions: () => currentPredictions
};