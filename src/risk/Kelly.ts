export function fractionalKelly(conf:number, rr:number, regime:string){
  // p from calibrated confidence
  const p = Math.max(0.01, Math.min(0.99, conf));
  const b = Math.max(0.1, rr); // reward:risk
  const fStar = ((p*(1+b))-1)/b; // classic Kelly
  const lambda = (regime==="VolExp"||regime==="Flux") ? 0.25 : 0.5; // half-kelly in calm/trend, quarter in rough regimes
  const fraction = Math.max(0, lambda * fStar * conf);
  return { fraction, maxCap: 0.25 };
}