// Enhanced Hurricane Dashboard with Options Pricing and Backtesting

let backtestingData = null;
let optionsData = null;

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
}

// Format percentage
function formatPercent(value, decimals = 2) {
    return `${(value * 100).toFixed(decimals)}%`;
}

// Get color for percentage
function getPercentColor(value, isAccuracy = false) {
    if (isAccuracy) {
        return value >= 75 ? 'text-green-400' : value >= 60 ? 'text-yellow-400' : 'text-red-400';
    }
    return value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-gray-400';
}

// Render timeframe prediction with option recommendation
function renderTimeframePrediction(timeframe, prediction, optionRec) {
    const directionIcon = prediction.direction === 'bullish' ? '↑' : 
                         prediction.direction === 'bearish' ? '↓' : '→';
    const directionColor = prediction.direction === 'bullish' ? 'text-green-400' : 
                          prediction.direction === 'bearish' ? 'text-red-400' : 'text-gray-400';
    const confidenceColor = prediction.confidence >= 0.75 ? 'text-green-400' :
                           prediction.confidence >= 0.60 ? 'text-yellow-400' : 'text-red-400';
    
    let optionHtml = '';
    if (optionRec) {
        optionHtml = `
            <div class="mt-2 p-2 bg-gray-900/50 rounded-lg text-xs">
                <div class="font-bold text-blue-400 mb-1">
                    ${optionRec.type.toUpperCase()} $${optionRec.strike} 
                    <span class="text-gray-500">(${optionRec.daysToExpiry}DTE)</span>
                </div>
                <div class="grid grid-cols-2 gap-1 text-gray-300">
                    <div>Cost: <span class="text-white">${optionRec.cost.toFixed(2)}</span></div>
                    <div>Target: <span class="text-green-400">${optionRec.target.toFixed(2)}</span></div>
                </div>
                <div class="mt-1 grid grid-cols-4 gap-1 text-gray-400">
                    <div title="Delta">Δ: ${optionRec.delta.toFixed(2)}</div>
                    <div title="Gamma">Γ: ${optionRec.gamma.toFixed(3)}</div>
                    <div title="Theta">Θ: ${optionRec.theta.toFixed(2)}</div>
                    <div title="Vega">V: ${optionRec.vega.toFixed(2)}</div>
                </div>
                <div class="mt-1 text-center">
                    <span class="text-yellow-400">R/R: ${optionRec.riskRewardRatio.toFixed(2)}</span>
                    <span class="ml-2 text-cyan-400">EV: ${optionRec.expectedValue.toFixed(2)}</span>
                </div>
            </div>
        `;
    }
    
    // Technical indicators for this timeframe
    const technicals = prediction.technicalSignals || {};
    const techHtml = `
        <div class="mt-1 grid grid-cols-2 gap-1 text-xs">
            <div class="${getTechnicalColor(technicals.rsi)}">RSI: ${technicals.rsi || 'N/A'}</div>
            <div class="${getTechnicalColor(technicals.macd)}">MACD: ${technicals.macd || 'N/A'}</div>
        </div>
    `;
    
    return `
        <div class="bg-gray-700/50 rounded-lg p-3">
            <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-bold">${timeframe}</span>
                <span class="${directionColor} text-2xl">${directionIcon}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <span class="text-gray-400">Confidence:</span>
                    <span class="${confidenceColor} font-bold ml-1">
                        ${formatPercent(prediction.confidence)}
                    </span>
                </div>
                <div>
                    <span class="text-gray-400">Kelly:</span>
                    <span class="text-cyan-400 font-bold ml-1">
                        ${formatPercent(prediction.positionSize)}
                    </span>
                </div>
            </div>
            ${techHtml}
            ${optionHtml}
        </div>
    `;
}

// Get color for technical indicator
function getTechnicalColor(value) {
    if (!value) return 'text-gray-500';
    if (value === 'Bullish' || value === 'Oversold') return 'text-green-400';
    if (value === 'Bearish' || value === 'Overbought') return 'text-red-400';
    return 'text-gray-400';
}

