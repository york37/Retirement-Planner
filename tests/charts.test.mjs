import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DEFAULTS,project} from '../dist/engine.js';
import {ACCOUNT_DISPLAY,withdrawalAmounts} from '../dist/withdrawals.js';
import {retirementTimeline,timelineWidth,realAnnualTax} from '../dist/timeline.js';

test('retirement charts start at retirement and tick every five years relative to that age',()=>{
 const rows=Array.from({length:38},(_,i)=>({age:50+i,year:2026+i}));
 const {data,ticks}=retirementTimeline(rows,62);
 assert.equal(data[0].age,62);assert.equal(data.at(-1).age,87);
 assert.deepEqual(ticks.map(i=>data[i].age),[62,67,72,77,82,87]);
});

test('off-cycle plan endpoints remain plotted without adding irregular axis labels',()=>{
 const rows=Array.from({length:45},(_,i)=>({age:46+i}));
 const {data,ticks}=retirementTimeline(rows,67);
 assert.equal(data.at(-1).age,90);
 assert.deepEqual(ticks.map(i=>data[i].age),[67,72,77,82,87]);
 const single=retirementTimeline([{age:65}],65);
 assert.deepEqual(single.ticks,[0]);assert.equal(single.data.length,1);
});

test('narrow screens retain all five-year labels using a scrollable width',()=>{
 assert.equal(timelineWidth(900,6),900);
 assert.ok(timelineWidth(280,12)>=110+11*64);
});

test('annual tax uses the same year-end inflation adjustment as portfolio balances',()=>{
 const state={age:46,inflation:2};
 assert.equal(realAnnualTax({age:46,totalIncomeTax:10200},state),10000);
 assert.equal(realAnnualTax({age:65,totalIncomeTax:10000},state),10000/1.02**20);
 assert.equal(realAnnualTax({age:90,totalIncomeTax:0},state),0);
});

