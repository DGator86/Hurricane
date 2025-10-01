/**
 * Utility that enforces whether the application is allowed to fall back to
 * synthetic data. The default policy is to require live market data so that
 * production runs always execute the full algorithm with real inputs.
 */

type EnvLike = Record<string, string | undefined>

// Allow using process.env in strict TypeScript without pulling in Node types.
declare const process: { env?: EnvLike } | undefined

function collectEnvironment(): EnvLike {
  const env: EnvLike = {}

  if (typeof process !== 'undefined' && process?.env) {
    Object.assign(env, process.env)
  }

  try {
    const metaEnv = (import.meta as any)?.env as EnvLike | undefined
    if (metaEnv) {
      Object.assign(env, metaEnv)
    }
  } catch {
    // Ignored – running in a non-Vite/Node environment.
  }

  return env
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return defaultValue
}

export class DataSourceGuard {
  /**
   * Returns true when synthetic fallbacks are explicitly allowed via
   * environment variables.
   */
  static isSyntheticAllowed(): boolean {
    const env = collectEnvironment()

    const allowSynthetic = parseBoolean(env.HURRICANE_ALLOW_SYNTHETIC, false)
    const requireLiveData = parseBoolean(env.HURRICANE_REQUIRE_LIVE_DATA, true)

    if (allowSynthetic) {
      return true
    }

    return !requireLiveData
  }

  /**
   * Throws an error when synthetic data would be used while the guard
   * requires live market inputs. The context message identifies which code
   * path attempted to generate synthetic data.
   */
  static ensureLiveData(context: string): void {
    if (!this.isSyntheticAllowed()) {
      throw new Error(
        `Synthetic data usage is disabled (${context}). ` +
          'Provide live-market credentials (Polygon, Alpha Vantage, etc.) or set ' +
          '`HURRICANE_REQUIRE_LIVE_DATA=false`/`HURRICANE_ALLOW_SYNTHETIC=true` if you intend to operate in a sandbox.'
      )
    }
  }

  /**
   * Returns a human readable summary of the current policy – useful for
   * logging in diagnostics.
   */
  static describePolicy(): string {
    return this.isSyntheticAllowed()
      ? 'Synthetic fallbacks enabled (development/testing mode).'
      : 'Synthetic fallbacks disabled – live market data required.'
  }
}
