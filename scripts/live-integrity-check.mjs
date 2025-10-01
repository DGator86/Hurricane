#!/usr/bin/env node

/**
 * Sanity check script that verifies the Hurricane stack is configured to run
 * against real data sources and that external integrations (GitHub + Alpaca)
 * are reachable. The script intentionally exits with a non-zero code when a
 * requirement is not satisfied so it can be wired into CI pipelines.
 */

const requiredMarketKeys = ['POLYGON_API_KEY', 'ALPHA_VANTAGE_API_KEY']
const requiredAlpacaKeys = ['ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY']
const requiredGitHubVars = ['GITHUB_TOKEN', 'GITHUB_REPOSITORY']

function assertEnvVars(names, label) {
  const missing = names.filter((name) => !process.env[name] || process.env[name]?.trim() === '')
  if (missing.length > 0) {
    throw new Error(`Missing ${label} environment variables: ${missing.join(', ')}`)
  }
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

async function verifyGitHub() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY

  const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'hurricane-live-integrity-check'
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub repository check failed (${response.status}): ${body}`)
  }

  return response.json()
}

async function verifyAlpaca() {
  const baseUrl = process.env.ALPACA_API_BASE_URL ?? 'https://paper-api.alpaca.markets'
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v2/account`, {
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY_ID,
      'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET_KEY,
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Alpaca connectivity check failed (${response.status}): ${body}`)
  }

  return response.json()
}

async function main() {
  const allowSynthetic = parseBoolean(process.env.HURRICANE_ALLOW_SYNTHETIC, false)
  const requireLiveData = parseBoolean(process.env.HURRICANE_REQUIRE_LIVE_DATA, true)

  if (allowSynthetic || !requireLiveData) {
    throw new Error(
      'Synthetic data is currently allowed. Set HURRICANE_REQUIRE_LIVE_DATA=true (default) ' +
        'and do not override with HURRICANE_ALLOW_SYNTHETIC=true when running production.'
    )
  }

  assertEnvVars(requiredMarketKeys, 'market data')
  assertEnvVars(requiredAlpacaKeys, 'Alpaca')
  assertEnvVars(requiredGitHubVars, 'GitHub')

  console.log('✅ Environment variables present. Checking external integrations...')

  const [githubInfo, alpacaAccount] = await Promise.all([verifyGitHub(), verifyAlpaca()])

  console.log(`🟢 GitHub repository accessible: ${githubInfo.full_name}`)
  console.log(`🟢 Alpaca account status: ${alpacaAccount.status}`)
  console.log('Hurricane integrity check completed successfully. Live data configuration verified.')
}

main().catch((error) => {
  console.error('❌ Live integrity check failed:')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