function renderCharts(state,availableWidth=800,taxView='amounts'){
 const nodes=new Map();
 function node(id){
  if(nodes.has(id))return nodes.get(id);
  const n={style:{},attributes:{},handlers:{},hidden:false,scrollLeft:0,textContent:'',
   setAttribute(key,value){this.attributes[key]=String(value);},
   addEventListener(key,handler){this.handlers[key]=handler;},
   getBoundingClientRect(){
    const container=id==='chart'?'chart-container':id==='tax-chart'?'tax-chart-container':id==='income-chart'?'income-chart-container':null;
    return {left:0,width:container?Number.parseFloat(node(container).style.width)||availableWidth:availableWidth};
   }
  };
  Object.defineProperty(n,'innerHTML',{get(){return this.markup||'';},set(html){this.markup=html;for(const [,childId] of html.matchAll(/id="([^"]+)"/g))node(childId);}});
  nodes.set(id,n);return n;
 }
 const currency=new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0});
 const money=value=>currency.format(value);
 const compact=value=>value>=1e6?'$'+(value/1e6).toFixed(2)+'M':value>=1000?'$'+(value/1000).toFixed(0)+'K':money(value);
 const rows=project(state),app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 const functions=app.slice(app.indexOf('function positionGraphTooltip('),app.indexOf('const columns='));
 const context={state,rows,taxView,overviewView:'portfolio',$:selector=>node(selector.slice(1)),money,compact,percent:value=>value===null?'—':(value*100).toFixed(2)+'%',ACCOUNT_DISPLAY,withdrawalAmounts,retirementTimeline,timelineWidth,realAnnualTax};
 vm.runInNewContext(functions+'\nrenderTaxChart();renderChart();renderIncomeChart();',context);
  const buttons=['rate','amounts'].map(view=>{
  const button=node(view==='rate'?'tax-rate-tab':'tax-amounts-tab');
  button.dataset={taxView:view};button.classList={toggle(name,value){button[name]=value;}};button.focus=()=>{button.focused=true;};
  return button;
 });
 const overviewButtons=['portfolio','income'].map(view=>{
  const button=node(view==='portfolio'?'overview-portfolio-tab':'overview-income-tab');
  button.dataset={overviewView:view};button.classList={toggle(name,value){button[name]=value;}};button.focus=()=>{button.focused=true;};
  return button;
 });
 context.document={querySelectorAll:selector=>selector==='[data-overview-view]'?overviewButtons:buttons};
 const tabSetup=app.slice(app.indexOf('function selectTaxView('),app.indexOf("for(const id of ['method-top'"));
 vm.runInNewContext(tabSetup,context);
 return {nodes,node,rows,money,buttons,overviewButtons};
}

test('both graphs render matching retirement ticks and tax hover exposes annual payable and rate',()=>{
 const state={...structuredClone(DEFAULTS),retire:67,pensionIncome:24000,cppIncome:12000,oasIncome:8500};
 const {node,rows,money}=renderCharts(state,300);
 for(const id of ['chart','tax-chart']){
  assert.deepEqual([...node(id).innerHTML.matchAll(/data-age="(\d+)"/g)].map(([,age])=>Number(age)),[67,72,77,82,87]);
  assert.ok(!/NaN|undefined|Infinity/.test(node(id).innerHTML));
 }
 const taxSvg=node('tax-chart').innerHTML;
 const nominalPath=taxSvg.match(/id="tax-nominal-line" d="([^"]+)"/)[1];
 const realPath=taxSvg.match(/id="tax-real-line" d="([^"]+)"/)[1];
 assert.equal((nominalPath.match(/[ML]/g)||[]).length,24);assert.notEqual(nominalPath,realPath);
 node('tax-chart-hit').handlers.pointermove({clientX:0});
 const first=rows.find(row=>row.age===67);
 const chartMarkup=node('chart').innerHTML;
 const areas=[...chartMarkup.matchAll(/id="balance-area-(\w+)" data-account="\w+" d="([^"]+)" fill="([^"]+)"/g)];
 assert.deepEqual(areas.map(([,account])=>account),['tfsa','nonreg','rrsp']);
 const points=areas.map(([,account,path,colour])=>{
  assert.equal(colour,ACCOUNT_DISPLAY[account].colour);
  return [...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([,x,y])=>({x:Number(x),y:Number(y)}));
 });
 const plotted=rows.filter(row=>row.retired),count=plotted.length;
 for(let i=0;i<count;i++){
  const bottom=points[0][2*count-1-i].y,top=points[2][i].y,height=bottom-top;
  assert.ok(Math.abs(points[0][i].y-points[1][2*count-1-i].y)<.02);
  assert.ok(Math.abs(points[1][i].y-points[2][2*count-1-i].y)<.02);
  for(const [layer,account] of ['tfsa','nonreg','rrsp'].entries()){
   const thickness=points[layer][2*count-1-i].y-points[layer][i].y;
   assert.ok(thickness>=0);
   if(height>0)assert.ok(Math.abs(thickness/height-plotted[i][account]/plotted[i].ledger)<.001);
  }
 }
 assert.ok(chartMarkup.includes('id="portfolio-real-line"'));
 assert.ok(chartMarkup.includes('stroke-dasharray="7 5"'));
 assert.ok(node('tax-tooltip').innerHTML.includes('Age 67'));
 assert.ok(node('tax-tooltip').innerHTML.includes(money(first.totalIncomeTax)));
 assert.ok(node('tax-tooltip').innerHTML.includes((first.effectiveTaxRate*100).toFixed(2)+'%'));
 node('tax-chart-hit').handlers.pointerdown({clientX:10000});
 assert.ok(node('tax-tooltip').innerHTML.includes('Age 90'));
 node('chart-hit').handlers.pointermove({clientX:0});
 assert.ok(node('tooltip').innerHTML.includes('Age 67'));
 for(const account of ['rrsp','nonreg','tfsa'])assert.ok(node('tooltip').innerHTML.includes(money(first[account])));
 node('chart-hit').handlers.pointerdown({clientX:10000});
 assert.ok(node('tooltip').innerHTML.includes('Age 90'));
 node('tax-chart').onpointerleave();assert.equal(node('tax-tooltip').hidden,true);
});