// Render high confidence trade card
function renderHighConfidenceTrade(prediction, optionRec) {
    if (prediction.confidence < 0.75) return '';
    
    const greeksDisplay = optionRec ? `
        <div class="mt-2 p-2 bg-gray-900/50 rounded text-xs">
            <div class="grid grid-cols-5 gap-1 text-center">
                <div>
                    <div class="text-gray-500">Delta</div>
                    <div class="text-white">${optionRec.delta.toFixed(3)}</div>
                </div>
                <div>
                    <div class="text-gray-500">Gamma</div>
                    <div class="text-white">${optionRec.gamma.toFixed(4)}</div>
                </div>
                <div>
                    <div class="text-gray-500">Theta</div>
                    <div class="text-red-400">${optionRec.theta.toFixed(3)}</div>
                </div>
                <div>
                    <div class="text-gray-500">Vega</div>
                    <div class="text-white">${optionRec.vega.toFixed(3)}</div>
                </div>
                <div>
                    <div class="text-gray-500">Rho</div>
                    <div class="text-white">${optionRec.rho.toFixed(3)}</div>
                </div>
            </div>
        </div>
    ` : '';
    
    return `
        <div class="bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg p-4 border border-green-700/50">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <span class="text-lg font-bold">${prediction.timeframe}</span>
                    <span class="ml-2 text-sm ${prediction.direction === 'bullish' ? 'text-green-400' : 'text-red-400'}">
                        ${prediction.direction.toUpperCase()}
                    </span>
                </div>
                <span class="text-lg font-bold text-yellow-400">
                    ${formatPercent(prediction.confidence)}
                </span>
            </div>
            
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div>
                    <span class="text-gray-400">Entry:</span>
                    <span class="ml-1">${formatCurrency(prediction.entryPrice)}</span>
                </div>
                <div>
                    <span class="text-gray-400">Target:</span>
                    <span class="ml-1 text-green-400">${formatCurrency(prediction.targetPrice)}</span>
                </div>
                <div>
                    <span class="text-gray-400">Stop:</span>
                    <span class="ml-1 text-red-400">${formatCurrency(prediction.stopLoss)}</span>
                </div>
                <div>
                    <span class="text-gray-400">R/R:</span>
                    <span class="ml-1 text-cyan-400">${prediction.riskRewardRatio.toFixed(2)}</span>
                </div>
            </div>
            
            ${optionRec ? `
                <div class="mt-3 p-2 bg-blue-900/30 rounded">
                    <div class="text-sm font-bold text-blue-400 mb-1">
                        Recommended: ${optionRec.type.toUpperCase()} $${optionRec.strike}
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-xs">
                        <div>
                            <span class="text-gray-400">Cost:</span>
                            <span class="ml-1 text-white font-bold">${formatCurrency(optionRec.cost)}</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Target:</span>
                            <span class="ml-1 text-green-400">${formatCurrency(optionRec.target)}</span>
                        </div>
                        <div>
                            <span class="text-gray-400">EV:</span>
                            <span class="ml-1 text-cyan-400">${formatCurrency(optionRec.expectedValue)}</span>
                        </div>
                    </div>
                    ${greeksDisplay}
                </div>
            ` : ''}
        </div>
    `;
}

