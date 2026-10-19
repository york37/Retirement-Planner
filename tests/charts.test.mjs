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
    const container=id==='chart'?'chart-container':id==='tax-chart'?'tax-chart-container':null;
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
 const context={state,rows,taxView,$:selector=>node(selector.slice(1)),money,compact,percent:value=>value===null?'—':(value*100).toFixed(2)+'%',ACCOUNT_DISPLAY,withdrawalAmounts,retirementTimeline,timelineWidth,realAnnualTax};
 vm.runInNewContext(functions+'\nrenderTaxChart();renderChart();',context);
  const buttons=['rate','amounts'].map(view=>{
  const button=node(view==='rate'?'tax-rate-tab':'tax-amounts-tab');
  button.dataset={taxView:view};button.classList={toggle(name,value){button[name]=value;}};button.focus=()=>{button.focused=true;};
  return button;
 });
 context.document={querySelectorAll:()=>buttons};
 const tabSetup=app.slice(app.indexOf('function selectTaxView('),app.indexOf("for(const id of ['method-top'"));
 vm.runInNewContext(tabSetup,context);
 return {nodes,node,rows,money,buttons};
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
 assert.ok(node('tax-tooltip').innerHTML.includes('Age 67'));
 assert.ok(node('tax-tooltip').innerHTML.includes(money(first.totalIncomeTax)));
 assert.ok(node('tax-tooltip').innerHTML.includes((first.effectiveTaxRate*100).toFixed(2)+'%'));
 node('tax-chart-hit').handlers.pointerdown({clientX:10000});
 assert.ok(node('tax-tooltip').innerHTML.includes('Age 90'));
 node('chart-hit').handlers.pointermove({clientX:0});
 assert.ok(node('tooltip').innerHTML.includes('Age 67'));
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
 const state=structuredClone(DEFAULTS);Object.assign(state,{age:65,retire:65,death:71,expenses:10000,inflation:0,equity:0,bond:0,yield:0,workIncome:0,retiredIncome:0,pensionIncome:20000,pensionStart:69,order:'rrsp,nonreg,tfsa'});
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
 const state=structuredClone(DEFAULTS);Object.assign(state,{age:65,retire:65,death:65,expenses:180000,inflation:0,equity:0,bond:0,yield:0,workIncome:0,retiredIncome:0,order:'rrsp,nonreg,tfsa',acb:0});
 for(const account of Object.values(state.accounts)){account.balance=0;account.saving=0;}
 state.accounts.rrsp.balance=2000000;
 const {node}=renderCharts(state,800,'rate');
 assert.equal(node('tax-calculation-income').textContent,'$291,226');
 assert.equal(node('tax-calculation-rate').textContent,'38.19%');
 assert.equal(node('tax-calculation-total').textContent,'$111,226');
 assert.equal(node('tax-calculation-expenses').textContent,'$180,000');
 assert.equal(node('tax-calculation-withdrawals').textContent,'$291,226');
});
