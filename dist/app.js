import {DEFAULTS,PROVINCES,project,ratesFor} from './engine.js';
import {saveInputs,loadInputs,clearInputs} from './storage.js';
import {parseDollarValue,formatMoneyFields,attachMoneyInputs} from './money-inputs.js';
import {ACCOUNT_DISPLAY,withdrawalAmounts,withdrawalSources} from './withdrawals.js';
import {retirementTimeline,timelineWidth,realAnnualTax} from './timeline.js';
const $=s=>document.querySelector(s),form=$('#plan-form');
const currency=new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0});
const money=n=>currency.format(n),compact=n=>n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1000?'$'+(n/1000).toFixed(0)+'K':money(n);
const percent=n=>n===null?'—':(n*100).toFixed(2)+'%';
const names={tfsa:'TFSA',rrsp:'RRSP',nonreg:'Non-registered'},colours=Object.fromEntries(Object.entries(ACCOUNT_DISPLAY).map(([key,account])=>[key,account.colour]));
let state=structuredClone(DEFAULTS),rows=[],taxView='rate',overviewView='portfolio';
let inputStorage;
try{inputStorage=window.localStorage;}catch{inputStorage=null;}
function persistForm(){
 const values=Object.fromEntries([...form.querySelectorAll('input[name],select[name]')].map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]));
 const saved=saveInputs(inputStorage,values);
 $('#save-status').textContent=saved?'Saved on this device. Nothing is uploaded.':'Local saving is unavailable in this browser. Inputs will not survive a reload.';
}
function restoreForm(){
 const saved=loadInputs(inputStorage);
 if(saved.values){
  for(const el of form.querySelectorAll('input[name],select[name]')){
   const value=Object.hasOwn(saved.values,el.name)?saved.values[el.name]:undefined;
   if(el.type==='checkbox'&&typeof value==='boolean')el.checked=value;
   else if(typeof value==='string'&&(el.tagName!=='SELECT'||[...el.options].some(option=>option.value===value)))el.value=value;
  }
  formatMoneyFields(form);refreshForm();
  $('#save-status').textContent='Restored your saved inputs from this device.';
 }else if(saved.failed)$('#save-status').textContent='Saved inputs could not be restored. Local saving may be disabled in this browser.';
}
function setForm(s){for(const [k,v] of Object.entries(s)){if(k==='accounts')continue;const el=form.elements.namedItem(k);if(el){if(el.type==='checkbox')el.checked=v;else el.value=v;}}for(const [k,a]of Object.entries(s.accounts))for(const [field,v]of Object.entries(a))form.elements.namedItem(k+'-'+field).value=v;formatMoneyFields(form);refreshForm();}
const readNumericInput=el=>el.hasAttribute('data-money')?parseDollarValue(el.value):el.valueAsNumber;
function readForm(){const s={...state,province:'ON',mode:'custom',accounts:{}};for(const k of Object.keys(DEFAULTS)){if(['accounts','province','mode','acb'].includes(k))continue;const el=form.elements.namedItem(k);s[k]=el.type==='checkbox'?el.checked:el.tagName==='SELECT'?el.value:readNumericInput(el);}for(const k of Object.keys(names))s.accounts[k]=Object.fromEntries(['balance','saving','equity'].map(f=>[f,readNumericInput(form.elements.namedItem(k+'-'+f))]));delete s.acb;return s;}
function refreshForm(){const s=readForm();for(const k of Object.keys(names)){const w=s.accounts[k].equity;$(`#${k}-allocation`).textContent=`${w}% equity · ${100-w}% bonds`;form.elements.namedItem(k+'-equity').style.setProperty('--fill',w+'%');}const gain=s.nonregGainPercent,balance=s.accounts.nonreg.balance;$('#nonreg-gain-split').textContent=Number.isFinite(gain)&&gain>=0&&gain<=100&&Number.isFinite(balance)?`${Number((100-gain).toFixed(2))}% original capital (${money(balance*(1-gain/100))}) · ${gain}% unrealized gain (${money(balance*gain/100)})`:'Enter a starting capital gain from 0% to 100%.';const work=Math.max(0,s.retire-s.age),retire=Math.max(0,s.death-s.retire+1);$('#working-years').textContent=work+' years to build';$('#retired-years').textContent=retire+' retirement years';$('#timeline-work').style.flex=work;$('#timeline-retire').style.flex=retire;}
form.addEventListener('input',()=>{refreshForm();persistForm();$('#stale').hidden=false;});form.addEventListener('change',()=>{refreshForm();persistForm();$('#stale').hidden=false;});
form.addEventListener('submit',e=>{e.preventDefault();persistForm();calculate();});
function calculate(){try{const next=readForm(),result=project(next);state=next;rows=result;$('#errors').textContent='';$('#stale').hidden=true;render();}catch(e){$('#errors').textContent=e.message;$('#errors').scrollIntoView({behavior:'smooth',block:'center'});}}
$('#reset').onclick=()=>{state=structuredClone(DEFAULTS);setForm(state);calculate();const cleared=clearInputs(inputStorage);$('#save-status').textContent=cleared?'Saved inputs cleared. Default values restored.':'Default values restored. Saved inputs could not be cleared in this browser.';};
function selectTab(name){document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-selected',String(b.dataset.tab===name));});document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==name);if(name==='overview'){if(overviewView==='income')renderIncomeChart();else renderChart();}}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
function selectTaxView(view,focus=false){
 taxView=view;
 document.querySelectorAll('[data-tax-view]').forEach(button=>{
  const active=button.dataset.taxView===view;
  button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  if(active&&focus)button.focus();
 });
 $('#tax-chart-panel').setAttribute('aria-labelledby',view==='rate'?'tax-rate-tab':'tax-amounts-tab');
 renderTaxChart();
}
const taxTabs=[...document.querySelectorAll('[data-tax-view]')];
taxTabs.forEach((button,index)=>{
 button.onclick=()=>selectTaxView(button.dataset.taxView);
 button.addEventListener('keydown',event=>{
  let next;if(event.key==='ArrowRight')next=(index+1)%taxTabs.length;else if(event.key==='ArrowLeft')next=(index+taxTabs.length-1)%taxTabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=taxTabs.length-1;else return;
  event.preventDefault();selectTaxView(taxTabs[next].dataset.taxView,true);
 });
});
function selectOverviewView(view,focus=false){
 overviewView=view;
 document.querySelectorAll('[data-overview-view]').forEach(button=>{
  const active=button.dataset.overviewView===view;
  button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  if(active&&focus)button.focus();
 });
 $('#overview-portfolio-panel').hidden=view!=='portfolio';
 $('#overview-income-panel').hidden=view!=='income';
 if(view==='income')renderIncomeChart();else renderChart();
}
const overviewTabs=[...document.querySelectorAll('[data-overview-view]')];
overviewTabs.forEach((button,index)=>{
 button.onclick=()=>selectOverviewView(button.dataset.overviewView);
 button.addEventListener('keydown',event=>{
  let next;if(event.key==='ArrowRight')next=(index+1)%overviewTabs.length;else if(event.key==='ArrowLeft')next=(index+overviewTabs.length-1)%overviewTabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=overviewTabs.length-1;else return;
  event.preventDefault();selectOverviewView(overviewTabs[next].dataset.overviewView,true);
 });
});
for(const id of ['method-top','method-link','returns-source'])$('#'+id).onclick=()=>{selectTab('method');$('#method').scrollIntoView({behavior:'smooth',block:'start'});};
function render(){const retirement=rows.find(r=>r.age===state.retire),end=rows.at(-1),short=rows.find(r=>r.shortfall>.01||r.unpaidTax>.01);$('#retirement-value').textContent=compact(retirement.ledger);$('#retirement-real').textContent=compact(retirement.realLedger)+" in today’s dollars · age "+state.retire;$('#end-value').textContent=compact(end.ledger);$('#end-real').textContent=compact(end.realLedger)+" in today’s dollars · age "+state.death;$('#funding-value').textContent=short?'Gap at '+short.age:'Through '+state.death;$('#funding-value').style.color=short?'#b38145':'';$('#funding-detail').textContent=short?'First unmet expense or tax payment':'Projected expenses covered';$('#funding-foot').textContent=short?'Adjust annual RRSP withdrawal, savings or spending':'Under this constant-return scenario';$('#result-caption').textContent=`YOUR RETIREMENT OUTLOOK · ${PROVINCES[state.province].name.toUpperCase()}`;
 $('#tax-projection-note').textContent=state.indexTax?`Future tax thresholds and modeled credits are indexed using your ${state.inflation}% inflation assumption; tax rates stay at 2026 levels.`:'Future tax thresholds, credits and rates are held at 2026 levels.';
 const total=Object.values(state.accounts).reduce((n,a)=>n+a.balance,0),rates=ratesFor(state);$('#starting-total').textContent=compact(total);let offset=0;const circ=2*Math.PI*49;$('#donut').innerHTML='<circle cx="60" cy="60" r="49" fill="none" stroke="#f1f4ec" stroke-width="10"/>'+Object.entries(state.accounts).map(([k,a])=>{const len=total?a.balance/total*circ:0;const path=`<circle cx="60" cy="60" r="49" fill="none" stroke="${colours[k]}" stroke-width="10" stroke-dasharray="${Math.max(0,len-3)} ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;offset+=len;return len?path:'';}).join('');$('#mix-legend').innerHTML=Object.entries(state.accounts).map(([k,a])=>`<div><i class="dot" style="background:${colours[k]}"></i>${k==='rrsp'?'RRSP':names[k]}<strong>${money(a.balance)}</strong></div>`).join('');const weighted=total?Object.values(state.accounts).reduce((n,a)=>n+a.balance*(a.equity/100*rates.equity+(1-a.equity/100)*rates.bond),0)/total:0;$('#weighted-return').textContent=(weighted*100).toFixed(2)+'% assumed nominal return';const years=state.death-state.age+1;$('#inflation-insight').textContent=`At ${state.inflation}% annual inflation, $100,000 at the end of your plan buys what ${money(100000/(1+state.inflation/100)**years)} buys today. Both views help you plan for the life you want.`;
 const alerts=[];if(short)alerts.push(['warning',`Your first projected funding gap occurs at age ${short.age} (${short.year}). Unfunded living expenses: ${money(short.shortfall)}; unpaid tax: ${money(short.unpaidTax)}. Balances are floored at zero; unmet needs are not borrowed.`]);alerts.push(['',`Savings assume sufficient personal contribution room. Confirm your TFSA and RRSP limits with CRA. ${state.province==='ON'?'Federal and Ontario age/pension credits are included.':'Federal age/RRIF pension credits are included; other provincial senior credits and low-income reductions (except B.C.) are excluded.'} See assumptions for the tax model’s scope.`]);if(state.retire>72&&state.accounts.rrsp.saving>0)alerts.push(['',`RRSP contributions after age 71 are redirected to your non-registered account. Mandatory RRIF withdrawals begin at age 72, including while working.`]);$('#alerts').innerHTML=alerts.map(([c,t])=>`<div class="alert ${c}">${t}</div>`).join('');renderTaxChart();renderChart();renderIncomeChart();renderTable();}
function positionGraphTooltip(tip,svg,scroller,event){
 const bounds=svg.getBoundingClientRect(),visibleWidth=scroller.getBoundingClientRect().width||bounds.width;
 const width=Math.min(310,visibleWidth),left=scroller.scrollLeft||0;
 tip.style.width=width+'px';tip.style.left=Math.max(left,Math.min(left+visibleWidth-width,event.clientX-bounds.left+12))+'px';tip.style.top='45px';
}
function renderTaxCalculation(row){
 $('#tax-calculation-year').textContent=`${row.year} · age ${row.age}${row.age===state.retire?' · first retirement year':''}`;
 $('#tax-calculation-income').textContent=money(row.taxableIncome);
 $('#tax-calculation-rate').textContent=percent(row.effectiveTaxRate);
 $('#tax-calculation-total').textContent=money(row.totalIncomeTax);
 $('#tax-calculation-expenses').textContent=money(row.expenses);
 $('#tax-calculation-withdrawals').textContent=money(row.withdrawals);
 $('#tax-calculation-benefits').textContent=money(row.benefitIncome);
 $('#tax-calculation-symbol').hidden=row.effectiveTaxRate===null;
 $('#tax-calculation-equals').hidden=row.effectiveTaxRate===null;
}
function renderTaxChart(){
 const {data:taxRows,ticks}=retirementTimeline(rows,state.retire);if(!taxRows.length)return;
 renderTaxCalculation(taxRows[0]);
 const svg=$('#tax-chart'),scroller=$('#tax-chart-scroll'),tip=$('#tax-tooltip');tip.hidden=true;
 const W=timelineWidth(scroller.getBoundingClientRect().width,ticks.length),H=340,L=W<500?62:80,R=22,T=20,B=62,pw=W-L-R,ph=H-T-B;
 $('#tax-chart-container').style.width=W+'px';svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const series=taxRows.map(row=>({...row,realTax:realAnnualTax(row,state)})),isRate=taxView==='rate';
 svg.setAttribute('aria-label',isRate?'Annual effective income tax rate from retirement through the final planning age':'Annual nominal and inflation-adjusted income tax payable from retirement through the final planning age');
 $('#tax-chart-legend').innerHTML=isRate?'<span><i class="legend-dot nominal"></i> Effective tax rate</span><span class="chart-unit">% of taxable income</span>':'<span><i class="legend-dot nominal"></i> Nominal tax payable</span><span><i class="legend-dot real"></i> Today’s dollars</span><span class="chart-unit">CAD / year</span>';
 const hasRates=series.some(row=>Number.isFinite(row.effectiveTaxRate));
 $('#tax-chart-note').textContent=isRate?(hasRates?'Effective tax rate = total annual tax payable ÷ modeled taxable income. Years with no taxable income have no rate and appear as gaps.':'No taxable income is projected during retirement, so no effective tax rate is defined. See Tax payable amounts for annual dollar values.'):'Nominal tax payable is shown alongside the same amount adjusted to today’s purchasing power using your inflation assumption.';
 let max=isRate?Math.max(.1,...series.filter(row=>Number.isFinite(row.effectiveTaxRate)).map(row=>row.effectiveTaxRate)):Math.max(1000,...series.map(row=>Math.max(row.totalIncomeTax,row.realTax)));
 const unit=10**Math.floor(Math.log10(max)),step=[.2,.25,.5,1,2].map(n=>n*unit).find(n=>n>=max/4)||unit;max=Math.ceil(max/step)*step;
 const x=i=>L+(series.length===1?.5:i/(series.length-1))*pw,y=value=>T+ph-value/max*ph;
 let content='<defs><linearGradient id="tax-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#abc58d" stop-opacity=".2"/><stop offset="100%" stop-color="#abc58d" stop-opacity="0"/></linearGradient></defs>';
 for(let value=0;value<=max+.01;value+=step)content+=`<line x1="${L}" x2="${W-R}" y1="${y(value)}" y2="${y(value)}" stroke="#e8eddf" stroke-dasharray="3 5"/><text x="${L-13}" y="${y(value)+4}" text-anchor="end" fill="#718363" font-size="12.5">${isRate?+(value*100).toFixed(2)+'%':compact(value)}</text>`;
 for(const i of ticks)content+=`<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${T+ph}" stroke="#eff2e9"/><text class="timeline-age" data-age="${series[i].age}" x="${x(i)}" y="${T+ph+22}" text-anchor="middle" fill="#718363" font-size="12.5">${series[i].age}</text><text x="${x(i)}" y="${T+ph+39}" text-anchor="middle" fill="#8d9a81" font-size="10">${series[i].year}</text>`;
 const path=key=>{let connected=false;return series.map((row,i)=>{
  if(!Number.isFinite(row[key])){connected=false;return '';}
  const command=connected?'L':'M';connected=true;return command+x(i).toFixed(2)+','+y(row[key]).toFixed(2);
 }).join(' ');};
 if(isRate){
  content+=`<path id="tax-rate-line" d="${path('effectiveTaxRate')}" fill="none" stroke="#426b35" stroke-width="2.8" stroke-linejoin="round"/>`;
  series.forEach((row,i)=>{if(Number.isFinite(row.effectiveTaxRate))content+=`<circle cx="${x(i)}" cy="${y(row.effectiveTaxRate)}" r="2" fill="#426b35"/>`;});
 }else{
  content+=`<path d="${path('totalIncomeTax')} L${x(series.length-1)},${T+ph} L${x(0)},${T+ph} Z" fill="url(#tax-fill)"/><path id="tax-nominal-line" d="${path('totalIncomeTax')}" fill="none" stroke="#426b35" stroke-width="2.8" stroke-linejoin="round"/><path id="tax-real-line" d="${path('realTax')}" fill="none" stroke="#7297ad" stroke-width="2.4" stroke-linejoin="round"/>`;
  const last=series.at(-1);content+=`<circle cx="${x(series.length-1)}" cy="${y(last.totalIncomeTax)}" r="4" fill="#426b35" stroke="white" stroke-width="2"/><circle cx="${x(series.length-1)}" cy="${y(last.realTax)}" r="4" fill="#7297ad" stroke="white" stroke-width="2"/>`;
 }
 content+=`<g id="tax-hover" visibility="hidden"><line id="tax-hover-line" y1="${T}" y2="${T+ph}" stroke="#839c68" stroke-dasharray="3 4"/><circle id="tax-hover-dot" r="4" fill="#426b35" stroke="white" stroke-width="2"/></g><rect id="tax-chart-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`;
 svg.innerHTML=content;$('#tax-chart-subtitle').textContent=`${isRate?'Effective tax rate':'Annual tax payable'} · ages ${state.retire}–${state.death} · timeline labels every 5 years from retirement.`;
 function hover(event){
  const bounds=svg.getBoundingClientRect(),sx=(event.clientX-bounds.left)/bounds.width*W;
  const i=series.length===1?0:Math.max(0,Math.min(series.length-1,Math.round((sx-L)/pw*(series.length-1)))),row=series[i];
  renderTaxCalculation(row);
  $('#tax-hover').setAttribute('visibility','visible');$('#tax-hover-line').setAttribute('x1',x(i));$('#tax-hover-line').setAttribute('x2',x(i));$('#tax-hover-dot').setAttribute('cx',x(i));const value=isRate?row.effectiveTaxRate:row.totalIncomeTax;$('#tax-hover-dot').setAttribute('cy',y(value??0));$('#tax-hover-dot').setAttribute('visibility',Number.isFinite(value)?'visible':'hidden');
  tip.hidden=false;tip.innerHTML=`<strong>${row.year} · Age ${row.age}</strong>Tax payable <span>${money(row.totalIncomeTax)}</span><br>Today’s dollars <span>${money(row.realTax)}</span><br>Effective tax rate <span>${percent(row.effectiveTaxRate)}</span><br>Taxable income <span>${money(row.taxableIncome)}</span><br>Federal income tax <span>${money(row.federalIncomeTax)}</span><br>Ontario income tax <span>${money(row.provincialIncomeTax)}</span><br>OAS recovery <span>${money(row.oasRecoveryTax)}</span>`;
  positionGraphTooltip(tip,svg,scroller,event);
 }
 $('#tax-chart-hit').addEventListener('pointermove',hover);$('#tax-chart-hit').addEventListener('pointerdown',hover);
 svg.onpointerleave=()=>{tip.hidden=true;$('#tax-hover').setAttribute('visibility','hidden');};
}
function renderChart(){const {data:chartRows,ticks}=retirementTimeline(rows,state.retire);if(!chartRows.length)return;const nominal='ledger',real='realLedger',svg=$('#chart');const W=timelineWidth($('#portfolio-chart-scroll').getBoundingClientRect().width,ticks.length),H=W<500?390:475,L=W<500?62:80,R=22,T=25,B=145,pw=W-L-R,ph=H-T-B;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);$('#chart-container').style.width=W+'px';$('#tooltip').hidden=true;let max=Math.max(1,...chartRows.map(r=>Math.max(r[nominal],r[real])));const unit=10**Math.floor(Math.log10(max)),step=[.2,.25,.5,1,2].map(x=>x*unit).find(x=>x>=max/4)||unit;max=Math.ceil(max/step)*step;const x=i=>L+(chartRows.length===1?.5:i/(chartRows.length-1))*pw,y=v=>T+ph-(v/max)*ph;
 const retireIdx=chartRows.findIndex(r=>r.retired),retireX=chartRows.length===1?L:Math.max(L,x(retireIdx)-pw/(chartRows.length-1)/2);let content=`<rect x="${retireX}" y="${T}" width="${W-R-retireX}" height="${ph}" fill="#f5f8f0"/>`;
 for(let v=0;v<=max+.01;v+=step)content+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#e8eddf" stroke-dasharray="3 5"/><text x="${L-13}" y="${y(v)+3}" text-anchor="end" fill="#a1ac93" font-size="12.5">${v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v.toFixed(0)}</text>`;
 content+=`<line x1="${retireX}" x2="${retireX}" y1="${T}" y2="${T+ph}" stroke="#c7d4b5" stroke-dasharray="4 4"/><rect x="${Math.min(retireX+8,W-124)}" y="${T+4}" width="107" height="21" rx="4" fill="#eaf0e0"/><text x="${Math.min(retireX+17,W-115)}" y="${T+18}" font-size="11.25" fill="#8a9d71">Retirement · age ${state.retire}</text>`;
 const path=key=>chartRows.map((r,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(r[key]).toFixed(2)).join(' ');
 const stackOrder=['tfsa','nonreg','rrsp'];
 content+='<g id="account-balance-stack">';
 stackOrder.forEach((key,layer)=>{
  const bounds=chartRows.map(row=>{
   const lower=stackOrder.slice(0,layer).reduce((total,account)=>total+row[account],0);
   return {lower,upper:lower+row[key]};
  });
  const upper=bounds.map((point,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(point.upper).toFixed(2)).join(' ');
  const lower=bounds.map((point,i)=>'L'+x(i).toFixed(2)+','+y(point.lower).toFixed(2)).reverse().join(' ');
  // A single planning year still needs a visible band rather than a zero-width path.
  const area=bounds.length===1?`M${L},${y(bounds[0].upper)} L${W-R},${y(bounds[0].upper)} L${W-R},${y(bounds[0].lower)} L${L},${y(bounds[0].lower)} Z`:`${upper} ${lower} Z`;
  const edge=bounds.length===1?`M${L},${y(bounds[0].upper)} L${W-R},${y(bounds[0].upper)}`:upper;
  const account=ACCOUNT_DISPLAY[key];
  content+=`<path id="balance-area-${key}" data-account="${key}" d="${area}" fill="${account.colour}" fill-opacity=".45"><title>${account.name} nominal year-end balance</title></path><path d="${edge}" fill="none" stroke="${account.colour}" stroke-width="1.5" stroke-linejoin="round"/>`;
 });
 content+=`</g><path id="portfolio-real-line" d="${path(real)}" fill="none" stroke="#356582" stroke-width="2.6" stroke-dasharray="7 5" stroke-linejoin="round"/>`;
 for(const i of ticks)content+=`<text class="timeline-age" data-age="${chartRows[i].age}" x="${x(i)}" y="${T+ph+19}" text-anchor="middle" fill="#718363" font-size="12.5">${chartRows[i].age}</text><text x="${x(i)}" y="${T+ph+34}" text-anchor="middle" fill="#8d9a81" font-size="10">${chartRows[i].year}</text>`;
 const cellWidth=chartRows.length>1?pw/(chartRows.length-1):pw;
 Object.entries(ACCOUNT_DISPLAY).forEach(([key,account],lane)=>{
  const laneY=T+ph+53+lane*19;
  content+=`<text x="${L-8}" y="${laneY+8}" text-anchor="end" fill="${account.colour}" font-size="11.25">${account.short}</text><rect x="${L}" y="${laneY}" width="${pw}" height="10" rx="3" fill="#f1f3ed"/>`;
  chartRows.forEach((row,i)=>{const amount=withdrawalAmounts(row)[key];if(amount<.005)return;const left=Math.max(L,x(i)-cellWidth/2),right=Math.min(W-R,x(i)+cellWidth/2);content+=`<rect x="${left}" y="${laneY}" width="${right-left}" height="10" fill="${account.colour}"><title>${row.year}, age ${row.age}: ${account.name} withdrawal ${money(amount)}</title></rect>`;});
 });
 const last=chartRows.at(-1);content+=`<circle cx="${x(chartRows.length-1)}" cy="${y(last[nominal])}" r="4" fill="${ACCOUNT_DISPLAY.rrsp.colour}" stroke="white" stroke-width="2"/><circle cx="${x(chartRows.length-1)}" cy="${y(last[real])}" r="4" fill="#356582" stroke="white" stroke-width="2"/><g id="chart-hover" visibility="hidden"><line id="hover-line" y1="${T}" y2="${T+ph}" stroke="#839c68" stroke-dasharray="3 4"/><circle id="hover-dot" r="4" fill="${ACCOUNT_DISPLAY.rrsp.colour}" stroke="white" stroke-width="2"/></g><rect id="chart-hit" x="${L}" y="${T}" width="${pw}" height="${ph+105}" fill="transparent"/>`;svg.innerHTML=content;
 $('#chart-subtitle').textContent=`${chartRows.length} retirement years · ages ${state.retire}–${state.death}. Stacked nominal account balances; timeline labels every 5 years.`;
 $('#withdrawal-priority-caption').textContent=`Annual RRSP/RRIF payment: ${money(state.annualRrspWithdrawal)} in fixed nominal dollars from retirement, subject to available balance and mandatory RRIF minimums from age 72. Remaining spending and tax: non-registered cash distributions and capital, then TFSA. No extra RRSP top-up beyond your entry or the required minimum. Annual surplus after expenses and tax: first $14,000 to TFSA, then non-registered, at year-end.`;
 $('#view-explanation').textContent='Shaded bands show nominal year-end balances: TFSA at the bottom, non-registered in the middle, RRSP/RRIF on top. Each band’s thickness is that account’s balance; the top of the stack is your total portfolio. The dashed blue line shows the total in today’s dollars. Balances include withdrawals, returns, tax payments, savings and reinvestment.';
 function hover(e){const bounds=svg.getBoundingClientRect(),sx=(e.clientX-bounds.left)/bounds.width*W,i=chartRows.length===1?0:Math.max(0,Math.min(chartRows.length-1,Math.round((sx-L)/pw*(chartRows.length-1)))),r=chartRows[i];renderTaxCalculation(r);$('#chart-hover').setAttribute('visibility','visible');$('#hover-line').setAttribute('x1',x(i));$('#hover-line').setAttribute('x2',x(i));$('#hover-dot').setAttribute('cx',x(i));$('#hover-dot').setAttribute('cy',y(r[nominal]));const tip=$('#tooltip'),draws=withdrawalAmounts(r);tip.hidden=false;tip.innerHTML=`<strong>${r.year} · Age ${r.age}${r.retired?' · Retired':''}</strong><i class="dot" style="background:${ACCOUNT_DISPLAY.rrsp.colour}"></i> RRSP / RRIF balance <span>${money(r.rrsp)}</span><br><i class="dot" style="background:${ACCOUNT_DISPLAY.nonreg.colour}"></i> Non-registered balance <span>${money(r.nonreg)}</span><br><i class="dot" style="background:${ACCOUNT_DISPLAY.tfsa.colour}"></i> TFSA balance <span>${money(r.tfsa)}</span><br>Total · nominal <span>${money(r[nominal])}</span><br>Total · today’s dollars <span>${money(r[real])}</span><br>Surplus reinvested · TFSA <span>${money(r.tfsaReinvestment)}</span><br>Surplus reinvested · non-registered <span>${money(r.nonregReinvestment)}</span><br>Living expenses <span>${money(r.expenses)}</span><br>Pension <span>${money(r.pensionIncome)}</span><br>CPP <span>${money(r.cppIncome)}</span><br>OAS <span>${money(r.oasIncome)}</span><br>Tax payable for year <span>${money(r.totalIncomeTax)}</span><br>Effective tax rate <span>${percent(r.effectiveTaxRate)}</span>`+`<br>Non-registered cash distributions <span>${money(r.distributionCash)}</span><br>Canadian eligible dividends <span>${money(r.eligibleDividends)}</span><br>Mandatory RRIF payment <span>${money(r.rrif)}</span>`+Object.entries(ACCOUNT_DISPLAY).map(([key,account])=>`<br><i class="dot" style="background:${account.colour}"></i> ${account.name} draw <span>${money(draws[key])}</span>`).join('');positionGraphTooltip(tip,svg,$('#portfolio-chart-scroll'),e);}
 $('#chart-hit').addEventListener('pointermove',hover);$('#chart-hit').addEventListener('pointerdown',hover);svg.onpointerleave=()=>{$('#tooltip').hidden=true;$('#chart-hover').setAttribute('visibility','hidden');};
}
function renderIncomeChart(){
 const {data,ticks}=retirementTimeline(rows,state.retire);if(!data.length)return;
 const sources=[
  {key:'pensionIncome',name:'Pension',colour:'#477244'},
  {key:'cppIncome',name:'CPP',colour:'#4063ae'},
  {key:'oasIncome',name:'OAS',colour:'#cb7765'},
  {key:'rrspWithdrawal',name:'RRSP / RRIF withdrawals',colour:ACCOUNT_DISPLAY.rrsp.colour},
  {key:'nonregWithdrawal',name:'Non-registered withdrawals',colour:ACCOUNT_DISPLAY.nonreg.colour},
  {key:'tfsaWithdrawal',name:'TFSA withdrawals',colour:ACCOUNT_DISPLAY.tfsa.colour},
  {key:'distributionCash',name:'Non-registered cash distributions',colour:'#2f8bba'}
 ];
 const series=data.map(row=>{
  let total=0;
  const bands=sources.map(source=>{const lower=total;total+=row[source.key];return {lower,upper:total};});
  return {row,bands,total};
 });
 const svg=$('#income-chart'),scroller=$('#income-chart-scroll'),tip=$('#income-tooltip');tip.hidden=true;
 const W=timelineWidth(scroller.getBoundingClientRect().width,ticks.length),H=365,L=W<500?62:80,R=22,T=20,B=62,pw=W-L-R,ph=H-T-B;
 $('#income-chart-container').style.width=W+'px';svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
 const peak=Math.max(...series.map(point=>point.total));
 let max=Math.max(1000,peak);
 const unit=10**Math.floor(Math.log10(max)),step=[.2,.25,.5,1,2].map(value=>value*unit).find(value=>value>=max/4)||unit;
 max=Math.ceil(max/step)*step;
 const x=i=>L+(series.length===1?.5:i/(series.length-1))*pw,y=value=>T+ph-value/max*ph;
 $('#income-chart-legend').innerHTML=sources.map(source=>`<span><i class="legend-dot" style="background:${source.colour}"></i>${source.name}</span>`).join('')+'<span class="chart-unit">CAD / year · nominal</span>';
 $('#income-chart-subtitle').textContent=`Annual cash sources · ages ${state.retire}–${state.death} · timeline labels every 5 years from retirement.`;
 let content='';
 for(let value=0;value<=max+.01;value+=step)content+=`<line x1="${L}" x2="${W-R}" y1="${y(value)}" y2="${y(value)}" stroke="#e8eddf" stroke-dasharray="3 5"/><text x="${L-13}" y="${y(value)+4}" text-anchor="end" fill="#718363" font-size="12.5">${compact(value)}</text>`;
 content+='<g id="income-source-stack">';
 sources.forEach((source,layer)=>{
  const upper=series.map((point,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(point.bands[layer].upper).toFixed(2)).join(' ');
  const lower=series.map((point,i)=>'L'+x(i).toFixed(2)+','+y(point.bands[layer].lower).toFixed(2)).reverse().join(' ');
  const band=series[0].bands[layer];
  const area=series.length===1?`M${L},${y(band.upper)} L${W-R},${y(band.upper)} L${W-R},${y(band.lower)} L${L},${y(band.lower)} Z`:`${upper} ${lower} Z`;
  const edge=series.length===1?`M${L},${y(band.upper)} L${W-R},${y(band.upper)}`:upper;
  content+=`<path id="income-area-${source.key}" data-source="${source.key}" d="${area}" fill="${source.colour}" fill-opacity=".6"><title>${source.name} annual cash</title></path><path d="${edge}" fill="none" stroke="${source.colour}" stroke-width="1.3" stroke-linejoin="round"/>`;
 });
 content+='</g>';
 for(const i of ticks)content+=`<text class="timeline-age" data-age="${series[i].row.age}" x="${x(i)}" y="${T+ph+22}" text-anchor="middle" fill="#718363" font-size="12.5">${series[i].row.age}</text><text x="${x(i)}" y="${T+ph+39}" text-anchor="middle" fill="#8d9a81" font-size="10">${series[i].row.year}</text>`;
 if(peak===0)content+=`<text x="${L+pw/2}" y="${T+ph/2}" text-anchor="middle" fill="#718363" font-size="13">No cash sources projected for this period.</text>`;
 content+=`<g id="income-hover" visibility="hidden"><line id="income-hover-line" y1="${T}" y2="${T+ph}" stroke="#476857" stroke-dasharray="3 4"/><circle id="income-hover-dot" r="4" fill="#254f42" stroke="white" stroke-width="2"/></g><rect id="income-chart-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`;
 svg.innerHTML=content;
 function hover(event){
  const bounds=svg.getBoundingClientRect(),sx=(event.clientX-bounds.left)/bounds.width*W;
  const i=series.length===1?0:Math.max(0,Math.min(series.length-1,Math.round((sx-L)/pw*(series.length-1)))),point=series[i];
  $('#income-hover').setAttribute('visibility','visible');$('#income-hover-line').setAttribute('x1',x(i));$('#income-hover-line').setAttribute('x2',x(i));
  $('#income-hover-dot').setAttribute('cx',x(i));$('#income-hover-dot').setAttribute('cy',y(point.total));
  tip.hidden=false;tip.innerHTML=`<strong>${point.row.year} · Age ${point.row.age}</strong>`+sources.map(source=>`<i class="dot" style="background:${source.colour}"></i> ${source.name}<span>${money(point.row[source.key])}</span><br>`).join('')+`<b>Total cash sources<span>${money(point.total)}</span></b>`;
  positionGraphTooltip(tip,svg,scroller,event);
 }
 $('#income-chart-hit').addEventListener('pointermove',hover);$('#income-chart-hit').addEventListener('pointerdown',hover);
 svg.onpointerleave=()=>{tip.hidden=true;$('#income-hover').setAttribute('visibility','hidden');};
}
const columns=[["year","Year"],["age","Age"],["expenses","Living Expenses"],["pensionIncome","Pension Income"],["cppIncome","CPP Income"],["oasIncome","OAS Income"],["withdrawals","Total Withdrawals"],["distributionCash","Non-Registered Cash Distribution (total)"],["taxableIncome","Taxable Income"],["effectiveTaxRate","Effective Tax Rate"],["totalIncomeTax","Tax Payment"],["withdrawalSources","Withdrawal Sources"],["rrsp","RRSP/RRIF Balance"],["nonreg","Non-Registered Balance"],["tfsa","TFSA Balance"],["ledger","Total Balance (nominal)"],["realLedger","Total Balance (inflation adjusted)"],["rrspWithdrawal","RRSP/RRIF Withdrawals"],["nonregWithdrawal","Non-Registered Withdrawals"],["tfsaWithdrawal","TFSA Withdrawals"],["savings","Savings"]];
const accountColumns={rrsp:'rrsp',nonreg:'nonreg',tfsa:'tfsa',rrspWithdrawal:'rrsp',distributionCash:'nonreg',nonregWithdrawal:'nonreg',tfsaWithdrawal:'tfsa'};
function sourceBadges(row){const sources=withdrawalSources(row);return sources.length?sources.map(key=>`<span class="withdrawal-badge account-${key}">${ACCOUNT_DISPLAY[key].name}</span>`).join(' '):'<span class="no-withdrawal">—</span>';}
function columnValue(row,key){if(key==='savings')return row.savings+(row.retired?row.cashReinvestment:0);return key==='withdrawalSources'?withdrawalSources(row).map(key=>ACCOUNT_DISPLAY[key].name).join(' + '):row[key];}
function renderTable(){
 $('#table-priority-caption').textContent=$('#withdrawal-priority-caption').textContent;
 $('#table-head').innerHTML='<tr>'+columns.map(([key,name])=>`<th scope="col" class="${accountColumns[key]?'account-'+accountColumns[key]:''}">${name}</th>`).join('')+'</tr>';
 $('#table-body').innerHTML=rows.map(r=>`<tr class="${r.age===state.retire?'retirement-row':''}">`+columns.map(([key])=>{
  const account=accountColumns[key],isWithdrawal=key.endsWith('Withdrawal');
  const className=key==='withdrawalSources'?'source-cell':account?`account-cell account-${account} ${isWithdrawal?'account-withdrawal'+(r[key]>=.005?' has-withdrawal':''):'account-balance'}`:'';
  const raw=columnValue(r,key);
  const value=key==='withdrawalSources'?sourceBadges(r):key==='year'?r.year+(r.age===state.retire?' · Retire':''):key==='age'?r.age:key==='effectiveTaxRate'?percent(raw):raw===null?'—':money(raw);
  return `<td class="${className}">${value}</td>`;
 }).join('')+'</tr>').join('');
}
$('#download').onclick=()=>{
 const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
 const csv=columns.map(([,name])=>quote(name)).join(',')+'\r\n'+rows.map(row=>columns.map(([key])=>{
  const value=columnValue(row,key);if(value===null)return '';if(typeof value==='string')return quote(value);
  return (key==='effectiveTaxRate'?value*100:Number(value)).toFixed(['year','age'].includes(key)?0:key==='effectiveTaxRate'?4:2);
 }).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='northstar-retirement-projection.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('resize',()=>{renderTaxChart();if(!$('#overview').hidden){if(overviewView==='income')renderIncomeChart();else renderChart();}});
attachMoneyInputs(form);setForm(state);restoreForm();calculate();
