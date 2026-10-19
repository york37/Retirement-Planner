import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,project} from '../dist/engine.js';
import {ACCOUNT_DISPLAY,withdrawalAmounts,withdrawalSources} from '../dist/withdrawals.js';
const priorities=['nonreg,rrsp,tfsa','rrsp,nonreg,tfsa','tfsa,nonreg,rrsp'];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.02,`${actual} != ${expected}`);
function scenario(overrides={}){
 const s=structuredClone(DEFAULTS);
 Object.assign(s,{age:60,retire:60,death:60,inflation:0,equity:0,bond:0,yield:0,expenses:10000,workIncome:0,retiredIncome:0,acb:50000},overrides);
 for(const key of ['rrsp','nonreg','tfsa'])s.accounts[key]={balance:50000,saving:0,equity:100};
 return s;
}
test('each priority draws from the chosen first account and produces the expected account balances',()=>{
 for(const order of priorities){
  const s=scenario({order}),[r]=project(s),first=order.split(',')[0];
  for(const key of ['rrsp','nonreg','tfsa']){near(r.withdrawalsByAccount[key],key===first?10000:0);near(r[key],key===first?40000:50000);}
  assert.deepEqual(withdrawalSources(r),[first]);near(r.withdrawals,10000);near(r.tax,0);
 }
});
test('when the first account is depleted the next priority covers only the remaining cash need',()=>{
 for(const order of priorities){
  const s=scenario({order,expenses:12000}),[first,second,third]=order.split(',');
  s.accounts[first].balance=5000;s.accounts[second].balance=20000;s.accounts[third].balance=30000;s.acb=s.accounts.nonreg.balance;
  const [r]=project(s);near(r[first],0);near(r[second],13000);near(r[third],30000);
  near(r.withdrawalsByAccount[first],5000);near(r.withdrawalsByAccount[second],7000);near(r.withdrawalsByAccount[third],0);near(r.shortfall,0);
 }
});
test('withdrawal taxes are grossed up in the selected account and change the outstanding balances',()=>{
 const outcomes={};
 for(const order of priorities){
  const s=scenario({order,expenses:20000,retiredIncome:100000,acb:25000});s.accounts.rrsp.balance=200000;
  const [r]=project(s),first=order.split(',')[0];outcomes[first]=r;
  near(r.withdrawalsByAccount[first],r.expenses+r.tax);
  for(const key of order.split(',').slice(1))near(r.withdrawalsByAccount[key],0);
  near(r[first],s.accounts[first].balance-r.withdrawalsByAccount[first]);near(r.tax,r.taxPaid);near(r.shortfall,0);
 }
 assert.ok(outcomes.rrsp.tax>outcomes.nonreg.tax);assert.ok(outcomes.nonreg.tax>outcomes.tfsa.tax);near(outcomes.tfsa.tax,0);
 assert.ok(outcomes.rrsp.ledger<outcomes.nonreg.ledger);assert.ok(outcomes.nonreg.ledger<outcomes.tfsa.ledger);
});
test('RRIF minimums take precedence in every priority and surplus proceeds are reinvested once',()=>{
 for(const order of priorities){
  const s=scenario({age:72,retire:72,death:72,expenses:1000,order});s.accounts.rrsp.balance=100000;
  const [r]=project(s);near(r.rrif,5400);near(r.rrspWithdrawal,5400);near(r.nonregWithdrawal,0);near(r.tfsaWithdrawal,0);
  near(r.rrifReinvestment,4400);near(r.rrsp,94600);near(r.nonreg,54400);near(r.tfsa,50000);assert.deepEqual(withdrawalSources(r),['rrsp']);
 }
});
test('investment taxes before retirement are paid externally without selling any account',()=>{
 for(const order of priorities){
  const s=scenario({retire:61,death:61,bond:10,expenses:0,workIncome:100000,order,acb:100000});
  s.accounts.nonreg={balance:100000,saving:0,equity:0};s.accounts.tfsa.balance=20000;s.accounts.rrsp.balance=50000;
  const [r]=project(s);assert.ok(r.tax>0);near(r.withdrawals,0);near(r.externalTaxPaid,r.tax);near(r.portfolioTaxPaid,0);
  near(r.tfsa,20000);near(r.rrsp,50000);near(r.nonreg,110000);assert.deepEqual(withdrawalSources(r),[]);
 }
});

