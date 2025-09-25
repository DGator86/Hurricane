// SPY Hurricane Tracker - Market Storm Analysis System

// Global variables
let hurricaneRadar = null;
let volatilityChart = null;
let currentStormLevel = 0;
let marketData = {};
let autoRefreshInterval = null;

// Storm Categories based on VIX levels and SPY volatility
const STORM_CATEGORIES = [
  { 
    level: 0, 
    name: "Calm Seas", 
    vixRange: [0, 12], 
    icon: "fa-sun", 
    color: "green", 
    description: "Smooth sailing - Low volatility",
    windSpeed: "0-10",
    pressure: "1020"
  },
  { 
    level: 1, 
    name: "Light Breeze", 
    vixRange: [12, 15], 
    icon: "fa-cloud-sun", 
    color: "yellow", 
    description: "Minor market turbulence",
    windSpeed: "10-25",
    pressure: "1010"
  },
  { 
    level: 2, 
    name: "Tropical Depression", 
    vixRange: [15, 20], 
    icon: "fa-cloud", 
    color: "orange", 
    description: "Moderate volatility detected",
    windSpeed: "25-40",
    pressure: "1000"
  },
  { 
    level: 3, 
    name: "Tropical Storm", 
    vixRange: [20, 25], 
    icon: "fa-cloud-rain", 
    color: "darkorange", 
    description: "High volatility - Caution advised",
    windSpeed: "40-75",
    pressure: "990"
  },
  { 
    level: 4, 
    name: "Category 1 Hurricane", 
    vixRange: [25, 30], 
    icon: "fa-cloud-showers-heavy", 
    color: "red", 
    description: "Dangerous market conditions",
    windSpeed: "75-95",
    pressure: "980"
  },
  { 
    level: 5, 
    name: "Category 2 Hurricane", 
    vixRange: [30, 40], 
    icon: "fa-hurricane", 
    color: "darkred", 
    description: "Extreme volatility - Seek shelter",
    windSpeed: "95-110",
    pressure: "970"
  },
  { 
    level: 6, 
    name: "Category 5 Hurricane", 
    vixRange: [40, 100], 
    icon: "fa-tornado", 
    color: "purple", 
    description: "CATASTROPHIC CONDITIONS",
    windSpeed: "157+",
    pressure: "920"
  }
];

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initializeCharts();
  updateDateTime();
  analyzeMarket();
  
  // Auto-refresh every 60 seconds
  autoRefreshInterval = setInterval(() => {
    analyzeMarket();
  }, 60000);
  
  // Update time every second
  setInterval(updateDateTime, 1000);
});