test('zero-tax and one-year retirement render finite graphs and keep zero taxable income distinct from a zero rate',()=>{
 const state=structuredClone(DEFAULTS);Object.assign(state,{age:65,retire:65,death:65,expenses:0,workIncome:0,retiredIncome:0,equity:0,bond:0,yield:0});
 for(const account of Object.values(state.accounts)){account.balance=0;account.saving=0;}
 const {node}=renderCharts(state);
 for(const id of ['chart','tax-chart']){
  assert.deepEqual([...node(id).innerHTML.matchAll(/data-age="(\d+)"/g)].map(([,age])=>Number(age)),[65]);
  assert.ok(!/NaN|undefined|Infinity/.test(node(id).innerHTML));
 }
 node('tax-chart-hit').handlers.pointerdown({clientX:400});
 assert.ok(node('tax-tooltip').innerHTML.includes('Age 65'));
 assert.ok(node('tax-tooltip').innerHTML.includes('Effective tax rate <span>—</span>'));
});


test('tax tabs switch between percentages and dollar amounts with keyboard and ARIA support',()=>{
 const {node,buttons}=renderCharts(structuredClone(DEFAULTS),300,'rate');
 assert.ok(node('tax-chart').innerHTML.includes('id="tax-rate-line"'));
 assert.ok(!node('tax-chart').innerHTML.includes('id="tax-nominal-line"'));
 assert.ok(node('tax-chart-legend').innerHTML.includes('% of taxable income'));
 buttons[1].onclick();
 assert.equal(buttons[1].attributes['aria-selected'],'true');assert.equal(buttons[0].attributes['aria-selected'],'false');
 assert.equal(node('tax-chart-panel').attributes['aria-labelledby'],'tax-amounts-tab');
 assert.ok(node('tax-chart').innerHTML.includes('id="tax-nominal-line"'));
 assert.ok(node('tax-chart').innerHTML.includes('id="tax-real-line"'));
 assert.ok(node('tax-chart-legend').innerHTML.includes('CAD / year'));
 let prevented=false;
 buttons[1].handlers.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
 assert.ok(prevented);assert.equal(buttons[0].focused,true);assert.equal(buttons[0].tabIndex,0);assert.equal(buttons[1].tabIndex,-1);
 assert.equal(node('tax-chart-panel').attributes['aria-labelledby'],'tax-rate-tab');
 assert.ok(node('tax-chart').innerHTML.includes('id="tax-rate-line"'));
 assert.deepEqual([...node('tax-chart').innerHTML.matchAll(/data-age="(\d+)"/g)].map(([,age])=>Number(age)),[65,70,75,80,85,90]);
});

test('rate graph leaves gaps for undefined rates and plots actual zero rates',()=>{
 const state=structuredClone(DEFAULTS);Object.assign(state,{age:65,retire:65,death:71,expenses:10000,inflation:0,equity:0,bond:0,yield:0,workIncome:0,retiredIncome:0,pensionIncome:20000,pensionStart:69,annualRrspWithdrawal:10000});
 for(const account of Object.values(state.accounts)){account.balance=0;account.saving=0;}
 state.accounts.rrsp.balance=15000;state.accounts.tfsa.balance=100000;
 const {node,rows}=renderCharts(state,800,'rate');
 assert.equal(rows[0].effectiveTaxRate,0);assert.equal(rows[2].effectiveTaxRate,null);assert.ok(rows[4].taxableIncome>0);
 const markup=node('tax-chart').innerHTML,path=markup.match(/id="tax-rate-line" d="([^"]+)"/)[1];
 assert.equal((path.match(/M/g)||[]).length,2);assert.equal((path.match(/[ML]/g)||[]).length,5);
 assert.ok(!/NaN|undefined|Infinity/.test(markup));
 node('tax-chart-hit').handlers.pointermove({clientX:0});
 assert.ok(node('tax-tooltip').innerHTML.includes('Effective tax rate <span>0.00%</span>'));
 // The third annual point is a year paid from TFSA with no taxable income.
 node('tax-chart-hit').handlers.pointermove({clientX:80+(800-80-22)*2/6});
 assert.ok(node('tax-tooltip').innerHTML.includes('Age 67'));
 assert.ok(node('tax-tooltip').innerHTML.includes('Effective tax rate <span>—</span>'));
 assert.equal(node('tax-hover-dot').attributes.visibility,'hidden');
});