test('all three accounts can be drawn in the same year without hiding an unfunded shortfall',()=>{
 const s=scenario({expenses:10000,acb:3000});for(const a of Object.values(s.accounts))a.balance=3000;
 const [r]=project(s);assert.equal(withdrawalSources(r).length,3);near(r.withdrawals,9000);near(r.shortfall,1000);
 for(const key of ['rrsp','nonreg','tfsa']){near(r[key],0);near(r.withdrawalsByAccount[key],3000);}
});
test('each outstanding account balance reconciles year over year for every priority',()=>{
 for(const order of priorities){
  const s=structuredClone(DEFAULTS);s.order=order;let opening=Object.fromEntries(Object.entries(s.accounts).map(([key,a])=>[key,a.balance]));
  for(const r of project(s)){
   for(const key of ['rrsp','nonreg','tfsa']){
    const reinvested=key==='nonreg'?r.rrifReinvestment:0;
    near(r[key],opening[key]+r.growthByAccount[key]+r.savingsByAccount[key]+reinvested-r.withdrawalsByAccount[key]);assert.ok(r[key]>=0);
   }
   near(r.withdrawals,r.rrspWithdrawal+r.nonregWithdrawal+r.tfsaWithdrawal);near(r.ledger,r.rrsp+r.nonreg+r.tfsa);
   near(r.growth,Object.values(r.growthByAccount).reduce((sum,x)=>sum+x,0));near(r.savings,Object.values(r.savingsByAccount).reduce((sum,x)=>sum+x,0));
   opening={rrsp:r.rrsp,nonreg:r.nonreg,tfsa:r.tfsa};
  }
 }
});
test('graph/table source colours are distinct and overlapping sources remain explicit',()=>{
 assert.equal(new Set(Object.values(ACCOUNT_DISPLAY).map(a=>a.colour)).size,3);
 const r={rrspWithdrawal:1000,nonregWithdrawal:0,tfsaWithdrawal:500};
 assert.deepEqual(withdrawalSources(r),['rrsp','tfsa']);assert.deepEqual(withdrawalAmounts(r),{rrsp:1000,nonreg:0,tfsa:500});assert.deepEqual(withdrawalSources({}),[]);
});


test('all working years before RRIF age have zero withdrawals under every priority',()=>{
 for(const order of priorities){
  const s=structuredClone(DEFAULTS);s.order=order;
  for(const r of project(s).filter(row=>!row.retired)){
   near(r.withdrawals,0);near(r.rrspWithdrawal,0);near(r.nonregWithdrawal,0);near(r.tfsaWithdrawal,0);
   near(r.rrspLivingWithdrawal,0);near(r.rrspTaxWithdrawal,0);near(r.externalTaxPaid,r.tax-r.benefitTax);
  }
 }
});

test('age-71 conversion transfers balances without a withdrawal or tax; the first minimum is at 72',()=>{
 const s=scenario({age:70,retire:70,death:72,expenses:0,acb:0});
 s.accounts.rrsp.balance=100000;s.accounts.nonreg.balance=0;s.accounts.tfsa.balance=0;
 const [at70,at71,at72]=project(s);
 near(at70.rrspEndBalance,100000);near(at70.rrifEndBalance,0);near(at70.withdrawals,0);
 near(at71.rrspEndBalance,0);near(at71.rrifEndBalance,100000);near(at71.rrspToRrifTransfer,100000);
 near(at71.withdrawals,0);near(at71.rrif,0);near(at71.tax,0);near(at71.taxableIncome,0);
 near(at72.rrif,5400);near(at72.rrspCashWithdrawal,0);near(at72.rrifCashWithdrawal,5400);near(at72.rrifEndBalance,94600);
});

test('RRIF minimum is the only pre-retirement registered payment if retirement is later than 72',()=>{
 const s=scenario({age:70,retire:75,death:75,expenses:0,workIncome:100000,bond:5,acb:50000});
 s.accounts.rrsp.balance=100000;s.accounts.nonreg.equity=0;
 for(const r of project(s).filter(row=>!row.retired)){
  near(r.rrspWithdrawal,r.rrif);near(r.rrspLivingWithdrawal,0);near(r.rrspTaxWithdrawal,0);
  near(r.nonregWithdrawal,0);near(r.tfsaWithdrawal,0);
 }
});

test('first retirement RRSP draw equals living costs plus income tax using an independent bracket calculation',()=>{
 // At age 65, $40,000 of net living costs needs a gross draw within the first brackets.
 // Federal/ON age + personal credits total $4,568.6155; Ontario health premium is $450.
 const s=scenario({age:65,retire:65,death:65,expenses:40000,order:'rrsp,nonreg,tfsa',acb:0});
 s.accounts.rrsp.balance=200000;s.accounts.nonreg.balance=0;s.accounts.tfsa.balance=0;
 const [r]=project(s),expected=(40000-4118.6155)/.8095;
 near(r.rrspWithdrawal,expected);near(r.rrspLivingCash,40000);near(r.rrspLivingTax,expected-40000);
 near(r.tax,expected-40000);near(r.rrspTaxWithdrawal,0);near(r.rrif,0);
 near(r.rrsp,200000-expected);near(r.shortfall,0);near(r.withdrawals-r.tax,r.expenses);
});

