#!/usr/bin/env python3
"""
Generate predictions from the API for backtesting
"""

import json
import requests
from datetime import datetime, timedelta
from pathlib import Path

API_URL = "http://localhost:3000/api/meteorology/predict"
PREDICTIONS_DIR = Path("predictions")

# Create predictions directory
PREDICTIONS_DIR.mkdir(exist_ok=True)

def generate_predictions_for_dates(days_back=7):
    """Generate predictions for the past N days"""
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    
    current_date = start_date
    generated = []
    failed = []
    
    while current_date <= end_date:
        date_str = current_date.strftime('%Y-%m-%d')
        
        try:
            print(f"Fetching prediction for {date_str}...")
            
            # Try API with ?asof parameter
            response = requests.get(API_URL, params={"asof": date_str}, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                
                # Save to file
                output_file = PREDICTIONS_DIR / f"{date_str}.json"
                with open(output_file, 'w') as f:
                    json.dump(data, f, indent=2)
                
                print(f"  ✅ Saved prediction to {output_file}")
                generated.append(date_str)
            else:
                print(f"  ❌ Failed to fetch (status: {response.status_code})")
                failed.append(date_str)
                
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Request failed: {e}")
            failed.append(date_str)
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed.append(date_str)
        
        current_date += timedelta(days=1)
    
    print(f"\n=== Generation Summary ===")
    print(f"Generated: {len(generated)} predictions")
    print(f"Failed: {len(failed)} predictions")
    
    if generated:
        print(f"\nSuccessful dates: {', '.join(generated)}")
    if failed:
        print(f"Failed dates: {', '.join(failed)}")

if __name__ == "__main__":
    import sys
    
    days = 7
    if len(sys.argv) > 1:
        days = int(sys.argv[1])
    
    print(f"Generating predictions for the past {days} days...")
    generate_predictions_for_dates(days)