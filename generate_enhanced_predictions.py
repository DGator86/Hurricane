#!/usr/bin/env python3
"""
Generate ENHANCED predictions using the new comprehensive system
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
    """Generate enhanced predictions for the past N days"""
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    
    current_date = start_date
    generated = []
    failed = []
    
    print("=" * 60)
    print("ENHANCED HURRICANE PREDICTION SYSTEM")
    print("Target: 75%+ Accuracy with ALL Features")
    print("=" * 60)
    
    while current_date <= end_date:
        date_str = current_date.strftime('%Y-%m-%d')

        try:
            print(f"\n📊 Fetching enhanced prediction for {date_str}...")

            if not client.is_configured:
                raise RuntimeError(
                    "Missing Unusual Whales credentials. Set UNUSUAL_WHALES_API_TOKEN."
                )

            data = client.fetch_enhanced_prediction("SPY", asof=date_str)

            # Show key metrics
            if data.get('success'):
                overall_conf = data.get('confidence', {}).get('overall', 0)
                strongest = data.get('strongestSignal', {})
                warnings = data.get('warnings', [])

                print(f"  ✅ Overall Confidence: {overall_conf:.1%}")

                if strongest.get('timeframe'):
                    tf = strongest['timeframe']
                    pred = strongest.get('prediction', {})
                    print(
                        f"  💪 Strongest Signal: {tf} - {pred.get('direction', 'N/A')} "
                        f"({pred.get('confidence', 0):.1%})"
                    )

                if warnings:
                    print(f"  ⚠️  Warnings: {', '.join(warnings[:2])}")

                # Show prediction breakdown
                predictions = data.get('predictions', {}) or data.get('forecasts', {})
                signals = []
                for tf, pred in predictions.items():
                    direction = pred.get('direction')
                    if direction and direction != 'NEUTRAL':
                        signals.append(f"{tf}:{direction}")

                if signals:
                    print(f"  📈 Active Signals: {', '.join(signals)}")

            # Save to file
            output_file = PREDICTIONS_DIR / f"{date_str}.json"
            with open(output_file, 'w') as f:
                json.dump(data, f, indent=2)

            print(f"  💾 Saved to {output_file}")
            generated.append(date_str)

        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed.append(date_str)
        
        current_date += timedelta(days=1)
    
    print(f"\n{'=' * 60}")
    print(f"GENERATION SUMMARY")
    print(f"{'=' * 60}")
    print(f"✅ Generated: {len(generated)} enhanced predictions")
    print(f"❌ Failed: {len(failed)} predictions")
    
    if generated:
        print(f"\n📅 Successful dates: {', '.join(generated[:5])}")
        if len(generated) > 5:
            print(f"    ... and {len(generated) - 5} more")
    if failed:
        print(f"⚠️ Failed dates: {', '.join(failed)}")
    
    print(f"\n💡 Next Step: Run backtest with enhanced predictions:")
    print(f"   python3 backtest_enhanced.py")

if __name__ == "__main__":
    import sys
    
    days = 10
    if len(sys.argv) > 1:
        days = int(sys.argv[1])
    
    print(f"Generating enhanced predictions for the past {days} days...")
    generate_predictions_for_dates(days)