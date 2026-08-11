globalThis.window=undefined;
require('./data.js');
const E=require('./engine.js');
const D=globalThis.PRAS_DATA;
const cfg={loadYear:'2025',customerCount:10000,participationPct:100,loadScalePct:100,pvDailyKWh:10.8,pvScalePct:100,essAdoptionPct:100,essCapacityKWh:8,essPowerKW:3,minSocPct:10,maxSocPct:90,initialSocPct:50,roundTripEfficiencyPct:90,socStepKWh:0.2,allowGridCharge:true,allowBatteryExport:true,tariffs:JSON.parse(JSON.stringify(D.tariffs))};
const r=E.simulate(cfg,D);
function assert(x,msg){if(!x)throw new Error(msg)}
assert(Number.isFinite(r.total.changeNetRevenue),'non-finite result');
assert(Math.abs(r.decomposition.totalEffect-(r.decomposition.buyPriceEffect+r.decomposition.sellPriceEffect+r.decomposition.behaviorEffect))<1e-5,'decomposition mismatch');
assert(Math.abs(r.baseEss.soc[0]-r.baseEss.soc[24])<1e-8,'base end SOC mismatch');
assert(Math.abs(r.newEss.soc[0]-r.newEss.soc[24])<1e-8,'new end SOC mismatch');
assert(r.base.import.every(x=>x>=-1e-9)&&r.new.export.every(x=>x>=-1e-9),'negative grid flow');
console.log(JSON.stringify({changeNetRevenue:r.total.changeNetRevenue,perCustomerChange:r.perCustomer.changeNetRevenue,baseImport:r.perCustomer.baseImport,newImport:r.perCustomer.newImport,baseExport:r.perCustomer.baseExport,newExport:r.perCustomer.newExport,decomposition:r.decomposition},null,2));
