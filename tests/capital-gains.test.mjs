import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DEFAULTS,project,validate,initialNonregCostBasis,incomeTax} from '../dist/engine.js';
import {formatMoneyFields,parseDollarValue} from '../dist/money-inputs.js';
import {saveInputs,loadInputs,clearInputs} from '../dist/storage.js';
const near=(actual,expected,tolerance=.02)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function scenario(overrides={}){
 const s=structuredClone(DEFAULTS);
 Object.assign(s,{annualRrspWithdrawal:0,age:60,retire:60,death:60,inflation:0,equity:0,bond:0,yield:0,expenses:10000,workIncome:0,retiredIncome:0},overrides);
 for(const account of Object.values(s.accounts)){account.balance=0;account.saving=0;account.equity=100;}
 s.accounts.nonreg.balance=100000;return s;
}

test('default 70/30 split returns principal tax-free and includes only half of the proportional gain',()=>{
 assert.equal(DEFAULTS.nonregGainPercent,30);assert.ok(!Object.hasOwn(DEFAULTS,'acb'));
 near(initialNonregCostBasis(100000,30),70000);
 const [r]=project(scenario());
 near(r.nonregWithdrawal,10000);near(r.nonregCostBasisSold,7000);near(r.realizedCapitalGains,3000);
 near(r.taxableCapitalGains,1500);near(r.taxableIncome,1500);near(r.nonreg,90000);near(r.acb,63000);
 near(r.tax,0); // Personal tax credits shelter this small taxable gain.
});

test('tax-funded extra sales also use the 70/30 split rather than taxing the full withdrawal',()=>{
 const [r]=project(scenario({retiredIncome:100000}));
 // In this income slice the combined Ontario/federal marginal rate is 31.48%.
 // Only 30% of the sale is gain and half is included: tax = gross sale * .3 * .5 * .3148.
 const gross=10000/(1-.3*.5*.3148);
 near(r.nonregWithdrawal,gross);near(r.nonregCostBasisSold,gross*.7);near(r.realizedCapitalGains,gross*.3);
 near(r.taxableCapitalGains,gross*.15);near(r.taxableIncome,100000+gross*.15);
 near(r.tax,gross-10000);near(r.withdrawals-r.taxPaid,10000);
 near(r.tax,incomeTax(r.taxableIncome,'ON',1,60)-incomeTax(100000,'ON',1,60));
});

test('user gain overrides including 0% and 100% change withdrawals and tax correctly',()=>{
 const outcomes=[];
 for(const nonregGainPercent of [0,30,45.5,100]){
  const [r]=project(scenario({retiredIncome:100000,nonregGainPercent}));
  const gain=nonregGainPercent/100,gross=10000/(1-gain*.5*.3148);
  near(r.nonregWithdrawal,gross);near(r.realizedCapitalGains,gross*gain);near(r.nonregCostBasisSold,gross*(1-gain));
  near(r.taxableCapitalGains,gross*gain*.5);near(r.tax,gross-10000);outcomes.push(r.tax);
 }
 assert.ok(outcomes.every((tax,i)=>i===0||tax>outcomes[i-1]));
});

test('new contributions add cost basis and dilute the gain percentage instead of reusing a fixed 30%',()=>{
 const s=scenario({age:59,retire:60,death:60,retiredIncome:100000});s.accounts.nonreg.saving=100000;
 const [working,retired]=project(s);
 near(working.acb,170000);near(working.nonreg,200000);near(working.withdrawals,0);
 near(retired.realizedCapitalGains,retired.nonregWithdrawal*.15);
 near(retired.nonregCostBasisSold,retired.nonregWithdrawal*.85);
 near(retired.taxableCapitalGains,retired.nonregWithdrawal*.075);
});

test('unrealized price growth increases the later gain fraction without taxing unsold appreciation',()=>{
 const s=scenario({age:59,retire:60,death:60,equity:10,retiredIncome:100000});
 const [working,retired]=project(s);
 near(working.nonreg,110000);near(working.acb,70000);near(working.tax,0);
 near(retired.nonregCostBasisSold,retired.nonregWithdrawal*70000/110000);
 near(retired.realizedCapitalGains,retired.nonregWithdrawal*40000/110000);
 near(retired.taxableCapitalGains,retired.realizedCapitalGains*.5);
});