// Render backtesting accuracy box
function renderBacktestingAccuracy() {
    if (!backtestingData) {
        return `
            <div class="bg-gray-800/60 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
                <h2 class="text-xl font-bold mb-4 flex items-center">
                    <i class="fas fa-history mr-2 text-orange-400"></i>
                    Backtesting Accuracy (30 Days)
                </h2>
                <div class="text-center py-8 text-gray-400">
                    <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
                    <p>Loading historical accuracy...</p>
                </div>
            </div>
        `;
    }
    
    const { metrics, overallStats } = backtestingData;
    
    return `
        <div class="bg-gray-800/60 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
            <h2 class="text-xl font-bold mb-4 flex items-center">
                <i class="fas fa-history mr-2 text-orange-400"></i>
                Backtesting Accuracy (30 Days)
                <span class="ml-auto text-sm text-gray-400">
                    ${overallStats.totalPredictions} trades
                </span>
            </h2>
            
            <div class="grid grid-cols-5 gap-3 mb-4">
                ${['15m', '30m', '1h', '4h', '1d'].map(period => {
                    const m = metrics[period];
                    if (!m) return '';
                    const accuracyColor = getPercentColor(m.directionAccuracy / 100, true);
                    return `
                        <div class="text-center">
                            <div class="text-xs text-gray-400 mb-1">${period}</div>
                            <div class="${accuracyColor} text-lg font-bold">
                                ${m.directionAccuracy.toFixed(1)}%
                            </div>
                            <div class="text-xs text-gray-500">
                                ${m.totalPredictions} trades
                            </div>
                            <div class="text-xs mt-1">
                                <span class="text-green-400">W: ${m.winRate.toFixed(0)}%</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="border-t border-gray-700 pt-3">
                <div class="grid grid-cols-3 gap-3 text-sm">
                    <div>
                        <span class="text-gray-400">Overall Win Rate:</span>
                        <span class="${getPercentColor(overallStats.winRate / 100, true)} font-bold ml-1">
                            ${overallStats.winRate.toFixed(1)}%
                        </span>
                    </div>
                    <div>
                        <span class="text-gray-400">Profit Factor:</span>
                        <span class="text-cyan-400 font-bold ml-1">
                            ${overallStats.profitFactor.toFixed(2)}
                        </span>
                    </div>
                    <div>
                        <span class="text-gray-400">Sharpe Ratio:</span>
                        <span class="text-purple-400 font-bold ml-1">
                            ${overallStats.sharpeRatio.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Load enhanced predictions with options and backtesting
async function loadEnhancedPredictions() {
    try {
        // Try enhanced API first, fall back to production API
        let predictions, optionsData, backtestingData;
        
        try {
            // Fetch enhanced predictions with options
            const enhancedResponse = await axios.get('/api/enhanced/predictions-with-options');
            predictions = enhancedResponse.data;
            optionsData = { recommendations: enhancedResponse.data.options };
        } catch (e) {
            // Fall back to regular production API
            const predictionsResponse = await axios.get('/api/production/predictions');
            predictions = predictionsResponse.data;
            
            // Try to get options separately
            try {
                const optionsResponse = await axios.get('/api/enhanced/options-recommendations');
                optionsData = optionsResponse.data;
            } catch (e2) {
                console.log('Options recommendations not available');
            }
        }
        
        // Fetch backtesting data from enhanced API
        try {
            const backtestResponse = await axios.get('/api/enhanced/backtesting');
            backtestingData = backtestResponse.data;
        } catch (e) {
            console.log('Backtesting data not available');
        }
        
        // Update timeframe predictions with options
        const timeframeGrid = document.getElementById('timeframePredictions');
        if (timeframeGrid && predictions.predictions) {
            timeframeGrid.innerHTML = Object.entries(predictions.predictions)
                .map(([tf, pred]) => {
                    const optionRec = optionsData?.recommendations?.[tf];
                    return renderTimeframePrediction(tf, pred, optionRec);
                })
                .join('');
        }
        
        // Update high confidence trades
        const highConfContainer = document.getElementById('highConfidenceTrades');
        if (highConfContainer && predictions.predictions) {
            const highConfTrades = Object.entries(predictions.predictions)
                .filter(([_, pred]) => pred.confidence >= 0.75)
                .sort((a, b) => b[1].confidence - a[1].confidence);
            
            if (highConfTrades.length > 0) {
                highConfContainer.innerHTML = highConfTrades
                    .map(([tf, pred]) => {
                        const optionRec = optionsData?.recommendations?.[tf];
                        return renderHighConfidenceTrade(pred, optionRec);
                    })
                    .join('');
            } else {
                highConfContainer.innerHTML = `
                    <div class="text-center py-8 text-gray-400">
                        <i class="fas fa-search text-3xl mb-3"></i>
                        <p>No high confidence trades available</p>
                        <p class="text-xs mt-1">Waiting for ≥75% confidence signals</p>
                    </div>
                `;
            }
        }
        
        // Add backtesting accuracy display
        const metricsContainer = document.querySelector('.grid.grid-cols-2.md\\:grid-cols-4.lg\\:grid-cols-6');
        if (metricsContainer && !document.getElementById('backtestingAccuracy')) {
            const backtestingElement = document.createElement('div');
            backtestingElement.id = 'backtestingAccuracy';
            backtestingElement.className = 'col-span-full mt-6';
            backtestingElement.innerHTML = renderBacktestingAccuracy();
            metricsContainer.parentElement.appendChild(backtestingElement);
        } else if (document.getElementById('backtestingAccuracy')) {
            document.getElementById('backtestingAccuracy').innerHTML = renderBacktestingAccuracy();
        }
        
        // Update market indicators
        const indicatorsContainer = document.getElementById('marketIndicators');
        if (indicatorsContainer && predictions.technicals) {
            const tech = predictions.technicals['1h'] || {};
            indicatorsContainer.innerHTML = `
                <div class="space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">RSI(14)</span>
                        <span class="${getRSIColor(tech.rsi)} font-bold">
                            ${tech.rsi?.toFixed(2) || '--'}
                            ${getRSILabel(tech.rsi)}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">MACD</span>
                        <span class="${tech.macdCross === 'bullish_cross' ? 'text-green-400' : 
                                       tech.macdCross === 'bearish_cross' ? 'text-red-400' : 
                                       'text-gray-400'} font-bold">
                            ${tech.macdCross || 'Neutral'}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Bollinger</span>
                        <span class="${tech.bollingerPosition === 'oversold' ? 'text-green-400' :
                                       tech.bollingerPosition === 'overbought' ? 'text-red-400' :
                                       'text-gray-400'} font-bold">
                            ${tech.bollingerPosition || 'Neutral'}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Trend</span>
                        <span class="${tech.trend === 'bullish' ? 'text-green-400' :
                                       tech.trend === 'bearish' ? 'text-red-400' :
                                       'text-gray-400'} font-bold">
                            ${tech.trend?.toUpperCase() || 'NEUTRAL'}
                        </span>
                    </div>
                </div>
            `;
        }
        
        // Update bottom metrics
        if (predictions.marketData) {
            updateMetric('spyPrice', predictions.marketData.price, formatCurrency);
            updateMetric('vixLevel', predictions.marketData.vix?.toFixed(2) || '--');
        }
        
        if (backtestingData?.overallStats) {
            updateMetric('accuracy', `${backtestingData.overallStats.winRate.toFixed(1)}%`);
            updateMetric('winRate', `${backtestingData.overallStats.winRate.toFixed(1)}%`);
            updateMetric('sharpeRatio', backtestingData.overallStats.sharpeRatio.toFixed(2));
        }
        
    } catch (error) {
        console.error('Error loading enhanced predictions:', error);
    }
}

// Helper functions
function getRSIColor(rsi) {
    if (!rsi) return 'text-gray-400';
    if (rsi < 30) return 'text-green-400';
    if (rsi > 70) return 'text-red-400';
    return 'text-gray-400';
}

function getRSILabel(rsi) {
    if (!rsi) return '';
    if (rsi < 30) return ' (Oversold)';
    if (rsi > 70) return ' (Overbought)';
    return '';
}

function updateMetric(id, value, formatter) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = formatter ? formatter(value) : value;
    }
}

// Auto-refresh every 30 seconds
setInterval(loadEnhancedPredictions, 30000);

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    loadEnhancedPredictions();
    
    // Update time
    setInterval(() => {
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = new Date().toLocaleTimeString();
        }
    }, 1000);
});

// Export for use by other scripts
window.loadEnhancedPredictions = loadEnhancedPredictions;
window.refreshPredictions = loadEnhancedPredictions;