test('tax readout identifies gross taxable income as the rate basis for the $180,000 spending example',()=>{
 const state=structuredClone(DEFAULTS);Object.assign(state,{age:65,retire:65,death:65,expenses:180000,annualRrspWithdrawal:291226.2036909517,inflation:0,equity:0,bond:0,yield:0,workIncome:0,retiredIncome:0,order:'rrsp,nonreg,tfsa',acb:0});
 for(const account of Object.values(state.accounts)){account.balance=0;account.saving=0;}
 state.accounts.rrsp.balance=2000000;
 const {node}=renderCharts(state,800,'rate');
 assert.equal(node('tax-calculation-income').textContent,'$291,226');
 assert.equal(node('tax-calculation-rate').textContent,'38.19%');
 assert.equal(node('tax-calculation-total').textContent,'$111,226');
 assert.equal(node('tax-calculation-expenses').textContent,'$180,000');
 assert.equal(node('tax-calculation-withdrawals').textContent,'$291,226');
});

test('income stack reconciles to actual annual cash without counting distributions or RRIF minimums twice',()=>{
 const state=structuredClone(DEFAULTS);
 Object.assign(state,{age:60,retire:62,death:75,pensionIncome:24000,pensionStart:64,cppIncome:12000,oasIncome:8500,retiredIncome:10000,expenses:80000,annualRrspWithdrawal:20000});
 const {node,rows,money}=renderCharts(state,800);
 const plotted=rows.filter(row=>row.retired),count=plotted.length,markup=node('income-chart').innerHTML;
 const keys=['pensionIncome','cppIncome','oasIncome','rrspWithdrawal','nonregWithdrawal','tfsaWithdrawal','distributionCash'];
 const areas=[...markup.matchAll(/id="income-area-\w+" data-source="(\w+)" d="([^"]+)" fill="([^"]+)"/g)];
 assert.deepEqual(areas.map(([,key])=>key),keys);assert.equal(new Set(areas.map(([,key,path,colour])=>colour)).size,7);
 assert.deepEqual([...markup.matchAll(/data-age="(\d+)"/g)].map(([,age])=>Number(age)),[62,67,72]);
 const points=areas.map(([,key,path])=>[...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([,x,y])=>({x:Number(x),y:Number(y)})));
 const height=365-20-62,pixelPerDollar=(points[0][2*count-1].y-points.at(-1)[0].y)/keys.reduce((total,key)=>total+plotted[0][key],0);
 assert.ok(pixelPerDollar>0);
 for(let i=0;i<count;i++){
  const row=plotted[i],total=row.benefitIncome+row.withdrawals+row.distributionCash;
  const totalPixels=points[0][2*count-1-i].y-points.at(-1)[i].y;
  assert.ok(Math.abs(totalPixels-total*pixelPerDollar)<.04);
  for(const [layer,key] of keys.entries()){
   const upper=points[layer][i].y,lower=points[layer][2*count-1-i].y;
   assert.ok(Math.abs(lower-upper-row[key]*pixelPerDollar)<.04);
   assert.ok(upper>=20-.01&&lower<=20+height+.01);
   if(layer>0)assert.equal(lower,points[layer-1][i].y);
  }
 }
 const first=plotted[0];node('income-chart-hit').handlers.pointermove({clientX:0});
 assert.ok(node('income-tooltip').innerHTML.includes('Age 62'));
 assert.ok(node('income-tooltip').innerHTML.includes('Total cash sources<span>'+money(first.benefitIncome+first.withdrawals+first.distributionCash)));
 node('income-chart-hit').handlers.pointerdown({clientX:10000});
 assert.ok(node('income-tooltip').innerHTML.includes('Age 75'));
 const last=plotted.at(-1);
 for(const key of keys)assert.ok(node('income-tooltip').innerHTML.includes(money(last[key])));
 node('income-chart').onpointerleave();assert.equal(node('income-tooltip').hidden,true);
 assert.ok(!/NaN|undefined|Infinity/.test(markup));
});

