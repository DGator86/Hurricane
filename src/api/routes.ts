import { Hono } from "hono";
import { predictAll } from "../core/PredictionEngine";
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
  const asof = asofStr ? new Date(asofStr) : new Date();

  const uwClient = buildUnusualWhalesClient(c.env ?? {});

  if (uwClient.enabled) {
    try {
      const result = await uwClient.fetchEnhancedPrediction(symbol, asofStr ?? undefined);
      return c.json(result);
    } catch (error) {
      console.error("Unusual Whales prediction error:", error);
    }
  }

  try {
    const result = await predictAll(symbol, asof);
    return c.json(result);
  } catch (error) {
    console.error("Prediction error:", error);
    return c.json({ error: "Failed to generate prediction", details: error.message }, 500);
  }
});

// Regime snapshot (per TF)
api.get("/api/meteorology/regime", async c => {
  const symbol = (c.req.query("symbol") ?? "SPY").toUpperCase();
  const asofStr = c.req.query("asof");
  const asof = asofStr ? new Date(asofStr) : new Date();

  const uwClient = buildUnusualWhalesClient(c.env ?? {});

  if (uwClient.enabled) {
    try {
      const result = await uwClient.fetchPrediction(symbol, asofStr ?? undefined);
      const payload = result?.predictions ?? result?.forecasts ?? {};
      const regimes = Object.entries(payload).map(([tf, details]) => ({
        tf,
        regime: (details as any)?.regime ?? result?.regime?.state ?? "UNKNOWN",
        confidence: (details as any)?.confidence ?? (details as any)?.score ?? 0.5,
        side: (details as any)?.direction ?? "NEUTRAL"
      }));

      if (regimes.length > 0) {
        return c.json(regimes);
      }
    } catch (error) {
      console.error("Unusual Whales regime error:", error);
    }
  }

  try {
    const { perTF } = await predictAll(symbol, asof);
    return c.json(perTF.map(x => ({
      tf: x.tf,
      regime: x.regime,
      confidence: x.confidence, 
      side: x.side 
    })));
  } catch (error) {
    console.error("Regime error:", error);
    return c.json({ error: "Failed to get regime", details: error.message }, 500);
  }
});

// Options flow passthrough (keep your existing)
api.get("/api/meteorology/flow", async c => {
  const symbol = (c.req.query("symbol") ?? "SPY").toUpperCase();
  const uwClient = buildUnusualWhalesClient(c.env ?? {});

  if (uwClient.enabled) {
    try {
      const flow = await uwClient.fetchFlow(symbol);
      return c.json(flow);
    } catch (error) {
      console.error("Unusual Whales flow error:", error);
    }
  }

  /* your real flow aggregation (ORATS/Polygon/UW proxy) */
  /* return c.json({ gex: ..., vanna: ..., charm: ..., z: { ... } }); */
  return c.json({ status: "placeholder", gex: 0, vanna: 0, charm: 0 });
});