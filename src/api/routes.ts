import { Hono } from "hono";
import { buildUnusualWhalesClient } from "../services/unusualWhales";

type Env = {
  Bindings: {
    UNUSUAL_WHALES_API_BASE?: string;
    UNUSUAL_WHALES_API_TOKEN?: string;
    UNUSUAL_WHALES_PREDICT_PATH?: string;
    UNUSUAL_WHALES_ENHANCED_PATH?: string;
    UNUSUAL_WHALES_FLOW_PATH?: string;
  };
};

export const api = new Hono<Env>();

// Full ensemble prediction (with health + cone/ATR/Kelly fields)
api.get("/api/meteorology/predict", async c => {
  const symbol = (c.req.query("symbol") ?? "SPY").toUpperCase();
  const asofStr = c.req.query("asof");

  const uwClient = buildUnusualWhalesClient(c.env ?? {});

  if (!uwClient.enabled) {
    return c.json({
      error: "Unusual Whales integration disabled",
      details: "Set UNUSUAL_WHALES_API_TOKEN to enable prediction access."
    }, 503);
  }

  try {
    const result = await uwClient.fetchEnhancedPrediction(symbol, asofStr ?? undefined);
    return c.json(result);
  } catch (error: unknown) {
    console.error("Unusual Whales prediction error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: "Failed to fetch Unusual Whales prediction", details: message }, 502);
  }
});


// Regime snapshot (per TF)
api.get("/api/meteorology/regime", async c => {
  const symbol = (c.req.query("symbol") ?? "SPY").toUpperCase();
  const asofStr = c.req.query("asof");

  const uwClient = buildUnusualWhalesClient(c.env ?? {});

  if (!uwClient.enabled) {
    return c.json({
      error: "Unusual Whales integration disabled",
      details: "Set UNUSUAL_WHALES_API_TOKEN to enable regime access."
    }, 503);
  }

  try {
    const result = await uwClient.fetchPrediction(symbol, asofStr ?? undefined);
    const payload = result?.predictions ?? result?.forecasts ?? {};
    const regimes = Object.entries(payload).map(([tf, details]) => ({
      tf,
      regime: (details as any)?.regime ?? result?.regime?.state ?? "UNKNOWN",
      confidence: (details as any)?.confidence ?? (details as any)?.score ?? 0.5,
      side: (details as any)?.direction ?? "NEUTRAL"
    }));

    return c.json(regimes);
  } catch (error: unknown) {
    console.error("Unusual Whales regime error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: "Failed to fetch Unusual Whales regime", details: message }, 502);
  }
});

// Options flow passthrough (keep your existing)
api.get("/api/meteorology/flow", async c => {
  const symbol = (c.req.query("symbol") ?? "SPY").toUpperCase();
  const uwClient = buildUnusualWhalesClient(c.env ?? {});

  if (!uwClient.enabled) {
    return c.json({
      error: "Unusual Whales integration disabled",
      details: "Set UNUSUAL_WHALES_API_TOKEN to enable flow access."
    }, 503);
  }

  try {
    const flow = await uwClient.fetchFlow(symbol);
    return c.json(flow);
  } catch (error: unknown) {
    console.error("Unusual Whales flow error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: "Failed to fetch Unusual Whales flow", details: message }, 502);
  }
});
