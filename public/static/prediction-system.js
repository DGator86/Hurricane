// Hurricane SPY Advanced Prediction System - Frontend

// Global variables
let confidenceChart = null;
let intensityGauge = null;
let predictions = [];
let currentPrediction = null;
let autoRefreshInterval = null;

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initializeCharts();
  updateDateTime();
  loadPredictions();
  loadPerformanceMetrics();
  
  // Auto-refresh every 30 seconds
  autoRefreshInterval = setInterval(() => {
    loadPredictions();
  }, 30000);
  
  // Update time every second
  setInterval(updateDateTime, 1000);
});

// Initialize charts
function initializeCharts() {
  // Confidence Chart
  const confCtx = document.getElementById('confidenceChart');
  if (confCtx) {
    confidenceChart = new Chart(confCtx, {
      type: 'bar',
      data: {
        labels: ['15m', '1h', '4h', '1d', '1w'],
        datasets: [{
          label: 'Prediction Confidence',
          data: [0, 0, 0, 0, 0],
          backgroundColor: [
            'rgba(255, 99, 132, 0.5)',
            'rgba(54, 162, 235, 0.5)',
            'rgba(255, 206, 86, 0.5)',
            'rgba(75, 192, 192, 0.5)',
            'rgba(153, 102, 255, 0.5)'
          ],
          borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(153, 102, 255, 1)'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 1,
            ticks: {
              callback: function(value) {
                return (value * 100).toFixed(0) + '%';
              },
              color: '#9CA3AF'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          x: {
            ticks: {
              color: '#9CA3AF'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return 'Confidence: ' + (context.parsed.y * 100).toFixed(1) + '%';
              }
            }
          }
        }
      }
    });
  }

  // Intensity Gauge (simplified circular display)
  const gaugeCtx = document.getElementById('intensityGauge');
  if (gaugeCtx) {
    intensityGauge = new Chart(gaugeCtx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [0, 5],
          backgroundColor: [
            'rgba(255, 99, 132, 0.8)',
            'rgba(75, 85, 99, 0.2)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        circumference: 180,
        rotation: 270,
        cutout: '75%',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: false
          }
        }
      }
    });
  }
}

// Load predictions from API
async function loadPredictions() {
  try {
    // Load all predictions
    const response = await axios.get('/api/predict/all');
    predictions = response.data.predictions;
    
    // Update UI
    displayTimeframePredictions(predictions);
    updateConfidenceChart(predictions);
    
    // Load primary prediction
    const primaryResponse = await axios.get('/api/predict/current');
    currentPrediction = primaryResponse.data.prediction;
    displayPrimaryPrediction(currentPrediction);
    updateHurricaneIntensity(currentPrediction.hurricaneIntensity);
    
    // Load options recommendations
    const optionsResponse = await axios.get('/api/options/recommendations/all');
    displayOptionsRecommendations(optionsResponse.data.recommendations);
    
    // Load technical indicators
    const indicatorsResponse = await axios.get('/api/realmarket/indicators');
    updateTechnicalIndicators(indicatorsResponse.data);
    
    // Update market data
    document.getElementById('spyPrice').textContent = '$' + primaryResponse.data.price.toFixed(2);
    document.getElementById('vixLevel').textContent = primaryResponse.data.vix.toFixed(2);
    
  } catch (error) {
    console.error('Error loading predictions:', error);
  }
}

