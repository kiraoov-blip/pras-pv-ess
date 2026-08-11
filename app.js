(function(){
  const D=window.PRAS_DATA,E=window.PRASEngine;
  const $=id=>document.getElementById(id);
  const ids=['loadYear','customerCount','participationPct','loadScalePct','pvDailyKWh','pvScalePct','essAdoptionPct','essCapacityKWh','essPowerKW','minSocPct','maxSocPct','initialSocPct','roundTripEfficiencyPct','socStepKWh'];
  let tariffs=JSON.parse(JSON.stringify(D.tariffs));
  const colors={load:'#344054',pv:'#f59e0b',baseImp:'#98a2b3',newImp:'#2f6fde',baseExp:'#a855f7',newExp:'#087a55',soc:'#b54708',baseBuy:'#667085',newBuy:'#2f6fde',baseSell:'#9e77ed',newSell:'#087a55'};
  const fmt0=x=>Math.round(x).toLocaleString('ko-KR');
  const fmt1=x=>(Math.round(x*10)/10).toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1});
  function money(x){const a=Math.abs(x);if(a>=1e8)return `${(x/1e8).toLocaleString('ko-KR',{maximumFractionDigits:2})}억 원`;if(a>=1e4)return `${(x/1e4).toLocaleString('ko-KR',{maximumFractionDigits:1})}만 원`;return `${fmt0(x)}원`;}
  function signedMoney(x){return `${x>0?'+':''}${money(x)}`}
  function setSign(el,x){el.classList.remove('positive','negative'); if(x>0)el.classList.add('positive'); if(x<0)el.classList.add('negative');}
  function cfg(){return {
    loadYear:$('loadYear').value,customerCount:+$('customerCount').value,participationPct:+$('participationPct').value,loadScalePct:+$('loadScalePct').value,
    pvDailyKWh:+$('pvDailyKWh').value,pvScalePct:+$('pvScalePct').value,essAdoptionPct:+$('essAdoptionPct').value,essCapacityKWh:+$('essCapacityKWh').value,
    essPowerKW:+$('essPowerKW').value,minSocPct:+$('minSocPct').value,maxSocPct:+$('maxSocPct').value,initialSocPct:+$('initialSocPct').value,
    roundTripEfficiencyPct:+$('roundTripEfficiencyPct').value,socStepKWh:+$('socStepKWh').value,allowGridCharge:$('allowGridCharge').checked,
    allowBatteryExport:$('allowBatteryExport').checked,tariffs
  }}
  function buildTariff(){
    const rows=[['baseBuy','기준 구매단가'],['newBuy','신규 구매단가'],['baseSell','기준 판매단가'],['newSell','신규 판매단가']];
    let h='<thead><tr><th>구분</th>'+Array.from({length:24},(_,i)=>`<th>H${String(i+1).padStart(2,'0')}</th>`).join('')+'</tr></thead><tbody>';
    rows.forEach(([k,n])=>{h+=`<tr><td>${n}</td>`+tariffs[k].map((v,i)=>`<td><input type="number" step="0.1" data-tariff="${k}" data-h="${i}" value="${v.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}"></td>`).join('')+'</tr>'});
    $('tariffTable').innerHTML=h+'</tbody>';
    $('tariffTable').querySelectorAll('input').forEach(inp=>inp.addEventListener('change',()=>{tariffs[inp.dataset.tariff][+inp.dataset.h]=+inp.value;run()}));
  }
  function svgLineChart(target,series,opts={}){
    const el=$(target),W=Math.max(el.clientWidth||650,500),H=280,m={l:46,r:16,t:16,b:34};
    const vals=series.flatMap(s=>s.data).filter(Number.isFinite); let ymin=opts.ymin??Math.min(0,...vals),ymax=opts.ymax??Math.max(...vals);
    if(Math.abs(ymax-ymin)<1e-9)ymax=ymin+1; const x=i=>m.l+i*(W-m.l-m.r)/23,y=v=>m.t+(ymax-v)*(H-m.t-m.b)/(ymax-ymin);
    let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%">`;
    for(let j=0;j<=4;j++){const v=ymin+(ymax-ymin)*j/4,yy=y(v);s+=`<line x1="${m.l}" y1="${yy}" x2="${W-m.r}" y2="${yy}" stroke="#eaecf0"/><text x="${m.l-7}" y="${yy+4}" text-anchor="end" font-size="10" fill="#667085">${opts.formatY?opts.formatY(v):v.toFixed(1)}</text>`}
    [0,3,7,11,15,19,23].forEach(i=>s+=`<text x="${x(i)}" y="${H-10}" text-anchor="middle" font-size="10" fill="#667085">${String(i+1).padStart(2,'0')}</text>`);
    series.forEach(sr=>{const pts=sr.data.map((v,i)=>`${x(i)},${y(v)}`).join(' ');s+=`<polyline points="${pts}" fill="none" stroke="${sr.color}" stroke-width="${sr.width||2}" stroke-dasharray="${sr.dash||''}" stroke-linejoin="round" stroke-linecap="round"/>`});
    el.innerHTML=s+'</svg>';
  }
  function legend(el,items){$(el).innerHTML=items.map(i=>`<span style="--c:${i.color}">${i.name}</span>`).join('')}
  function detail(res){let h='<thead><tr><th>시간</th><th>부하</th><th>PV</th><th>기준 구매</th><th>신규 구매</th><th>기준 판매</th><th>신규 판매</th><th>신규 ESS 충전</th><th>신규 ESS 방전</th><th>신규 SOC</th></tr></thead><tbody>';
    for(let i=0;i<24;i++)h+=`<tr><td>H${String(i+1).padStart(2,'0')}</td><td>${res.load[i].toFixed(3)}</td><td>${res.pv[i].toFixed(3)}</td><td>${res.base.import[i].toFixed(3)}</td><td>${res.new.import[i].toFixed(3)}</td><td>${res.base.export[i].toFixed(3)}</td><td>${res.new.export[i].toFixed(3)}</td><td>${(res.new.charge[i]||0).toFixed(3)}</td><td>${(res.new.discharge[i]||0).toFixed(3)}</td><td>${(res.new.soc[i+1]||0).toFixed(2)}</td></tr>`;
    $('detailTable').innerHTML=h+'</tbody>';
  }
  function bars(d){const arr=[['구매단가 효과',d.buyPriceEffect],['판매단가 효과',d.sellPriceEffect],['충방전 행동효과',d.behaviorEffect],['총 재무영향',d.totalEffect]];const max=Math.max(...arr.map(x=>Math.abs(x[1])),1);$('decomp').innerHTML=arr.map(([n,v],i)=>{const w=Math.abs(v)/max*100;const bg=v>=0?'#12b76a':'#f04438';return `<div class="bar-row"><div class="bar-label">${n}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%;left:${v>=0?50-w/2:50}%;background:${bg};opacity:${i===3?1:.78}"></div></div><div class="bar-value ${v>=0?'positive':'negative'}">${signedMoney(v)}</div></div>`}).join('')+'<div class="hint">(+): 한전 순 전력량요금 수입 증가, (–): 감소. 행동효과는 신규 단가 하에서 ESS 최적운전으로 물량이 변한 효과임.</div>'}
  function energyCards(r){const p=r.perCustomer;const cards=[['연간 한전 구매량',`${fmt0(p.baseImport)} → ${fmt0(p.newImport)} kWh/호`],['연간 계통 판매량',`${fmt0(p.baseExport)} → ${fmt0(p.newExport)} kWh/호`],['PV 현장활용률',`${(p.basePvUtilization*100).toFixed(1)}% → ${(p.newPvUtilization*100).toFixed(1)}%`],['신규안 계통충전',`${fmt0(p.newGridCharge)} kWh/호·년`],['신규안 ESS 방전',`${fmt0(p.newBatteryDischarge)} kWh/호·년`],['실제 참여 고객수',`${fmt0(r.total.participants)}호`]];$('energyKpis').innerHTML=cards.map(([a,b])=>`<div class="note-card"><b>${a}</b><p>${b}</p></div>`).join('')}
  function assumptions(){const m=D.metadata;$('assumptionCards').innerHTML=`<div class="note-card"><b>부하 데이터</b><p>${m.loadSource}</p></div><div class="note-card"><b>태양광 데이터</b><p>${m.pvSource}<br>89호 중 365일 완전자료 ${m.pvCompleteCustomers}호</p></div><div class="note-card"><b>실측 발전규모 참고</b><p>89호 관측치 기준 평균 ${m.pvObservedAvgDailyKWh.toFixed(2)}kWh/일, ${fmt0(m.pvObservedAnnualKWh)}kWh/년·호. 초기 Flux 가정은 10.8kWh/대표일.</p></div><div class="note-card"><b>재무 범위</b><p>기본요금·연료비조정·기후환경요금·부가세·기금 제외. 구매 전력량요금 수입과 고객 역송전력 매입지급액만 반영.</p></div><div class="note-card"><b>ESS 운전</b><p>24시간 동적계획법으로 고객 순 전력량요금 최소화. 용량·출력·SOC·효율·계통충전·ESS 역송 제약 적용.</p></div><div class="note-card"><b>v0.1 한계</b><p>${m.note}</p></div>`}
  function run(){
    const c=cfg();if(c.minSocPct>c.maxSocPct){alert('최소 SOC는 최대 SOC보다 작아야 합니다.');return}
    const r=E.simulate(c,D);window.lastResult=r;
    const kn=$('kpiNet');kn.textContent=signedMoney(r.total.changeNetRevenue);setSign(kn,r.total.changeNetRevenue);$('kpiNetSub').textContent=`기준 ${money(r.total.baseNetRevenue)} → 신규 ${money(r.total.newNetRevenue)}`;
    const ks=$('kpiSales');ks.textContent=signedMoney(r.total.changeSalesRevenue);setSign(ks,r.total.changeSalesRevenue);$('kpiSalesSub').textContent=`기준 ${money(r.total.baseSalesRevenue)} → 신규 ${money(r.total.newSalesRevenue)}`;
    const kp=$('kpiPayout');kp.textContent=signedMoney(r.total.changePurchasePayout);setSign(kp,-r.total.changePurchasePayout);$('kpiPayoutSub').textContent=`기준 ${money(r.total.basePurchasePayout)} → 신규 ${money(r.total.newPurchasePayout)}`;
    const kc=$('kpiPerCust');kc.textContent=signedMoney(r.perCustomer.changeNetRevenue);setSign(kc,r.perCustomer.changeNetRevenue);
    const energySeries=[{name:'부하',data:r.load,color:colors.load},{name:'PV',data:r.pv,color:colors.pv},{name:'기준 구매',data:r.base.import,color:colors.baseImp,dash:'5 4'},{name:'신규 구매',data:r.new.import,color:colors.newImp},{name:'신규 판매',data:r.new.export,color:colors.newExp}];
    legend('energyLegend',energySeries);svgLineChart('energyChart',energySeries,{formatY:v=>v.toFixed(1)});
    const priceSeries=[{name:'기준 구매',data:tariffs.baseBuy,color:colors.baseBuy},{name:'신규 구매',data:tariffs.newBuy,color:colors.newBuy},{name:'기준 판매',data:tariffs.baseSell,color:colors.baseSell,dash:'5 4'},{name:'신규 판매',data:tariffs.newSell,color:colors.newSell}];
    legend('priceLegend',priceSeries);svgLineChart('priceChart',priceSeries,{ymin:0,formatY:v=>Math.round(v)});
    bars(r.decomposition);energyCards(r);detail(r);
  }
  $('recalc').addEventListener('click',run);ids.forEach(id=>$(id).addEventListener('change',run));$('allowGridCharge').addEventListener('change',run);$('allowBatteryExport').addEventListener('change',run);
  $('applyObservedPv').onclick=()=>{$('pvDailyKWh').value=D.metadata.pvObservedAvgDailyKWh.toFixed(2);run()};$('applyFluxPv').onclick=()=>{$('pvDailyKWh').value='10.8';run()};
  $('resetTariff').onclick=()=>{tariffs=JSON.parse(JSON.stringify(D.tariffs));buildTariff();run()};
  $('pasteTariff').onclick=()=>{const row=prompt('대상 행을 입력하세요: baseBuy / newBuy / baseSell / newSell','newSell');if(!tariffs[row])return;const text=prompt('공백, 쉼표 또는 줄바꿈으로 구분된 24개 단가를 붙여넣으세요.');if(!text)return;const a=text.trim().split(/[\s,;]+/).map(Number).filter(Number.isFinite);if(a.length!==24){alert(`24개 값이 필요합니다. 현재 ${a.length}개입니다.`);return}tariffs[row]=a;buildTariff();run()};
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active')});
  window.addEventListener('resize',()=>{if(window.lastResult)run()});
  buildTariff();assumptions();run();
})();