test('default first-retirement RRSP-first case does not gross up RRSP to pay non-registered income tax',()=>{
 const s=structuredClone(DEFAULTS);s.order='rrsp,nonreg,tfsa';
 const r=project(s).find(row=>row.retired),factor=1.02**19;
 // In the applicable 2026 slices, age-credit phase-outs give tax = .260075*gross - 7510.83425.
 // Thus gross - tax = .739925*gross + 7510.83425, all in today's dollars.
 const expected=(48000-7510.83425)/.739925*factor;
 near(r.rrspWithdrawal,expected);near(r.rrspLivingCash,48000*factor);near(r.rrspLivingTax,expected-r.expenses);
 near(r.rrspTaxWithdrawal,0);near(r.rrif,0);assert.ok(r.nonregWithdrawal>0);
 near(r.withdrawals,r.expenses+r.tax);near(r.rrspWithdrawal,r.rrspLivingCash+r.rrspLivingTax);
});

test('pension-covered living expenses do not trigger RRSP withdrawals to fund taxable-account growth',()=>{
 const s=scenario({age:65,retire:65,death:65,expenses:10000,pensionIncome:50000,pensionStart:65,bond:10,order:'rrsp,nonreg,tfsa',acb:100000});
 s.accounts.nonreg={balance:100000,saving:0,equity:0};s.accounts.rrsp.balance=100000;
 const [r]=project(s);near(r.rrspWithdrawal,0);near(r.rrspLivingCash,0);near(r.rrspLivingTax,0);near(r.rrspTaxWithdrawal,0);
 assert.ok(r.nonregWithdrawal>0);near(r.rrif,0);near(r.shortfall,0);
});

test('registered payment components reconcile for every year and priority without double-counting tax',()=>{
 for(const order of priorities){
  const s=structuredClone(DEFAULTS);Object.assign(s,{order,pensionIncome:24000,pensionStart:60,cppIncome:12000,oasIncome:8500});
  for(const r of project(s)){
   near(r.rrspWithdrawal,r.rrif+r.rrspLivingCash+r.rrspLivingTax+r.rrspTaxWithdrawal);
   near(r.rrspWithdrawal,r.rrspCashWithdrawal+r.rrifCashWithdrawal);
   near(r.rrsp,r.rrspEndBalance+r.rrifEndBalance);
   near(r.benefitIncome+r.withdrawals+r.shortfall+r.externalTaxPaid,r.expenses+r.taxPaid+r.benefitSurplus+r.rrifReinvestment);
   near(r.taxPaid,r.portfolioTaxPaid+r.externalTaxPaid);
  }
 }
});

test('$180,000 of living costs requires tax on the full RRSP draw, not just the spending target',()=>{
 const s=scenario({age:65,retire:65,death:65,expenses:180000,order:'rrsp,nonreg,tfsa',acb:0});
 s.accounts.rrsp.balance=2000000;s.accounts.nonreg.balance=0;s.accounts.tfsa.balance=0;
 const [r]=project(s);
 // Independent top-bracket formula, including Ontario surtax, health premium and minimum federal BPA:
 // combined tax = .535296 * gross - 44666.01824; net = .464704 * gross + 44666.01824.
 const gross=(180000-44666.01824)/.464704;
 near(gross,291226.2036909517);near(r.rrspWithdrawal,gross);
 near(r.federalIncomeTax,68004.63721801405);near(r.provincialIncomeTax,43221.5664729376);
 near(r.totalIncomeTax,111226.20369095165);near(r.rrspLivingCash,180000);near(r.rrspLivingTax,r.totalIncomeTax);
 near(r.effectiveTaxRate,.38192374958465125);near(r.totalIncomeTax/r.taxableIncome,r.effectiveTaxRate);
 near(r.withdrawals-r.taxPaid,180000);near(r.taxableIncome,r.withdrawals);near(r.shortfall,0);
});

test('$180,000 living costs from RRIF at age 72 correctly include eligible pension credits',()=>{
 const s=scenario({age:72,retire:72,death:72,expenses:180000,order:'rrsp,nonreg,tfsa',acb:0});
 s.accounts.rrsp.balance=2000000;s.accounts.nonreg.balance=0;s.accounts.tfsa.balance=0;
 const [r]=project(s);
 // Federal $280 plus Ontario $1,796 * 5.05% * 1.56 reduce tax by $421.48888 in this bracket.
 const gross=(180000-44666.01824-421.48888)/.464704;
 near(r.rrifCashWithdrawal,gross);near(r.rrspCashWithdrawal,0);
 near(r.totalIncomeTax,110319.19862966535);near(r.rrifCashWithdrawal-r.totalIncomeTax,180000);
 near(r.effectiveTaxRate,.37999277743388177);near(r.shortfall,0);
});