test('overview tabs switch charts with click, keyboard, focus and matching panel ARIA',()=>{
 const {node,overviewButtons}=renderCharts(structuredClone(DEFAULTS),300);
 overviewButtons[1].onclick();
 assert.equal(node('overview-portfolio-panel').hidden,true);assert.equal(node('overview-income-panel').hidden,false);
 assert.equal(overviewButtons[1].attributes['aria-selected'],'true');assert.equal(overviewButtons[0].tabIndex,-1);
 let prevented=false;
 overviewButtons[1].handlers.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
 assert.ok(prevented);assert.equal(overviewButtons[0].focused,true);assert.equal(node('overview-income-panel').hidden,true);
 overviewButtons[0].handlers.keydown({key:'End',preventDefault(){}});
 assert.equal(overviewButtons[1].tabIndex,0);assert.equal(node('overview-income-panel').hidden,false);
 overviewButtons[1].handlers.keydown({key:'Home',preventDefault(){}});
 assert.equal(node('overview-portfolio-panel').hidden,false);
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 for(const view of ['portfolio','income']){
  assert.ok(html.includes('aria-controls="overview-'+view+'-panel"'));
  assert.ok(html.includes('role="tabpanel" aria-labelledby="overview-'+view+'-tab"'));
 }
});

test('income chart handles zero cash, a single-year horizon and narrow screens without invalid geometry',()=>{
 const state=structuredClone(DEFAULTS);Object.assign(state,{age:65,retire:65,death:65,expenses:0,annualRrspWithdrawal:0,workIncome:0,retiredIncome:0});
 for(const account of Object.values(state.accounts)){account.balance=0;account.saving=0;}
 let rendered=renderCharts(state,280),markup=rendered.node('income-chart').innerHTML;
 assert.ok(markup.includes('No cash sources projected'));
 assert.ok(!/NaN|undefined|Infinity/.test(markup));
 rendered.node('income-chart-hit').handlers.pointerdown({clientX:140});
 assert.ok(rendered.node('income-tooltip').innerHTML.includes('Total cash sources<span>$0'));
 state.pensionIncome=24000;rendered=renderCharts(state,280);markup=rendered.node('income-chart').innerHTML;
 const area=markup.match(/id="income-area-pensionIncome"[^>]* d="([^"]+)"/)[1];
 const coordinates=[...area.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(([,x,y])=>({x:Number(x),y:Number(y)}));
 assert.ok(coordinates[1].x>coordinates[0].x);assert.ok(coordinates[2].y>coordinates[1].y);
 assert.ok(!markup.includes('No cash sources projected'));assert.ok(!/NaN|undefined|Infinity/.test(markup));
 rendered.node('income-chart-hit').handlers.pointerdown({clientX:140});
 assert.ok(rendered.node('income-tooltip').innerHTML.includes('$24,000'));
 const many={...state,death:120};rendered=renderCharts(many,280);
 assert.ok(Number.parseFloat(rendered.node('income-chart-container').style.width)>280);
});