// Initialize charts
function initializeCharts() {
  // Hurricane Radar (circular visualization)
  const radarCtx = document.getElementById('hurricaneRadar');
  if (radarCtx) {
    hurricaneRadar = new Chart(radarCtx, {
      type: 'radar',
      data: {
        labels: ['Volatility', 'Volume', 'Momentum', 'Fear Index', 'Put/Call', 'Breadth'],
        datasets: [{
          label: 'Current Storm',
          data: [0, 0, 0, 0, 0, 0],
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(255, 99, 132, 1)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(255, 99, 132, 1)'
        }, {
          label: 'Safe Zone',
          data: [30, 30, 30, 30, 30, 30],
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          borderColor: 'rgba(75, 192, 192, 0.3)',
          borderWidth: 1,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: {
              color: '#9CA3AF',
              backdropColor: 'transparent'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            pointLabels: {
              color: '#E5E7EB'
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#E5E7EB'
            }
          }
        }
      }
    });
  }

  // Volatility Chart
  const volCtx = document.getElementById('volatilityChart');
  if (volCtx) {
    volatilityChart = new Chart(volCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'SPY Price',
          data: [],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y',
          tension: 0.4
        }, {
          label: 'VIX (Fear Index)',
          data: [],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          yAxisID: 'y1',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          x: {
            ticks: {
              color: '#9CA3AF'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            ticks: {
              color: '#3B82F6',
              callback: function(value) {
                return '$' + value.toFixed(0);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            ticks: {
              color: '#EF4444',
              callback: function(value) {
                return value.toFixed(0);
              }
            },
            grid: {
              drawOnChartArea: false
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#E5E7EB'
            }
          }
        }
      }
    });
  }
}

// Analyze market conditions
async function analyzeMarket() {
  showLoading();
  
  try {
    // Fetch SPY and VIX data
    const response = await axios.get('/api/spy/current');
    const data = response.data;
    
    if (data.spy && data.spy['Global Quote']) {
      const spyQuote = data.spy['Global Quote'];
      const vixQuote = data.vix['Global Quote'] || {};
      
      // Update current conditions
      updateCurrentConditions(spyQuote, vixQuote);
      
      // Calculate storm level
      const vixPrice = parseFloat(vixQuote['05. price'] || 15);
      updateStormCategory(vixPrice);
      
      // Update radar
      updateRadarData(spyQuote, vixQuote);
      
      // Fetch and update historical data
      await updateHistoricalData();
      
      // Update weather metrics
      updateWeatherMetrics(spyQuote, vixQuote);
    }
  } catch (error) {
    console.error('Error analyzing market:', error);
  } finally {
    hideLoading();
  }
}

// Update current conditions
function updateCurrentConditions(spyQuote, vixQuote) {
  const spyPrice = parseFloat(spyQuote['05. price']);
  const spyChange = parseFloat(spyQuote['09. change']);
  const spyChangePercent = spyQuote['10. change percent'];
  const vixPrice = parseFloat(vixQuote['05. price'] || 15);
  const volume = parseInt(spyQuote['06. volume']);
  const avgVolume = 80000000; // SPY average volume
  const volumeSurge = ((volume / avgVolume - 1) * 100).toFixed(1);
  
  document.getElementById('spyPrice').textContent = `$${spyPrice.toFixed(2)}`;
  document.getElementById('spyChange').innerHTML = formatChange(spyChange, spyChangePercent);
  document.getElementById('vixLevel').textContent = vixPrice.toFixed(2);
  document.getElementById('volumeSurge').textContent = `${volumeSurge > 0 ? '+' : ''}${volumeSurge}%`;
  
  // Store in global object
  marketData = { spyPrice, spyChange, vixPrice, volume };
}

// Update storm category
function updateStormCategory(vixLevel) {
  const category = STORM_CATEGORIES.find(cat => 
    vixLevel >= cat.vixRange[0] && vixLevel < cat.vixRange[1]
  ) || STORM_CATEGORIES[0];
  
  currentStormLevel = category.level;
  
  // Update UI
  document.getElementById('categoryIcon').innerHTML = 
    `<i class="fas ${category.icon} text-${category.color}-400"></i>`;
  document.getElementById('categoryName').textContent = category.name;
  document.getElementById('categoryDesc').textContent = category.description;
  
  // Update progress bar
  const progressBar = document.getElementById('categoryBar');
  const progressPercent = (category.level / 6) * 100;
  progressBar.style.width = `${progressPercent}%`;
  progressBar.className = `h-full transition-all duration-1000 bg-${category.color}-500`;
  
  // Update storm intensity
  const intensity = Math.min(100, (vixLevel / 40) * 100);
  document.getElementById('stormIntensity').textContent = `${intensity.toFixed(0)}%`;
  
  // Show alert for high storm levels
  if (category.level >= 3) {
    showStormAlert(category);
  } else {
    hideStormAlert();
  }
  
  // Update hurricane eye animation
  updateHurricaneEye(category.level);
}

// Update hurricane eye animation
function updateHurricaneEye(level) {
  const eye = document.getElementById('hurricaneEye');
  if (!eye) return;
  
  // Adjust animation speed based on storm level
  const baseSpeed = 4;
  const speed = Math.max(0.5, baseSpeed - (level * 0.5));
  
  eye.style.animationDuration = `${speed}s`;
  
  // Change border colors based on intensity
  const colors = ['green', 'yellow', 'orange', 'darkorange', 'red', 'darkred', 'purple'];
  eye.style.borderColor = colors[level] || 'green';
}

// Update radar data
function updateRadarData(spyQuote, vixQuote) {
  if (!hurricaneRadar) return;
  
  const vixLevel = parseFloat(vixQuote['05. price'] || 15);
  const changePercent = Math.abs(parseFloat(spyQuote['10. change percent'].replace('%', '')));
  const volume = parseInt(spyQuote['06. volume']);
  const avgVolume = 80000000;
  const volumeRatio = (volume / avgVolume) * 50;
  
  // Calculate metrics (0-100 scale)
  const volatility = Math.min(100, (vixLevel / 40) * 100);
  const volumeMetric = Math.min(100, volumeRatio);
  const momentum = Math.min(100, changePercent * 20);
  const fear = Math.min(100, vixLevel * 2.5);
  const putCall = 50 + (Math.random() * 30 - 15); // Simulated for now
  const breadth = 50 + (Math.random() * 30 - 15); // Simulated for now
  
  hurricaneRadar.data.datasets[0].data = [
    volatility, volumeMetric, momentum, fear, putCall, breadth
  ];
  
  hurricaneRadar.update();
}

// Update historical data
async function updateHistoricalData() {
  try {
    const response = await axios.get('/api/spy/daily');
    const data = response.data;
    
    if (data['Time Series (Daily)']) {
      const timeSeries = data['Time Series (Daily)'];
      const dates = Object.keys(timeSeries).slice(0, 20).reverse();
      
      const spyPrices = dates.map(date => parseFloat(timeSeries[date]['4. close']));
      
      // Simulate VIX data (would need separate API call in production)
      const vixPrices = spyPrices.map((price, i) => {
        const change = i > 0 ? Math.abs((price - spyPrices[i-1]) / spyPrices[i-1]) * 100 : 0;
        return 15 + (change * 5) + (Math.random() * 5);
      });
      
      if (volatilityChart) {
        volatilityChart.data.labels = dates.map(date => {
          const d = new Date(date);
          return `${d.getMonth()+1}/${d.getDate()}`;
        });
        volatilityChart.data.datasets[0].data = spyPrices;
        volatilityChart.data.datasets[1].data = vixPrices;
        volatilityChart.update();
      }
      
      // Update storm timeline
      updateStormTimeline(dates, spyPrices);
    }
  } catch (error) {
    console.error('Error fetching historical data:', error);
  }
}

// Update storm timeline
function updateStormTimeline(dates, prices) {
  const timeline = document.getElementById('stormTimeline');
  if (!timeline) return;
  
  // Find significant moves (>2% change)
  const storms = [];
  for (let i = 1; i < Math.min(10, prices.length); i++) {
    const change = ((prices[i] - prices[i-1]) / prices[i-1]) * 100;
    if (Math.abs(change) > 2) {
      storms.push({
        date: dates[i],
        change: change,
        price: prices[i]
      });
    }
  }
  
  if (storms.length === 0) {
    timeline.innerHTML = '<p class="text-gray-400 text-center">No significant storms in recent history</p>';
    return;
  }
  
  timeline.innerHTML = storms.map(storm => {
    const icon = storm.change > 0 ? 'fa-arrow-up text-green-400' : 'fa-arrow-down text-red-400';
    const stormType = Math.abs(storm.change) > 3 ? 'Major Storm' : 'Minor Storm';
    
    return `
      <div class="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
        <div class="flex items-center">
          <i class="fas ${icon} mr-3"></i>
          <div>
            <p class="font-bold">${stormType}</p>
            <p class="text-sm text-gray-400">${new Date(storm.date).toLocaleDateString()}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="font-bold">${storm.change > 0 ? '+' : ''}${storm.change.toFixed(2)}%</p>
          <p class="text-sm text-gray-400">$${storm.price.toFixed(2)}</p>
        </div>
      </div>
    `;
  }).join('');
}

// Update weather metrics
function updateWeatherMetrics(spyQuote, vixQuote) {
  const vixLevel = parseFloat(vixQuote['05. price'] || 15);
  const changePercent = Math.abs(parseFloat(spyQuote['10. change percent'].replace('%', '')));
  const volume = parseInt(spyQuote['06. volume']);
  
  // Market Temperature (based on momentum)
  const temp = 70 + (changePercent * 10);
  document.getElementById('marketTemp').textContent = `${temp.toFixed(0)}°F`;
  
  // Wind Speed (based on VIX)
  const category = STORM_CATEGORIES.find(cat => 
    vixLevel >= cat.vixRange[0] && vixLevel < cat.vixRange[1]
  ) || STORM_CATEGORIES[0];
  document.getElementById('windSpeed').textContent = `${category.windSpeed} mph`;
  
  // Pressure (inverse of VIX)
  document.getElementById('pressure').textContent = `${category.pressure} mb`;
  
  // Visibility (based on volume)
  const avgVolume = 80000000;
  const visibility = Math.max(1, Math.min(10, 10 * (avgVolume / volume)));
  document.getElementById('visibility').textContent = `${visibility.toFixed(1)} mi`;
  
  // Update pressure systems
  updatePressureSystems(spyQuote);
}

// Update pressure systems
function updatePressureSystems(spyQuote) {
  const change = parseFloat(spyQuote['09. change']);
  const high = parseFloat(spyQuote['03. high']);
  const low = parseFloat(spyQuote['04. low']);
  const close = parseFloat(spyQuote['05. price']);
  
  // Calculate pressure distribution
  const range = high - low;
  const buyPressure = ((close - low) / range * 100).toFixed(0);
  const sellPressure = ((high - close) / range * 100).toFixed(0);
  const equilibrium = (100 - Math.abs(buyPressure - sellPressure)).toFixed(0);
  
  document.getElementById('buyPressure').textContent = `${buyPressure}%`;
  document.getElementById('sellPressure').textContent = `${sellPressure}%`;
  document.getElementById('equilibrium').textContent = `${equilibrium}%`;
}

// Load historical storms
function loadHistoricalStorms() {
  showLoading();
  // This would load significant historical market events
  setTimeout(() => {
    alert('Historical storm data would be loaded here with major market crashes and recoveries');
    hideLoading();
  }, 1000);
}

// Predict next storm
function predictNextStorm() {
  showLoading();
  // This would use technical indicators to predict volatility
  setTimeout(() => {
    alert('Storm prediction model would analyze RSI, MACD, and other indicators');
    hideLoading();
  }, 1000);
}

// Show storm alert
function showStormAlert(category) {
  const alertBanner = document.getElementById('alertBanner');
  const alertMessage = document.getElementById('alertMessage');
  
  if (alertBanner && alertMessage) {
    alertMessage.textContent = `${category.name} detected! ${category.description}. Wind speeds: ${category.windSpeed} mph`;
    alertBanner.classList.remove('hidden');
  }
}

// Hide storm alert
function hideStormAlert() {
  const alertBanner = document.getElementById('alertBanner');
  if (alertBanner) {
    alertBanner.classList.add('hidden');
  }
}

// Format change display
function formatChange(change, percent) {
  const isPositive = change >= 0;
  const color = isPositive ? 'text-green-400' : 'text-red-400';
  const arrow = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
  
  return `<span class="${color}">
    <i class="fas ${arrow} mr-1"></i>
    ${isPositive ? '+' : ''}${change.toFixed(2)} (${percent})
  </span>`;
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
  
  const dateElement = document.getElementById('currentDate');
  if (dateElement) {
    dateElement.textContent = now.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }
}

// Show/hide loading
function showLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes spin-slow-reverse {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
  }
  .animate-spin-slow {
    animation: spin-slow 8s linear infinite;
  }
  .animate-spin-slow-reverse {
    animation: spin-slow-reverse 6s linear infinite;
  }
`;
document.head.appendChild(style);