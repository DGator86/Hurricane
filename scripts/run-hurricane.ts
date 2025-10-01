import { promises as fs } from 'node:fs'
import * as path from 'node:path'

import { predictAll } from '../src/core/PredictionEngine'
import { HurricaneTestHarness } from './test-harness'
import { HurricaneCalibrator, CalibrationConfig, ParameterBounds } from './calibrate'

type OptionValue = string | boolean

interface ParsedArgs {
  command: string
  options: Record<string, OptionValue>
}

function parseArgs(argv: string[]): ParsedArgs {
  let command = 'predict'
  let index = 0

  if (argv[0] && !argv[0].startsWith('--')) {
    command = argv[0].toLowerCase()
    index = 1
  }

  const options: Record<string, OptionValue> = {}
  const positionals: string[] = []

  for (let i = index; i < argv.length; i++) {
    const token = argv[i]

    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }

    const stripped = token.slice(2)
    if (stripped.includes('=')) {
      const [rawKey, rawValue] = stripped.split('=', 2)
      const key = rawKey.trim()
      const value = rawValue.trim()
      if (key) {
        options[key] = value
      }
    } else {
      const key = stripped.trim()
      if (!key) {
        continue
      }
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        options[key] = next
        i++
      } else {
        options[key] = true
      }
    }
  }

  if (positionals.length > 0 && options.symbol === undefined) {
    options.symbol = positionals[0]
  }
  if (command === 'backtest') {
    if (positionals.length > 1 && options.start === undefined) {
      options.start = positionals[1]
    }
    if (positionals.length > 2 && options.end === undefined) {
      options.end = positionals[2]
    }
  }

  return { command, options }
}

function getStringOption(options: Record<string, OptionValue>, key: string): string | undefined {
  const value = options[key]
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : undefined
  }
  return undefined
}

function getBooleanOption(options: Record<string, OptionValue>, key: string): boolean {
  const value = options[key]
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered === 'true' || lowered === '1') return true
    if (lowered === 'false' || lowered === '0') return false
  }
  return false
}

function getNumberOption(options: Record<string, OptionValue>, key: string, fallback: number): number {
  const value = options[key]
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  return fallback
}

function getDateOption(options: Record<string, OptionValue>, key: string, fallback: Date): Date {
  const raw = getStringOption(options, key)
  if (!raw) {
    return fallback
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date for --${key}: ${raw}`)
  }
  return parsed
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`
}

async function writeOutputIfRequested(
  options: Record<string, OptionValue>,
  payload: unknown
): Promise<void> {
  const outputPath = getStringOption(options, 'output')
  if (!outputPath) {
    return
  }

  const resolved = path.resolve(outputPath)
  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, JSON.stringify(payload, null, 2), 'utf-8')
  console.log(`\n📝 Saved output to ${resolved}`)
}

function printHelp(): void {
  console.log(`🌀 Hurricane Model CLI\n\n` +
    `Usage: npm run hurricane -- <command> [options]\n\n` +
    `Commands:\n` +
    `  predict   [--symbol SPY] [--date 2024-12-02] [--output file]  Run a single inference\n` +
    `  backtest  [--symbol SPY] [--start 2024-10-01] [--end 2024-12-01] Run historical evaluation\n` +
    `  realtime  [--symbol SPY]                                     Fetch live-style snapshot\n` +
    `  calibrate [--symbol SPY] [--start 2024-01-01] [--end 2024-12-01] [--iterations 100]\n` +
    `            [--validation 0.2] [--target 0.75] [--p80 0.8] [--tolerance 0.05]\n` +
    `  help                                                         Show this help text\n\n` +
    `Examples:\n` +
    `  npm run hurricane -- predict --symbol SPY --date 2024-12-02\n` +
    `  npm run hurricane -- backtest --symbol SPY --start 2024-10-01 --end 2024-12-01\n` +
    `  npm run hurricane -- calibrate --iterations 150\n`)
}

