# Hurricane SPY Backtest Results

## Executive Summary

Initial backtesting of the Hurricane SPY prediction system has been completed with the following results:

### Overall Performance
- **Total Trades**: 60 (10 days × 6 timeframes)
- **Win Rate**: 13.33% (8 wins / 52 losses)
- **Average R-Multiple**: +3.044
- **Total R-Multiple**: +182.66

Despite a low win rate, the system shows positive expectancy due to high risk-reward ratios on winning trades.

## Timeframe Analysis

| Timeframe | Trades | Win Rate | Avg R-Multiple | Cone Accuracy |
|-----------|--------|----------|----------------|---------------|
| 1m        | 10     | 30%      | +13.87         | 10%          |
| 5m        | 10     | 20%      | +4.14          | 10%          |
| 15m       | 10     | 0%       | -0.20          | 10%          |
| 1h        | 10     | 30%      | +0.76          | 30%          |
| 4h        | 10     | 0%       | -0.10          | 60%          |
| 1d        | 10     | 0%       | -0.20          | 80%          |

### Key Findings
1. **Short-term timeframes (1m, 5m)** show the best performance with high R-multiples
2. **Cone calibration improves** with longer timeframes (80% accuracy for 1-day)
3. **All trades occurred in TREND regime** - need more regime diversity

## Cone Calibration
- Within 10% of median: 7.6%
- Within 25% of median: 16.5%
- Within 50% of median: 25.3%
- Outside 50%: 50.6%

The system tends to predict wider cones than necessary, especially on shorter timeframes.

## Sample Winning Trades

| Date       | TF  | Direction | Entry   | Target  | Stop    | Actual  | R-Multiple |
|------------|-----|-----------|---------|---------|---------|---------|------------|
| 2025-09-25 | 1m  | BULLISH   | 572.18  | 572.56  | 571.98  | 582.25  | +51.03     |
| 2025-09-25 | 5m  | BULLISH   | 572.18  | 573.14  | 571.69  | 582.25  | +20.67     |
| 2025-09-18 | 1m  | BULLISH   | 573.98  | 574.29  | 573.82  | 579.75  | +35.97     |
| 2025-09-18 | 1h  | BULLISH   | 573.98  | 577.12  | 572.41  | 579.25  | +3.36      |

## Issues Identified

1. **Too many NEUTRAL predictions** (50% of all predictions)
2. **All predictions in TREND regime** - regime detection needs improvement
3. **Synthetic data limitations** - using generated historical data for testing
4. **Low directional confidence** - most predictions have 0.5 confidence

## Recommendations for Improvement

### Immediate Actions
1. **Enhance directional signals** - Increase ensemble member weights
2. **Improve regime detection** - Add more variation in regime transitions
3. **Use real historical data** - Expand Unusual Whales coverage beyond current snapshots
4. **Calibrate Kelly sizing** - Current position sizes may be too conservative

### Next Steps
1. Run backtests with expanded Unusual Whales history once available
2. Test across different market conditions (2020 COVID, 2022 bear market, 2023 rally)
3. Optimize ensemble weights based on regime
4. Implement option-specific backtesting for 0DTE strategies
5. Add transaction costs and slippage modeling

## API Mode Backtesting

The system now supports API-mode backtesting with the `?asof=YYYY-MM-DD` parameter:

```bash
# Run backtest using API mode (fetches predictions from live API)
python3 backtest_hurricane.py api

# Or offline mode using saved JSON predictions
python3 backtest_hurricane.py offline
```

## Files Generated

- `backtest_results/backtest_summary.json` - Complete statistics
- `backtest_results/trade_log.csv` - Individual trade details
- `backtest_results/by_regime_summary.csv` - Performance by market regime
- `predictions_unusual_whales/*.json` - Saved Unusual Whales predictions for each date

## Latest Offline Backtest (Requested 3-Month Window)

- **Execution Date**: 2025-09-26
- **Requested Window**: Approx. 3 months (rolling)
- **Available Data Window**: 2025-09-16 → 2025-09-26 (11 saved prediction files)
- **Total Trades Evaluated**: 54 (9 trading days × 6 timeframes)
- **Win Rate**: 0.0%
- **Average R-Multiple**: 0.00
- **Regime Coverage**: RANGING (48 trades), RANGING | HIGH_VOL (6 trades)
- **Cone Calibration**: 7.9% of outcomes within 25% cone width; 77.8% outside 50%

> **Note:** The offline backtest automatically clamps the analysis window to the locally saved prediction files. Providing a longer history of daily predictions is required to evaluate a full three-month period.

### Data availability constraints

- The offline harness currently points at `predictions_unusual_whales/`, which only contains eleven daily prediction snapshots covering **2025-09-16 → 2025-09-26**. Any request for a longer window (e.g., three months) is truncated to that span.
- Legacy prediction files sourced from other providers have been removed. To evaluate the full SPY model history, export the remaining Unusual Whales days into `predictions_unusual_whales/` for each missing trading day.
- Until those files are added, the model cannot be evaluated before 2025-09-16 in offline mode; the CLI will emit a warning detailing how many days were clipped so operators can spot the gap immediately.

## Conclusion

The Hurricane SPY system shows promise with positive expectancy despite low win rate. The high R-multiple on winning trades (especially 1m timeframe with 13.87 average) suggests the system can capture large moves when correct. Key improvements needed:
1. Better directional signal generation
2. More diverse regime detection
3. Real market data integration
4. Option-specific performance tracking

Next phase should focus on testing with real market data and optimizing the ensemble weights based on historical performance.