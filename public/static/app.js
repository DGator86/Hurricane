// Global variables
let stockChart = null;
let currentSymbol = '';

// Initialize Chart.js
window.addEventListener('DOMContentLoaded', () => {
  const ctx = document.getElementById('stockChart');
  if (ctx) {
    stockChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Stock Price',
          data: [],
          borderColor: 'rgb(79, 70, 229)',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'top',
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function(value) {
                return '$' + value.toFixed(2);
              }
            }
          }
        }
      }
    });
    // Hide chart initially
    ctx.style.display = 'none';
  }
});

// Quick search function
function quickSearch(symbol) {
  document.getElementById('stockSymbol').value = symbol;
  fetchStockData();
}

// Show loading indicator
function showLoading() {
  const indicator = document.getElementById('loadingIndicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
}

// Hide loading indicator
function hideLoading() {
  const indicator = document.getElementById('loadingIndicator');
  if (indicator) {
    indicator.classList.add('hidden');
  }
}

// Show error message
function showError(message) {
  const errorDisplay = document.getElementById('errorDisplay');
  const errorMessage = document.getElementById('errorMessage');
  if (errorDisplay && errorMessage) {
    errorMessage.textContent = message;
    errorDisplay.classList.remove('hidden');
    setTimeout(() => {
      errorDisplay.classList.add('hidden');
    }, 5000);
  }
}

// Fetch stock data
async function fetchStockData() {
  const symbol = document.getElementById('stockSymbol').value.toUpperCase();
  const functionType = document.getElementById('functionType').value;
  
  if (!symbol) {
    showError('Please enter a stock symbol');
    return;
  }
  
  currentSymbol = symbol;
  showLoading();
  
  try {
    if (functionType === 'GLOBAL_QUOTE') {
      // Fetch current quote
      const response = await axios.get(`/api/quote/${symbol}`);
      const data = response.data;
      
      if (data['Global Quote']) {
        displayQuote(data['Global Quote']);
        hideChartMessage();
      } else if (data.Note) {
        showError('API call frequency limit reached. Please wait a minute.');
      } else {
        showError('No data found for this symbol');
      }
    } else {
      // Fetch time series data
      const response = await axios.get(`/api/timeseries/${functionType}/${symbol}`);
      const data = response.data;
      
      if (data.Note) {
        showError('API call frequency limit reached. Please wait a minute.');
      } else if (data['Error Message']) {
        showError('Invalid symbol or API error');
      } else {
        const seriesKey = getSeriesKey(functionType);
        if (data[seriesKey]) {
          displayTimeSeries(data[seriesKey], functionType);
          hideChartMessage();
        } else {
          showError('No data found for this symbol');
        }
      }
    }
  } catch (error) {
    console.error('Error fetching stock data:', error);
    showError('Failed to fetch stock data. Please try again.');
  } finally {
    hideLoading();
  }
}

// Get series key based on function type
function getSeriesKey(functionType) {
  switch (functionType) {
    case 'TIME_SERIES_DAILY':
      return 'Time Series (Daily)';
    case 'TIME_SERIES_WEEKLY':
      return 'Weekly Time Series';
    case 'TIME_SERIES_MONTHLY':
      return 'Monthly Time Series';
    default:
      return 'Time Series (Daily)';
  }
}

// Display current quote
function displayQuote(quote) {
  const quoteDisplay = document.getElementById('quoteDisplay');
  const quoteContent = document.getElementById('quoteContent');
  
  if (quoteDisplay && quoteContent) {
    quoteDisplay.classList.remove('hidden');
    
    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = quote['10. change percent'];
    const volume = parseInt(quote['06. volume']).toLocaleString();
    
    const changeClass = change >= 0 ? 'text-green-600' : 'text-red-600';
    const changeIcon = change >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
    
    quoteContent.innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-gray-600 text-sm">Symbol</p>
          <p class="text-2xl font-bold">${quote['01. symbol']}</p>
        </div>
        <div>
          <p class="text-gray-600 text-sm">Price</p>
          <p class="text-2xl font-bold">$${price.toFixed(2)}</p>
        </div>
        <div>
          <p class="text-gray-600 text-sm">Change</p>
          <p class="text-xl font-semibold ${changeClass}">
            <i class="fas ${changeIcon} mr-1"></i>
            ${change.toFixed(2)} (${changePercent})
          </p>
        </div>
        <div>
          <p class="text-gray-600 text-sm">Volume</p>
          <p class="text-xl">${volume}</p>
        </div>
        <div>
          <p class="text-gray-600 text-sm">High</p>
          <p class="text-lg">$${parseFloat(quote['03. high']).toFixed(2)}</p>
        </div>
        <div>
          <p class="text-gray-600 text-sm">Low</p>
          <p class="text-lg">$${parseFloat(quote['04. low']).toFixed(2)}</p>
        </div>
        <div>
          <p class="text-gray-600 text-sm">Previous Close</p>
          <p class="text-lg">$${parseFloat(quote['08. previous close']).toFixed(2)}</p>
        </div>
        <div>
          <p class="text-gray-600 text-sm">Latest Trading Day</p>
          <p class="text-lg">${quote['07. latest trading day']}</p>
        </div>
      </div>
    `;
  }
}

// Display time series data
function displayTimeSeries(timeSeries, functionType) {
  const dates = Object.keys(timeSeries).slice(0, 30).reverse();
  const prices = dates.map(date => parseFloat(timeSeries[date]['4. close']));
  
  // Update chart
  if (stockChart) {
    stockChart.data.labels = dates;
    stockChart.data.datasets[0].data = prices;
    stockChart.data.datasets[0].label = `${currentSymbol} Price`;
    stockChart.update();
    
    // Show chart
    const ctx = document.getElementById('stockChart');
    if (ctx) {
      ctx.style.display = 'block';
    }
  }
  
  // Update table
  displayDataTable(timeSeries, dates.reverse());
}

// Display data table
function displayDataTable(timeSeries, dates) {
  const dataTable = document.getElementById('dataTable');
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  
  if (dataTable && tableHead && tableBody) {
    dataTable.classList.remove('hidden');
    
    // Create header
    tableHead.innerHTML = `
      <tr class="bg-gray-50">
        <th class="px-4 py-2 text-left">Date</th>
        <th class="px-4 py-2 text-right">Open</th>
        <th class="px-4 py-2 text-right">High</th>
        <th class="px-4 py-2 text-right">Low</th>
        <th class="px-4 py-2 text-right">Close</th>
        <th class="px-4 py-2 text-right">Volume</th>
      </tr>
    `;
    
    // Create rows (show latest 10)
    const displayDates = dates.slice(0, 10);
    tableBody.innerHTML = displayDates.map(date => {
      const data = timeSeries[date];
      const close = parseFloat(data['4. close']);
      const open = parseFloat(data['1. open']);
      const changeClass = close >= open ? 'text-green-600' : 'text-red-600';
      
      return `
        <tr class="border-t hover:bg-gray-50">
          <td class="px-4 py-2">${date}</td>
          <td class="px-4 py-2 text-right">$${parseFloat(data['1. open']).toFixed(2)}</td>
          <td class="px-4 py-2 text-right">$${parseFloat(data['2. high']).toFixed(2)}</td>
          <td class="px-4 py-2 text-right">$${parseFloat(data['3. low']).toFixed(2)}</td>
          <td class="px-4 py-2 text-right ${changeClass} font-semibold">$${close.toFixed(2)}</td>
          <td class="px-4 py-2 text-right">${parseInt(data['5. volume']).toLocaleString()}</td>
        </tr>
      `;
    }).join('');
  }
}

// Search companies
async function searchCompanies() {
  const keywords = document.getElementById('companyKeywords').value;
  const searchResults = document.getElementById('searchResults');
  
  if (!keywords) {
    showError('Please enter search keywords');
    return;
  }
  
  showLoading();
  searchResults.innerHTML = '<p class="text-gray-500">Searching...</p>';
  
  try {
    const response = await axios.get(`/api/search/${encodeURIComponent(keywords)}`);
    const data = response.data;
    
    if (data.bestMatches && data.bestMatches.length > 0) {
      searchResults.innerHTML = data.bestMatches.map(match => `
        <div class="border-t pt-2 mt-2 cursor-pointer hover:bg-gray-50 p-2 rounded" onclick="selectCompany('${match['1. symbol']}')">
          <div class="font-semibold">${match['1. symbol']}</div>
          <div class="text-sm text-gray-600">${match['2. name']}</div>
          <div class="text-xs text-gray-500">${match['3. type']} - ${match['4. region']}</div>
        </div>
      `).join('');
    } else {
      searchResults.innerHTML = '<p class="text-gray-500">No results found</p>';
    }
  } catch (error) {
    console.error('Error searching companies:', error);
    showError('Failed to search companies');
    searchResults.innerHTML = '<p class="text-red-500">Search failed</p>';
  } finally {
    hideLoading();
  }
}

// Select company from search results
function selectCompany(symbol) {
  document.getElementById('stockSymbol').value = symbol;
  document.getElementById('searchResults').innerHTML = '';
  fetchStockData();
}

// Hide chart message
function hideChartMessage() {
  const message = document.getElementById('chartMessage');
  if (message) {
    message.style.display = 'none';
  }
}

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Press Enter to search when input is focused
  if (e.key === 'Enter') {
    if (document.activeElement.id === 'stockSymbol' || document.activeElement.id === 'functionType') {
      fetchStockData();
    } else if (document.activeElement.id === 'companyKeywords') {
      searchCompanies();
    }
  }
});