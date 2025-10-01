#!/usr/bin/env python3
"""
Generate predictions from the API for backtesting
"""

import json
from datetime import datetime, timedelta
from pathlib import Path

from unusual_whales_client import UnusualWhalesClient

PREDICTIONS_DIR = Path("predictions_unusual_whales")
client = UnusualWhalesClient()

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
            if not client.is_configured:
                raise RuntimeError(
                    "Missing Unusual Whales credentials. Set UNUSUAL_WHALES_API_TOKEN."
                )

            print(f"Fetching prediction for {date_str} from Unusual Whales...")

            data = client.fetch_prediction("SPY", asof=date_str)

            # Save to file
            output_file = PREDICTIONS_DIR / f"{date_str}.json"
            with open(output_file, 'w') as f:
                json.dump(data, f, indent=2)

            print(f"  ✅ Saved prediction to {output_file}")
            generated.append(date_str)

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