test('full liquidation realizes the initial gain once and exhausts the matching cost basis',()=>{
 const [r]=project(scenario({expenses:200000,retiredIncome:100000}));
 near(r.nonregWithdrawal,100000);near(r.nonregCostBasisSold,70000);near(r.realizedCapitalGains,30000);
 near(r.taxableCapitalGains,15000);near(r.taxableIncome,115000);near(r.acb,0);near(r.nonreg,0);
 assert.ok(r.shortfall>100000);
});

test('percentage validation rejects invalid values while missing legacy values receive the default',()=>{
 for(const nonregGainPercent of [-.1,100.1,NaN,Infinity,'30'])assert.ok(validate(scenario({nonregGainPercent})).length);
 assert.deepEqual(validate(scenario({nonregGainPercent:0})),[]);
 const legacy=scenario();delete legacy.nonregGainPercent;
 near(project(legacy)[0].nonregCostBasisSold,7000);
});

test('actual form saves/restores the gain setting, preserves defaults for old saves, and resets to 30%',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 const inputs=[...html.matchAll(/<(input|select)\b([^>]+)>/g)].map(([,tag,attrs])=>{
  const attributes=Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,key,value])=>[key,value]));
  const field={...attributes,tagName:tag.toUpperCase(),checked:attrs.includes(' checked'),hasAttribute:name=>attrs.includes(name),options:[]};
  Object.defineProperty(field,'value',{get(){return this.raw??'';},set(value){this.raw=String(value);}});field.value=attributes.value??'';
  Object.defineProperty(field,'valueAsNumber',{get(){return Number.parseFloat(field.value);}});return field;
 }).filter(input=>input.name);
 const gain=inputs.find(input=>input.name==='nonregGainPercent');assert.ok(gain);assert.equal(gain.type,'number');assert.equal(gain.value,'30');
 const form={elements:{namedItem:name=>inputs.find(input=>input.name===name)},querySelectorAll:selector=>selector==='input[data-money]'?inputs.filter(input=>input.hasAttribute('data-money')):inputs};
 const items=new Map(),storage={getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
 const context={form,state:structuredClone(DEFAULTS),DEFAULTS,names:{tfsa:'TFSA',rrsp:'RRSP',nonreg:'Non-registered'},formatMoneyFields,parseDollarValue,saveInputs,loadInputs,inputStorage:storage,refreshForm:()=>{},$:()=>({textContent:''})};
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 const formCode=app.slice(app.indexOf('function setForm('),app.indexOf('function refreshForm('));
 const storageCode=app.slice(app.indexOf('function persistForm('),app.indexOf('function setForm('));
 vm.createContext(context);vm.runInContext(formCode+'\n'+storageCode+'\nsetForm(state);',context);
 gain.value='45.5';vm.runInContext('persistForm();setForm(DEFAULTS);restoreForm();',context);
 assert.equal(gain.value,'45.5');const read=vm.runInContext('readForm()',context);
 assert.equal(read.nonregGainPercent,45.5);assert.ok(!Object.hasOwn(read,'acb'));
 near(initialNonregCostBasis(read.accounts.nonreg.balance,read.nonregGainPercent),54500);
 form.elements.namedItem('annualRrspWithdrawal').value='95,000';
 vm.runInContext('persistForm();setForm(DEFAULTS);restoreForm();',context);
 assert.equal(vm.runInContext('readForm().annualRrspWithdrawal',context),95000);
 form.elements.namedItem('annualRrspWithdrawal').value='0';
 vm.runInContext('persistForm();setForm(DEFAULTS);restoreForm();',context);
 assert.equal(vm.runInContext('readForm().annualRrspWithdrawal',context),0);
 for(const removed of ['order','withdrawalMode','rrspIncomeTarget'])assert.equal(form.elements.namedItem(removed),undefined);
 saveInputs(storage,{'nonreg-balance':'250,000'});vm.runInContext('setForm(DEFAULTS);restoreForm();',context);
 assert.equal(gain.value,'30');assert.equal(form.elements.namedItem('nonreg-balance').value,'250,000');assert.equal(form.elements.namedItem('annualRrspWithdrawal').value,'50,000');
 gain.value='0';vm.runInContext('persistForm();setForm(DEFAULTS);restoreForm();',context);assert.equal(gain.value,'0');
 vm.runInContext('setForm(DEFAULTS);',context);clearInputs(storage);
 assert.equal(gain.value,'30');assert.equal(form.elements.namedItem('annualRrspWithdrawal').value,'50,000');assert.equal(loadInputs(storage).values,null);
});