async function runPredict(options: Record<string, OptionValue>): Promise<void> {
  const symbol = getStringOption(options, 'symbol') ?? 'SPY'
  const asOf = getDateOption(options, 'date', new Date())

  console.log(`🌀 Running Hurricane prediction for ${symbol}`)
  console.log(`📅 As of: ${asOf.toISOString()}`)

  const { perTF, final, health } = await predictAll(symbol, asOf)

  console.log('\n⏱️  Timeframe breakdown:')
  for (const tf of perTF) {
    const rr = tf.rMultiple?.rr ?? 0
    const target = tf.targets?.target ?? tf.entryPx
    const stop = tf.stop ?? tf.entryPx
    console.log(`  • ${tf.tf.padEnd(3)} | ${tf.side.padEnd(4)} | Conf ${formatPercent(tf.confidence)} | Kelly ${formatPercent(tf.size)} | RR ${rr.toFixed(2)} | Target ${formatPrice(target)} | Stop ${formatPrice(stop)}`)
  }

  const aggregateSide = final.side > 0 ? 'CALL' : final.side < 0 ? 'PUT' : 'NONE'
  const shouldTrade = health.passed && aggregateSide !== 'NONE' && final.confidence >= 0.6

  console.log('\n🎯 Aggregate signal:')
  console.log(`  • Direction: ${aggregateSide}`)
  console.log(`  • Confidence: ${formatPercent(final.confidence)}`)
  console.log(`  • Health passed: ${health.passed ? '✅' : '❌'}`)
  console.log(`  • Tradeable: ${shouldTrade ? '✅ Ready' : '⚠️ Hold'}`)

  console.log('\n🩺 Health diagnostics:')
  console.log(`  • Timeframe collapse: ${health.tfCollapse ? '⚠️' : '✅ OK'}`)
  console.log(`  • Directional bias: ${health.dirBias ? '⚠️' : '✅ OK'}`)
  console.log(`  • Feature variance: ${health.variancesOK ? '✅ OK' : '⚠️ Issue'}`)
  console.log(`  • Fingerprint: ${health.fingerprint}`)

  await writeOutputIfRequested(options, { symbol, asOf: asOf.toISOString(), perTF, final: { ...final, aggregateSide, shouldTrade }, health })
}

async function runBacktest(options: Record<string, OptionValue>): Promise<void> {
  const symbol = getStringOption(options, 'symbol') ?? 'SPY'
  const start = getDateOption(options, 'start', new Date('2024-10-01'))
  const end = getDateOption(options, 'end', new Date('2024-12-01'))

  console.log(`📈 Running backtest for ${symbol}`)
  console.log(`📅 Period: ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`)

  const harness = new HurricaneTestHarness()
  const metrics = await harness.runTest(symbol, start, end, false)

  console.log('\n📊 Backtest summary:')
  console.log(`  • Total predictions: ${metrics.totalPredictions}`)
  console.log(`  • Trades placed: ${metrics.tradedPositions}`)
  console.log(`  • Accuracy: ${formatPercent(metrics.accuracy)}`)
  console.log(`  • Win rate: ${formatPercent(metrics.winRate)}`)
  console.log(`  • Profit factor: ${metrics.profitFactor.toFixed(2)}`)
  console.log(`  • Sharpe ratio: ${metrics.sharpeRatio.toFixed(2)}`)
  console.log(`  • Max drawdown: ${formatPercent(metrics.maxDrawdown)}`)
  console.log(`  • Kelly efficiency: ${formatPercent(metrics.kellyEfficiency)}`)
  console.log(`  • P80 coverage: ${metrics.p80Coverage.toFixed(3)}`)

  await writeOutputIfRequested(options, { symbol, start: start.toISOString(), end: end.toISOString(), metrics })
}

async function runRealtime(options: Record<string, OptionValue>): Promise<void> {
  const symbol = getStringOption(options, 'symbol') ?? 'SPY'
  console.log(`⚡ Running real-time style snapshot for ${symbol}`)
  const harness = new HurricaneTestHarness()
  const metrics = await harness.runTest(symbol, new Date(), new Date(), true)

  if (metrics.totalPredictions > 0) {
    console.log('\n📊 Snapshot metrics:')
    console.log(`  • Accuracy: ${formatPercent(metrics.accuracy)}`)
    console.log(`  • Win rate: ${formatPercent(metrics.winRate)}`)
  } else {
    console.log('\nℹ️  Metrics will populate after trades are recorded.')
  }
}

