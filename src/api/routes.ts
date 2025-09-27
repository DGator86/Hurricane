import { Hono } from "hono";
import { predictAll } from "../core/PredictionEngine";

export const api = new Hono();

// Full ensemble prediction (with health + cone/ATR/Kelly fields)
api.get("/api/meteorology/predict", async c => {
  const symbol = (c.req.query("symbol") ?? "SPY").toUpperCase();
  const asofStr = c.req.query("asof");
  const asof = asofStr ? new Date(asofStr) : new Date();
  
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
  /* your real flow aggregation (ORATS/Polygon/UW proxy) */
  /* return c.json({ gex: ..., vanna: ..., charm: ..., z: { ... } }); */
  return c.json({ status: "placeholder", gex: 0, vanna: 0, charm: 0 });
});