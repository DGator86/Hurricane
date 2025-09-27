export const healthSuite = {
  check(perTF:any[]){
    const sigs = perTF.map(x => `${x.tf}:${x.side}:${Math.round(100*x.confidence)}`);
    const unique = new Set(sigs).size;
    const tfCollapse = unique <= 2;

    const last = perTF.map(x=>x.side);
    const allCall = last.every(s=>s==="CALL");
    const allPut  = last.every(s=>s==="PUT");
    const dirBias = allCall || allPut;

    const variancesOK = perTF.every(x => x.entryPx>0 && Number.isFinite(x.confidence));

    return {
      tfCollapse, dirBias, variancesOK,
      fingerprint: sigs.join("|"),
      passed: !tfCollapse && !dirBias && variancesOK
    };
  }
};