(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.PRASEngine=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const EPS=1e-9;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const sum=a=>a.reduce((s,x)=>s+x,0);

  function noBatteryDay(load,pv,buy,sell){
    const n=24, out={cost:0,salesRevenue:0,purchasePayout:0,importEnergy:0,exportEnergy:0,
      import:Array(n).fill(0),export:Array(n).fill(0),soc:Array(n+1).fill(0),charge:Array(n).fill(0),
      discharge:Array(n).fill(0),gridCharge:Array(n).fill(0),pvCharge:Array(n).fill(0),pvDirect:Array(n).fill(0),pvExport:Array(n).fill(0)};
    for(let h=0;h<n;h++){
      const net=load[h]-pv[h];
      const imp=Math.max(net,0), exp=Math.max(-net,0);
      out.import[h]=imp; out.export[h]=exp;
      out.pvDirect[h]=Math.min(load[h],pv[h]); out.pvExport[h]=exp;
      out.salesRevenue += imp*buy[h]; out.purchasePayout += exp*sell[h];
      out.importEnergy += imp; out.exportEnergy += exp;
    }
    out.cost=out.salesRevenue-out.purchasePayout;
    out.pvSelfUse=sum(out.pvDirect); out.pvGeneration=sum(pv);
    out.pvUtilizationRate=out.pvGeneration>EPS?out.pvSelfUse/out.pvGeneration:0;
    return out;
  }

  function optimizeDay(load,pv,buy,sell,p){
    const cap=Math.max(0,+p.capacityKWh||0);
    if(cap<EPS) return noBatteryDay(load,pv,buy,sell);
    const minSoc=cap*clamp((+p.minSocPct||0)/100,0,1);
    const maxSoc=cap*clamp((+p.maxSocPct||100)/100,0,1);
    if(maxSoc-minSoc<EPS) return noBatteryDay(load,pv,buy,sell);
    const initTarget=cap*clamp((+p.initialSocPct||50)/100,0,1);
    const power=Math.max(0,+p.powerKW||0);
    const rte=clamp((+p.roundTripEfficiencyPct||90)/100,0.01,1);
    const etaC=Math.sqrt(rte), etaD=Math.sqrt(rte);
    const allowGridCharge=!!p.allowGridCharge;
    const allowBatteryExport=!!p.allowBatteryExport;
    const requestedStep=Math.max(0.05,+p.socStepKWh||0.2);
    const span=maxSoc-minSoc;
    const steps=Math.max(1,Math.round(span/requestedStep));
    const step=span/steps;
    const states=Array.from({length:steps+1},(_,i)=>minSoc+i*step);
    const nearestIndex=x=>{
      let i=Math.round((clamp(x,minSoc,maxSoc)-minSoc)/step);
      return clamp(i,0,steps);
    };
    const initIdx=nearestIndex(initTarget);
    const INF=1e100;
    let dp=Array(states.length).fill(INF); dp[initIdx]=0;
    const prev=Array.from({length:24},()=>Array(states.length).fill(-1));
    const prevGrid=Array.from({length:24},()=>Array(states.length).fill(null));

    for(let h=0;h<24;h++){
      const ndp=Array(states.length).fill(INF);
      const net0=load[h]-pv[h];
      for(let si=0;si<states.length;si++){
        if(dp[si]>=INF/2) continue;
        const soc=states[si];
        for(let ni=0;ni<states.length;ni++){
          const nsoc=states[ni], delta=nsoc-soc;
          let gridNet=net0;
          if(delta>EPS){
            const chargeInput=delta/etaC;
            if(chargeInput-power>1e-8) continue;
            if(!allowGridCharge){
              const pvSurplus=Math.max(-net0,0);
              if(chargeInput-pvSurplus>1e-8) continue;
            }
            gridNet += chargeInput;
          } else if(delta<-EPS){
            const dischargeOut=(-delta)*etaD;
            if(dischargeOut-power>1e-8) continue;
            if(!allowBatteryExport && dischargeOut-Math.max(net0,0)>1e-8) continue;
            gridNet -= dischargeOut;
          }
          const imp=Math.max(gridNet,0), exp=Math.max(-gridNet,0);
          const c=imp*buy[h]-exp*sell[h];
          const cand=dp[si]+c;
          if(cand<ndp[ni]-1e-10){
            ndp[ni]=cand; prev[h][ni]=si; prevGrid[h][ni]=gridNet;
          }
        }
      }
      dp=ndp;
    }
    // 대표일 연간화에서 일간 SOC 에너지 차익을 인위적으로 만들지 않도록 종말 SOC=초기 SOC 강제
    let endIdx=initIdx;
    if(dp[endIdx]>=INF/2){
      endIdx=dp.reduce((best,v,i)=>v<dp[best]?i:best,0);
    }
    const socIdx=Array(25).fill(initIdx); socIdx[24]=endIdx;
    const gridNet=Array(24).fill(0);
    for(let h=23;h>=0;h--){
      const ei=socIdx[h+1];
      const pi=prev[h][ei];
      if(pi<0){ socIdx[h]=ei; gridNet[h]=load[h]-pv[h]; }
      else { socIdx[h]=pi; gridNet[h]=prevGrid[h][ei]; }
    }

    const out={cost:0,salesRevenue:0,purchasePayout:0,importEnergy:0,exportEnergy:0,
      import:Array(24).fill(0),export:Array(24).fill(0),soc:socIdx.map(i=>states[i]),charge:Array(24).fill(0),
      discharge:Array(24).fill(0),gridCharge:Array(24).fill(0),pvCharge:Array(24).fill(0),pvDirect:Array(24).fill(0),pvExport:Array(24).fill(0)};
    for(let h=0;h<24;h++){
      const delta=out.soc[h+1]-out.soc[h];
      const net0=load[h]-pv[h];
      let chargeInput=0, dischargeOut=0;
      if(delta>EPS) chargeInput=delta/etaC;
      if(delta<-EPS) dischargeOut=(-delta)*etaD;
      const pvSurplus=Math.max(pv[h]-load[h],0);
      const pvCharge=Math.min(chargeInput,pvSurplus);
      const gridCharge=Math.max(chargeInput-pvCharge,0);
      const imp=Math.max(gridNet[h],0), exp=Math.max(-gridNet[h],0);
      const battExport=Math.max(dischargeOut-Math.max(net0,0),0);
      const pvExport=Math.max(exp-battExport,0);
      out.charge[h]=chargeInput; out.discharge[h]=dischargeOut; out.gridCharge[h]=gridCharge; out.pvCharge[h]=pvCharge;
      out.import[h]=imp; out.export[h]=exp; out.pvDirect[h]=Math.min(load[h],pv[h]); out.pvExport[h]=pvExport;
      out.salesRevenue+=imp*buy[h]; out.purchasePayout+=exp*sell[h]; out.importEnergy+=imp; out.exportEnergy+=exp;
    }
    out.cost=out.salesRevenue-out.purchasePayout;
    out.pvGeneration=sum(pv);
    out.pvSelfUse=sum(out.pvDirect)+sum(out.pvCharge);
    out.pvUtilizationRate=out.pvGeneration>EPS?out.pvSelfUse/out.pvGeneration:0;
    out.batteryChargeEnergy=sum(out.charge); out.batteryDischargeEnergy=sum(out.discharge);
    out.gridChargeEnergy=sum(out.gridCharge);
    return out;
  }

  function blend(a,b,r){
    r=clamp(r,0,1);
    const o={};
    for(const k of Object.keys(a)){
      if(Array.isArray(a[k])) o[k]=a[k].map((x,i)=>x*(1-r)+(b[k][i]??0)*r);
      else if(typeof a[k]==='number') o[k]=a[k]*(1-r)+(b[k]??0)*r;
    }
    return o;
  }

  function simulate(cfg,data){
    const load=data.loadProfiles[cfg.loadYear||'2025'].map(x=>x*(cfg.loadScalePct/100));
    const shape=data.pvShape2025;
    const shapeSum=sum(shape)||1;
    const pv=shape.map(x=>x/shapeSum*cfg.pvDailyKWh*(cfg.pvScalePct/100));
    const t=cfg.tariffs;
    const battParams={capacityKWh:cfg.essCapacityKWh,powerKW:cfg.essPowerKW,minSocPct:cfg.minSocPct,maxSocPct:cfg.maxSocPct,
      initialSocPct:cfg.initialSocPct,roundTripEfficiencyPct:cfg.roundTripEfficiencyPct,socStepKWh:cfg.socStepKWh,
      allowGridCharge:cfg.allowGridCharge,allowBatteryExport:cfg.allowBatteryExport};

    const baseNo=noBatteryDay(load,pv,t.baseBuy,t.baseSell);
    const newNo=noBatteryDay(load,pv,t.newBuy,t.newSell);
    const baseEss=optimizeDay(load,pv,t.baseBuy,t.baseSell,battParams);
    const newEss=optimizeDay(load,pv,t.newBuy,t.newSell,battParams);
    const er=clamp(cfg.essAdoptionPct/100,0,1);
    const base=blend(baseNo,baseEss,er), newer=blend(newNo,newEss,er);

    const days=365;
    const N=Math.max(0,+cfg.customerCount||0), pr=clamp(cfg.participationPct/100,0,1);
    const participants=N*pr;
    const annual=(x)=>x*days;
    const total=(x)=>annual(x)*participants;
    const allBase=(x)=>annual(x)*N;
    const allScenario=(baseVal,newVal)=>annual(baseVal)*(N-participants)+annual(newVal)*participants;

    // 가격효과: 기준 물량을 신규 단가로 재평가
    let buyPriceEffectDay=0,sellPriceEffectDay=0,cfRevenueDay=0;
    for(let h=0;h<24;h++){
      buyPriceEffectDay += base.import[h]*(t.newBuy[h]-t.baseBuy[h]);
      sellPriceEffectDay += -base.export[h]*(t.newSell[h]-t.baseSell[h]);
      cfRevenueDay += base.import[h]*t.newBuy[h]-base.export[h]*t.newSell[h];
    }
    const behaviorEffectDay=newer.cost-cfRevenueDay;

    return {
      load,pv,base,new:newer,baseNo,newNo,baseEss,newEss,
      perCustomer:{
        baseNetRevenue:annual(base.cost),newNetRevenue:annual(newer.cost),changeNetRevenue:annual(newer.cost-base.cost),
        baseSalesRevenue:annual(base.salesRevenue),newSalesRevenue:annual(newer.salesRevenue),
        basePurchasePayout:annual(base.purchasePayout),newPurchasePayout:annual(newer.purchasePayout),
        baseImport:annual(base.importEnergy),newImport:annual(newer.importEnergy),baseExport:annual(base.exportEnergy),newExport:annual(newer.exportEnergy),
        basePvUtilization:base.pvUtilizationRate,newPvUtilization:newer.pvUtilizationRate,
        newGridCharge:annual(newer.gridChargeEnergy||0),newBatteryDischarge:annual(newer.batteryDischargeEnergy||0)
      },
      total:{
        baseNetRevenue:allBase(base.cost),newNetRevenue:allScenario(base.cost,newer.cost),changeNetRevenue:total(newer.cost-base.cost),
        baseSalesRevenue:allBase(base.salesRevenue),newSalesRevenue:allScenario(base.salesRevenue,newer.salesRevenue),
        changeSalesRevenue:total(newer.salesRevenue-base.salesRevenue),
        basePurchasePayout:allBase(base.purchasePayout),newPurchasePayout:allScenario(base.purchasePayout,newer.purchasePayout),
        changePurchasePayout:total(newer.purchasePayout-base.purchasePayout),
        baseImport:allBase(base.importEnergy),newImport:allScenario(base.importEnergy,newer.importEnergy),
        baseExport:allBase(base.exportEnergy),newExport:allScenario(base.exportEnergy,newer.exportEnergy),
        participants
      },
      decomposition:{
        buyPriceEffect:total(buyPriceEffectDay),sellPriceEffect:total(sellPriceEffectDay),behaviorEffect:total(behaviorEffectDay),
        totalEffect:total(newer.cost-base.cost)
      }
    };
  }
  return {simulate,optimizeDay,noBatteryDay,blend,clamp,sum};
});
