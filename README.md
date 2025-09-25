# Stock Market Dashboard

## Project Overview
- **Name**: Stock Market Dashboard
- **Goal**: Provide real-time stock market data visualization using Alpha Vantage API
- **Features**: 
  - Real-time stock quotes
  - Historical price charts
  - Time series data (daily, weekly, monthly)
  - Company search functionality
  - Interactive data visualization with Chart.js

## URLs
- **Development**: https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev
- **Production**: Will be available after Cloudflare Pages deployment
- **GitHub**: Not yet configured

## Data Architecture
- **Data Models**: Stock quotes, time series data, company information
- **Storage Services**: No persistent storage (real-time API calls)
- **Data Source**: Alpha Vantage API
- **Data Flow**: Frontend → Hono API routes → Alpha Vantage API → Response processing → Chart/Table display

## Features

### ✅ Currently Completed
1. **Stock Quote Lookup**
   - Real-time price data
   - Daily change and percentage
   - Volume, high/low prices
   - Previous close information

2. **Time Series Data**
   - Daily, weekly, and monthly historical data
   - Interactive line charts using Chart.js
   - Tabular data display with 10 most recent entries

3. **Company Search**
   - Search companies by name or keywords
   - Quick selection from search results
   - Popular stock quick access buttons (AAPL, GOOGL, MSFT, AMZN, TSLA, META)

4. **Secure API Integration**
   - Alpha Vantage API key stored securely in environment variables
   - Server-side API calls (no exposure of API key to frontend)
   - Error handling for API limits and invalid symbols

5. **Responsive Design**
   - Mobile-friendly interface
   - TailwindCSS for styling
   - Loading indicators and error messages

## API Endpoints

### Current Functional URIs

1. **GET /** 
   - Main dashboard interface

2. **GET /api/quote/:symbol**
   - Get current stock quote
   - Parameters: `symbol` (e.g., AAPL, GOOGL)
   - Returns: Current price, change, volume, etc.

3. **GET /api/timeseries/:function/:symbol**
   - Get historical time series data
   - Parameters: 
     - `function`: TIME_SERIES_DAILY, TIME_SERIES_WEEKLY, TIME_SERIES_MONTHLY
     - `symbol`: Stock symbol
   - Returns: Historical price data

4. **GET /api/search/:keywords**
   - Search for companies
   - Parameters: `keywords` (company name or partial match)
   - Returns: List of matching companies with symbols

5. **GET /api/company/:symbol**
   - Get company overview (prepared but not used in UI yet)
   - Parameters: `symbol`
   - Returns: Company details

## User Guide

### Getting Started
1. Visit the dashboard URL
2. Enter a stock symbol (e.g., AAPL for Apple) or use quick access buttons
3. Select data type: Current Price, Daily, Weekly, or Monthly
4. Click "Get Data" to fetch information

### Using Company Search
1. Enter company name or keywords in the search field
2. Click "Search" to find matching companies
3. Click on a result to automatically load its stock data

### Understanding the Charts
- **Line Chart**: Shows price trends over time
- **Data Table**: Displays detailed historical data including Open, High, Low, Close, and Volume
- **Current Quote**: Shows real-time price with change indicators (green for positive, red for negative)

### Keyboard Shortcuts
- Press Enter in the symbol field to fetch data
- Press Enter in the search field to search companies

## Technical Stack
- **Backend**: Hono Framework on Cloudflare Workers
- **Frontend**: HTML5, TailwindCSS, Chart.js
- **API**: Alpha Vantage Financial Data API
- **Runtime**: Cloudflare Pages/Workers
- **Package Manager**: npm
- **Process Manager**: PM2 (for development)

## Development

### Local Setup
```bash
# Install dependencies
npm install

# Create .dev.vars file with your API key
echo "ALPHA_VANTAGE_API_KEY=your_key_here" > .dev.vars

# Build the project
npm run build

# Start development server
npm run start  # Uses PM2
# or
npm run dev:sandbox  # Direct wrangler command
```

### Available Scripts
- `npm run build` - Build for production
- `npm run start` - Start with PM2
- `npm run stop` - Stop PM2 process
- `npm run restart` - Restart PM2 process
- `npm run logs` - View application logs
- `npm run deploy` - Deploy to Cloudflare Pages
- `npm run test` - Test if server is running

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active (Development)
- **Tech Stack**: Hono + TypeScript + TailwindCSS + Chart.js
- **Last Updated**: 2025-09-25

### To Deploy to Production
1. Set up Cloudflare API key in Deploy tab
2. Run `npm run deploy:prod`
3. Add API key as secret: `npx wrangler pages secret put ALPHA_VANTAGE_API_KEY`

## Features Not Yet Implemented
- [ ] Company overview details page
- [ ] Technical indicators (RSI, MACD, etc.)
- [ ] Portfolio tracking
- [ ] Watchlist functionality
- [ ] Export data to CSV
- [ ] Dark mode toggle
- [ ] Real-time WebSocket updates
- [ ] News integration

## Recommended Next Steps
1. **Deploy to Cloudflare Pages** for production access
2. **Add technical indicators** using Alpha Vantage technical API endpoints
3. **Implement portfolio tracking** with Cloudflare D1 database for persistence
4. **Add news integration** for comprehensive market insights
5. **Create watchlist feature** with KV storage for user preferences
6. **Implement data export** functionality
7. **Add more chart types** (candlestick, volume charts)
8. **Optimize API calls** with caching strategy

## Security Notes
- API key is stored securely in environment variables
- Never expose API keys in frontend code
- All API calls are made server-side through Hono routes
- Rate limiting should be implemented for production

## Alpha Vantage API Limits
- Free tier: 25 requests per day
- Standard tier: 75 requests per minute
- If you see "API call frequency limit" errors, wait a minute and try again

## Support
For issues or questions about the Alpha Vantage API, visit: https://www.alphavantage.co/documentation/