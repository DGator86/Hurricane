#!/usr/bin/env python3
"""
Fetch real historical SPY data from Polygon.io API
"""

import json
import csv
import requests
from datetime import datetime, timedelta
from pathlib import Path

# Polygon.io API configuration
POLYGON_API_KEY = "Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D"
POLYGON_BASE_URL = "https://api.polygon.io"

def fetch_spy_historical_data(days_back=30):
    """
    Fetch historical SPY data from Polygon.io
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    
    # Format dates for API
    from_date = start_date.strftime('%Y-%m-%d')
    to_date = end_date.strftime('%Y-%m-%d')
    
    print(f"Fetching SPY data from {from_date} to {to_date}...")
    
    # Polygon.io aggregates endpoint
    url = f"{POLYGON_BASE_URL}/v2/aggs/ticker/SPY/range/1/day/{from_date}/{to_date}"
    params = {
        "adjusted": "true",
        "sort": "asc",
        "apiKey": POLYGON_API_KEY
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        if data.get("status") == "OK" and "results" in data:
            print(f"✅ Successfully fetched {len(data['results'])} days of data")
            return data["results"]
        else:
            print(f"❌ API returned unexpected response: {data}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching data: {e}")
        return None

def fetch_spy_with_twelve_data(days_back=30):
    """
    Fallback to Twelve Data if Polygon fails
    """
    print("Trying Twelve Data as fallback...")
    
    TWELVE_DATA_KEY = "44b220a2cbd540c9a50ed2a97ef3e8d8"
    
    url = "https://api.twelvedata.com/time_series"
    params = {
        "symbol": "SPY",
        "interval": "1day",
        "outputsize": str(days_back),
        "apikey": TWELVE_DATA_KEY
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        if "values" in data:
            print(f"✅ Successfully fetched {len(data['values'])} days from Twelve Data")
            
            # Convert to Polygon format
            results = []
            for item in data["values"]:
                results.append({
                    "t": int(datetime.strptime(item["datetime"], "%Y-%m-%d").timestamp() * 1000),
                    "o": float(item["open"]),
                    "h": float(item["high"]),
                    "l": float(item["low"]),
                    "c": float(item["close"]),
                    "v": float(item.get("volume", 0))
                })
            
            # Reverse to get chronological order
            return list(reversed(results))
        else:
            print(f"❌ Twelve Data API error: {data}")
            return None
            
    except Exception as e:
        print(f"❌ Error with Twelve Data: {e}")
        return None

def save_to_csv(data, filename="spy_data.csv"):
    """
    Save historical data to CSV format expected by backtester
    """
    if not data:
        print("No data to save")
        return
    
    with open(filename, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Date', 'Open', 'High', 'Low', 'Close', 'Volume'])
        
        for bar in data:
            # Convert timestamp to date string
            if 't' in bar:
                date = datetime.fromtimestamp(bar['t'] / 1000).strftime('%Y-%m-%d')
            else:
                date = bar.get('date', '')
            
            writer.writerow([
                date,
                f"{bar.get('o', 0):.2f}",
                f"{bar.get('h', 0):.2f}",
                f"{bar.get('l', 0):.2f}",
                f"{bar.get('c', 0):.2f}",
                bar.get('v', 0)
            ])
    
    print(f"✅ Saved {len(data)} days of SPY data to {filename}")

def main():
    """
    Main entry point
    """
    import sys
    
    days = 30
    if len(sys.argv) > 1:
        days = int(sys.argv[1])
    
    print(f"=== Fetching {days} days of SPY historical data ===\n")
    
    # Try Polygon first
    data = fetch_spy_historical_data(days)
    
    # Fallback to Twelve Data
    if not data:
        data = fetch_spy_with_twelve_data(days)
    
    # Save to CSV
    if data:
        save_to_csv(data)
        
        # Show sample of data
        print("\n📊 Sample data (last 5 days):")
        for bar in data[-5:]:
            date = datetime.fromtimestamp(bar['t'] / 1000).strftime('%Y-%m-%d') if 't' in bar else 'N/A'
            print(f"  {date}: Open=${bar.get('o', 0):.2f}, Close=${bar.get('c', 0):.2f}, Volume={bar.get('v', 0):,.0f}")
    else:
        print("\n❌ Failed to fetch data from all sources")
        print("Please check API keys or try again later")

if __name__ == "__main__":
    main()