// Display timeframe predictions
function displayTimeframePredictions(predictions) {
  const container = document.getElementById('timeframePredictions');
  if (!container) return;
  
  container.innerHTML = predictions.map(pred => {
    const directionIcon = pred.direction === 'bullish' ? 'fa-arrow-up text-green-400' : 
                         pred.direction === 'bearish' ? 'fa-arrow-down text-red-400' : 
                         'fa-minus text-yellow-400';
    
    const confidenceColor = pred.confidence > 0.7 ? 'text-green-400' : 
                           pred.confidence > 0.5 ? 'text-yellow-400' : 'text-red-400';
    
    return `
      <div class="p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700/70 transition-colors cursor-pointer">
        <div class="flex justify-between items-center">
          <div>
            <span class="font-bold">${pred.timeframe}</span>
            <i class="fas ${directionIcon} ml-2"></i>
          </div>
          <div class="${confidenceColor} text-right">
            <div class="text-sm">${(pred.confidence * 100).toFixed(1)}%</div>
            <div class="text-xs text-gray-400">${(pred.positionSize * 100).toFixed(1)}% pos</div>
          </div>
        </div>
        <div class="mt-2 text-xs text-gray-400">
          <div>Return: ${(pred.expectedReturn * 100).toFixed(2)}%</div>
          <div>R:R: ${pred.riskRewardRatio.toFixed(2)}:1</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Update position sizing display
  const sizingContainer = document.getElementById('positionSizing');
  if (sizingContainer) {
    sizingContainer.innerHTML = predictions.map(pred => `
      <div class="flex justify-between text-sm">
        <span class="text-gray-400">${pred.timeframe}:</span>
        <span class="${pred.positionSize > 0.15 ? 'text-green-400' : 'text-yellow-400'}">
          ${(pred.positionSize * 100).toFixed(1)}%
        </span>
      </div>
    `).join('');
  }
}

// Display primary prediction
function displayPrimaryPrediction(prediction) {
  const container = document.getElementById('primaryPrediction');
  if (!container) return;
  
  const directionColor = prediction.direction === 'bullish' ? 'text-green-400' : 
                        prediction.direction === 'bearish' ? 'text-red-400' : 'text-yellow-400';
  
  container.innerHTML = `
    <div class="space-y-3">
      <div>
        <p class="text-gray-400 text-sm">Direction</p>
        <p class="text-2xl font-bold ${directionColor}">${prediction.direction.toUpperCase()}</p>
      </div>
      <div>
        <p class="text-gray-400 text-sm">Expected Return</p>
        <p class="text-xl font-bold">${(prediction.expectedReturn * 100).toFixed(2)}%</p>
      </div>
      <div>
        <p class="text-gray-400 text-sm">Confidence</p>
        <div class="flex items-center">
          <div class="flex-1 bg-gray-700 rounded-full h-4 mr-2">
            <div class="bg-blue-500 h-4 rounded-full" style="width: ${prediction.confidence * 100}%"></div>
          </div>
          <span class="text-lg font-bold">${(prediction.confidence * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
    <div class="space-y-3">
      <div>
        <p class="text-gray-400 text-sm">Entry Price</p>
        <p class="text-xl font-bold">$${prediction.entryPrice.toFixed(2)}</p>
      </div>
      <div>
        <p class="text-gray-400 text-sm">Target</p>
        <p class="text-xl font-bold text-green-400">$${prediction.targetPrice.toFixed(2)}</p>
      </div>
      <div>
        <p class="text-gray-400 text-sm">Stop Loss</p>
        <p class="text-xl font-bold text-red-400">$${prediction.stopLoss.toFixed(2)}</p>
      </div>
    </div>
  `;
  
  // Update risk/reward ratio
  document.getElementById('rrRatio').textContent = prediction.riskRewardRatio.toFixed(2) + ':1';
}

// Update confidence chart
function updateConfidenceChart(predictions) {
  if (!confidenceChart) return;
  
  const labels = predictions.map(p => p.timeframe);
  const data = predictions.map(p => p.confidence);
  
  confidenceChart.data.labels = labels;
  confidenceChart.data.datasets[0].data = data;
  confidenceChart.update();
}

// Update hurricane intensity
function updateHurricaneIntensity(level) {
  const levelElement = document.getElementById('hurricaneLevel');
  const nameElement = document.getElementById('hurricaneName');
  
  const hurricaneNames = [
    'Calm Seas',
    'Light Breeze',
    'Tropical Depression',
    'Tropical Storm',
    'Category 1 Hurricane',
    'Category 5 Hurricane'
  ];
  
  if (levelElement) levelElement.textContent = level;
  if (nameElement) nameElement.textContent = hurricaneNames[level] || 'Unknown';
  
  // Update gauge
  if (intensityGauge) {
    intensityGauge.data.datasets[0].data = [level, 5 - level];
    
    // Update color based on intensity
    const colors = [
      'rgba(75, 192, 192, 0.8)',   // Green
      'rgba(255, 206, 86, 0.8)',   // Yellow
      'rgba(255, 159, 64, 0.8)',   // Orange
      'rgba(255, 99, 132, 0.8)',    // Red
      'rgba(153, 102, 255, 0.8)',   // Purple
      'rgba(139, 69, 19, 0.8)'      // Dark red
    ];
    
    intensityGauge.data.datasets[0].backgroundColor[0] = colors[level] || colors[0];
    intensityGauge.update();
  }
}

// Display options recommendations
function displayOptionsRecommendations(recommendations) {
  const container = document.getElementById('optionsRecommendations');
  if (!container) return;
  
  container.innerHTML = recommendations.slice(0, 3).map(rec => {
    const typeColor = rec.type === 'call' ? 'text-green-400' : 'text-red-400';
    const confidenceColor = rec.confidence > 0.7 ? 'text-green-400' : 
                           rec.confidence > 0.5 ? 'text-yellow-400' : 'text-red-400';
    
    return `
      <div class="p-3 bg-gray-700/50 rounded-lg">
        <div class="flex justify-between items-center mb-2">
          <span class="font-bold ${typeColor}">${rec.type.toUpperCase()}</span>
          <span class="text-sm">${rec.timeframe}</span>
        </div>
        <div class="text-sm space-y-1">
          <div class="flex justify-between">
            <span class="text-gray-400">Strike:</span>
            <span>$${rec.strike.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Entry:</span>
            <span>$${rec.entry.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Target:</span>
            <span class="text-green-400">$${rec.target.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">R:R:</span>
            <span>${rec.riskRewardRatio.toFixed(2)}:1</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Conf:</span>
            <span class="${confidenceColor}">${(rec.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Update Greeks display (using first recommendation)
  if (recommendations.length > 0) {
    const rec = recommendations[0];
    document.getElementById('deltaValue').textContent = rec.delta.toFixed(3);
    document.getElementById('gammaValue').textContent = rec.gamma.toFixed(3);
    document.getElementById('thetaValue').textContent = rec.theta.toFixed(3);
    document.getElementById('vegaValue').textContent = rec.vega.toFixed(3);
  }
}

// Update technical indicators
function updateTechnicalIndicators(indicators) {
  // RSI
  const rsiElement = document.getElementById('rsiValue');
  if (rsiElement) {
    const rsiValue = indicators.rsi;
    let rsiText = rsiValue.toFixed(1);
    let rsiClass = '';
    
    if (rsiValue > 70) {
      rsiText += ' OB';
      rsiClass = 'text-red-400';
    } else if (rsiValue < 30) {
      rsiText += ' OS';
      rsiClass = 'text-green-400';
    }
    
    rsiElement.textContent = rsiText;
    rsiElement.className = 'text-xl font-bold ' + rsiClass;
  }
  
  // MACD
  const macdElement = document.getElementById('macdValue');
  if (macdElement) {
    const macdValue = indicators.macd.histogram;
    macdElement.textContent = macdValue > 0 ? 'Bullish' : 'Bearish';
    macdElement.className = 'text-xl font-bold ' + (macdValue > 0 ? 'text-green-400' : 'text-red-400');
  }
  
  // Bollinger Bands
  const bbElement = document.getElementById('bbValue');
  if (bbElement) {
    const price = indicators.ma5; // Using MA5 as proxy for current price
    const bb = indicators.bollingerBands;
    
    if (price > bb.upper) {
      bbElement.textContent = 'Above';
      bbElement.className = 'text-xl font-bold text-red-400';
    } else if (price < bb.lower) {
      bbElement.textContent = 'Below';
      bbElement.className = 'text-xl font-bold text-green-400';
    } else {
      bbElement.textContent = 'Inside';
      bbElement.className = 'text-xl font-bold text-yellow-400';
    }
  }
  
  // Moving Average Trend
  const maElement = document.getElementById('maValue');
  if (maElement) {
    const bullish = indicators.ma5 > indicators.ma20 && indicators.ma20 > indicators.ma50;
    const bearish = indicators.ma5 < indicators.ma20 && indicators.ma20 < indicators.ma50;
    
    if (bullish) {
      maElement.textContent = 'Bullish';
      maElement.className = 'text-xl font-bold text-green-400';
    } else if (bearish) {
      maElement.textContent = 'Bearish';
      maElement.className = 'text-xl font-bold text-red-400';
    } else {
      maElement.textContent = 'Mixed';
      maElement.className = 'text-xl font-bold text-yellow-400';
    }
  }
}

// Load performance metrics
async function loadPerformanceMetrics() {
  try {
    const response = await axios.get('/api/performance/metrics');
    const metrics = response.data;
    
    // Display win rate (average across timeframes)
    const avgWinRate = Object.values(metrics.winRate).reduce((a, b) => a + b, 0) / Object.values(metrics.winRate).length;
    document.getElementById('winRate').textContent = avgWinRate.toFixed(1) + '%';
    
    // Display Sharpe ratio (1h timeframe)
    document.getElementById('sharpeRatio').textContent = metrics.sharpeRatio['1h'].toFixed(2);
    
  } catch (error) {
    console.error('Error loading performance metrics:', error);
  }
}

// Refresh predictions manually
function refreshPredictions() {
  loadPredictions();
  
  // Show loading animation
  const button = event.target;
  const icon = button.querySelector('i');
  icon.classList.add('fa-spin');
  
  setTimeout(() => {
    icon.classList.remove('fa-spin');
  }, 1000);
}

// Update date and time
function updateDateTime() {
  const now = new Date();
  const timeElement = document.getElementById('currentTime');
  
  if (timeElement) {
    timeElement.textContent = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-spin-slow {
    animation: spin-slow 8s linear infinite;
  }
  .bg-grid {
    background-image: 
      linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px);
    background-size: 50px 50px;
  }
`;
document.head.appendChild(style);