function buildDefaultBounds(): ParameterBounds {
  return {
    rsiBounds: {
      '1m': { oversold: [30, 45], overbought: [55, 70] },
      '15m': { oversold: [35, 45], overbought: [55, 65] },
      '1h': { oversold: [35, 45], overbought: [55, 65] },
      '4h': { oversold: [37, 47], overbought: [53, 63] },
      '1d': { oversold: [40, 50], overbought: [50, 60] }
    },
    weightBounds: {
      maxWeight: [0.10, 0.30],
      minConfirmations: [2, 4],
      abstainThreshold: [0.4, 0.8]
    },
    regimeMultipliers: {
      trend: [1.0, 1.5],
      range: [0.8, 1.2],
      volexp: [0.5, 0.8],
      flux: [0.6, 0.9]
    }
  }
}

async function runCalibrate(options: Record<string, OptionValue>): Promise<void> {
  const symbol = getStringOption(options, 'symbol') ?? 'SPY'
  const start = getDateOption(options, 'start', new Date('2024-01-01'))
  const end = getDateOption(options, 'end', new Date('2024-12-01'))
  const iterations = Math.max(1, Math.floor(getNumberOption(options, 'iterations', 100)))
  const validationSplit = Math.min(0.5, Math.max(0.05, getNumberOption(options, 'validation', 0.2)))
  const targetAccuracy = Math.min(0.95, Math.max(0.5, getNumberOption(options, 'target', 0.75)))
  const p80Target = Math.min(0.95, Math.max(0.5, getNumberOption(options, 'p80', 0.8)))
  const p80Tolerance = Math.min(0.2, Math.max(0.01, getNumberOption(options, 'tolerance', 0.05)))

  const config: CalibrationConfig = {
    symbol,
    startDate: start,
    endDate: end,
    validationSplit,
    targetAccuracy,
    p80Target,
    p80Tolerance
  }

  const bounds = buildDefaultBounds()

  console.log(`🛠️  Starting calibration for ${symbol}`)
  console.log(`📅 Period: ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`)
  console.log(`🔁 Iterations: ${iterations}`)
  console.log(`🎯 Targets: accuracy ${formatPercent(targetAccuracy)} | p80 ${p80Target.toFixed(2)} ± ${p80Tolerance.toFixed(2)}`)

  const calibrator = new HurricaneCalibrator(config, bounds)
  const best = await calibrator.calibrate(iterations)

  console.log('\n🏁 Calibration complete!')
  console.log(`  • Score: ${best.score.toFixed(2)}`)
  console.log(`  • Accuracy: ${formatPercent(best.accuracy)}`)
  console.log(`  • p80 coverage: ${best.p80Coverage.toFixed(3)}`)
  console.log(`  • Sharpe ratio: ${best.sharpeRatio.toFixed(2)}`)
  console.log(`  • Max drawdown: ${formatPercent(best.maxDrawdown)}`)
  console.log(`  • Win rate: ${formatPercent(best.winRate)}`)
  console.log(`  • Profit factor: ${best.profitFactor.toFixed(2)}`)
  console.log(`  • Kelly fraction: ${formatPercent(best.kellyFraction)}`)

  await writeOutputIfRequested(options, {
    symbol,
    start: start.toISOString(),
    end: end.toISOString(),
    iterations,
    best
  })
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2))

  if (command === 'help' || getBooleanOption(options, 'help')) {
    printHelp()
    return
  }

  switch (command) {
    case 'predict':
      await runPredict(options)
      break
    case 'backtest':
      await runBacktest(options)
      break
    case 'realtime':
      await runRealtime(options)
      break
    case 'calibrate':
      await runCalibrate(options)
      break
    default:
      console.warn(`Unknown command: ${command}`)
      printHelp()
  }
}

main().catch(error => {
  console.error('❌ Hurricane CLI failed:', error instanceof Error ? error.message : error)
  if (error instanceof Error && error.stack) {
    console.error(error.stack)
  }
  process.exit(1)
})
