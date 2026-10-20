import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,project,validate} from '../dist/engine.js';
import {ACCOUNT_DISPLAY,withdrawalSources,withdrawalAmounts} from '../dist/withdrawals.js';
const near=(a,b,tol=.02)=>assert.ok(Math.abs(a-b)<tol,a+' != '+b);
function scenario(overrides={}){
 const s=structuredClone(DEFAULTS);
 Object.assign(s,{age:60,retire:60,death:60,inflation:0,equity:0,bond:0,yield:0,annualRrspWithdrawal:10000,expenses:20000,workIncome:0,retiredIncome:0,nonregGainPercent:0},overrides);
 for(const a of Object.values(s.accounts)){a.balance=50000;a.saving=0;a.equity=100;}
 return s;
}
test('manual RRSP payment comes first, then non-registered capital, with no unnecessary TFSA sale',()=>{
 const [r]=project(scenario());near(r.rrspWithdrawal,10000);near(r.nonregWithdrawal,10000);near(r.tfsaWithdrawal,0);
 near(r.rrsp,40000);near(r.nonreg,40000);near(r.tfsa,50000);near(r.shortfall,0);
 assert.deepEqual(withdrawalSources(r),['rrsp','nonreg']);
});
test('non-registered exhaustion moves only the remaining gap to TFSA',()=>{
 const s=scenario({expenses:25000});s.accounts.nonreg.balance=5000;
 const [r]=project(s);near(r.rrspWithdrawal,10000);near(r.nonregWithdrawal,5000);near(r.tfsaWithdrawal,10000);near(r.shortfall,0);
});
test('manual payment is fixed nominal, starts only at retirement, and persists into RRIF years',()=>{
 const s=scenario({age:60,retire:62,death:73,inflation:3,annualRrspWithdrawal:5000,expenses:0});s.accounts.rrsp.balance=200000;
 for(const r of project(s)){
  near(r.scheduledRrspWithdrawal,r.retired?5000:0);
  near(r.rrspWithdrawal,Math.max(r.scheduledRrspWithdrawal,r.rrif));
  if(!r.retired)near(r.withdrawals,0);
 }
});
test('zero disables voluntary RRSP payments; age-72 minimum overrides it and never adds to it',()=>{
 const s=scenario({age:70,retire:70,death:72,annualRrspWithdrawal:0,expenses:0});s.accounts.rrsp.balance=100000;
 const [a,b,c]=project(s);near(a.rrspEndBalance,100000);near(a.withdrawals,0);
 near(b.rrspEndBalance,0);near(b.rrifEndBalance,100000);near(b.rrspToRrifTransfer,100000);near(b.tax,0);
 near(c.rrif,5400);near(c.rrifCashWithdrawal,5400);near(c.rrifEndBalance,94600);near(c.rrspCashWithdrawal,0);
 const high=project(scenario({age:72,retire:72,death:72,annualRrspWithdrawal:10000,expenses:10000}))[0];
 near(high.rrspWithdrawal,10000);near(high.rrif,2700);
});
test('required RRIF payment is the only pre-retirement sale when retirement is later than age 72',()=>{
 const s=scenario({age:70,retire:75,death:75,annualRrspWithdrawal:50000,expenses:0,workIncome:100000});s.accounts.rrsp.balance=100000;
 for(const r of project(s).filter(row=>!row.retired)){
  near(r.rrspWithdrawal,r.rrif);near(r.nonregWithdrawal,0);near(r.tfsaWithdrawal,0);near(r.scheduledRrspWithdrawal,0);
 }
});
test('a manually chosen low RRSP payment reports a gap rather than silently drawing extra registered funds',()=>{
 const s=scenario({annualRrspWithdrawal:5000,expenses:20000});s.accounts.nonreg.balance=3000;s.accounts.tfsa.balance=2000;
 const [r]=project(s);near(r.rrspWithdrawal,5000);near(r.rrsp,45000);near(r.nonregWithdrawal,3000);near(r.tfsaWithdrawal,2000);near(r.shortfall,10000);
});
test('scheduled registered payment clips at available balance',()=>{
 const s=scenario({annualRrspWithdrawal:100000});s.accounts.rrsp.balance=3000;
 const [r]=project(s);near(r.rrspWithdrawal,3000);near(r.rrsp,0);near(r.nonregWithdrawal,17000);near(r.shortfall,0);
});
test('tax top-ups use taxable capital and TFSA without increasing the chosen RRSP amount',()=>{
 const [r]=project(scenario({annualRrspWithdrawal:50000,expenses:180000,retiredIncome:100000}));
 near(r.rrspWithdrawal,50000);near(r.nonregWithdrawal,50000);near(r.tfsaWithdrawal,50000);
 assert.ok(r.shortfall>30000);near(r.withdrawals-r.tax+r.shortfall,r.expenses);
});
test('registered surplus is reinvested once at year-end and adds cost basis',()=>{
 const [r]=project(scenario({annualRrspWithdrawal:30000,expenses:1000,equity:10}));
 near(r.rrspWithdrawal,30000);near(r.nonregWithdrawal,0);near(r.tfsaWithdrawal,0);
 near(r.cashReinvestment,30000-1000-r.tax);near(r.rrifReinvestment,r.cashReinvestment);
 near(r.nonreg,55000+r.cashReinvestment);near(r.acb,50000+r.cashReinvestment);
});
test('removed order/approach/guide values in old saved scenarios cannot change the fixed withdrawal sequence',()=>{
 const baseline=project(scenario())[0];
 const [r]=project(scenario({order:'tfsa,nonreg,rrsp',withdrawalMode:'blended',rrspIncomeTarget:0}));
 assert.deepEqual(r.withdrawalsByAccount,baseline.withdrawalsByAccount);near(r.tax,baseline.tax);
});
test('all annual account, ACB, tax and cash ledgers reconcile across manual settings and benefits',()=>{
 for(const annualRrspWithdrawal of [0,10000,50000,180000]){
  const s=structuredClone(DEFAULTS);Object.assign(s,{annualRrspWithdrawal,pensionIncome:24000,pensionStart:60,cppIncome:12000,oasIncome:8500});
  let opening=Object.fromEntries(Object.entries(s.accounts).map(([k,a])=>[k,a.balance])),acb=opening.nonreg*.7;
  for(const r of project(s)){
   for(const k of ['rrsp','nonreg','tfsa']){
    const cash=k==='nonreg'?r.cashReinvestment-r.distributionCash:0;
    near(r[k],opening[k]+r.growthByAccount[k]+r.savingsByAccount[k]-r.withdrawalsByAccount[k]+cash);
    assert.ok(r[k]>=0);
   }
   near(r.acb,acb-r.nonregCostBasisSold+r.cashReinvestment+r.savingsByAccount.nonreg);
   near(r.benefitIncome+r.withdrawals+r.distributionCash+r.shortfall+r.externalTaxPaid,r.expenses+r.taxPaid+r.cashReinvestment);
   near(r.tax,r.taxPaid+r.unpaidTax);near(r.taxPaid,r.portfolioTaxPaid+r.externalTaxPaid);
   near(r.withdrawals,r.rrspWithdrawal+r.nonregWithdrawal+r.tfsaWithdrawal);
   near(r.rrsp,r.rrspEndBalance+r.rrifEndBalance);near(r.rrspWithdrawal,r.rrspCashWithdrawal+r.rrifCashWithdrawal);
   near(r.cashReinvestment,r.benefitSurplus+r.rrifReinvestment+r.distributionReinvestment);
   acb=r.acb;opening={rrsp:r.rrsp,nonreg:r.nonreg,tfsa:r.tfsa};
  }
 }
});
test('manually entered gross RRSP/RRIF values retain independently verified 2026 top-bracket tax',()=>{
 for(const age of [65,72]){
  const gross=(180000-44666.01824-(age===72?421.48888:0))/.464704;
  const s=scenario({age,retire:age,death:age,expenses:180000,annualRrspWithdrawal:gross});
  s.accounts.rrsp.balance=2000000;s.accounts.nonreg.balance=0;s.accounts.tfsa.balance=0;
  const [r]=project(s);near(r.tax,age===65?111226.20369095165:110319.19862966535);
  near(r.rrspWithdrawal,gross);near(r.rrspWithdrawal-r.tax,180000);near(r.shortfall,0);
 }
});
test('manual withdrawal rejects invalid amounts and legacy missing input receives its default',()=>{
 for(const annualRrspWithdrawal of [-1,NaN,Infinity,1e11,'50000'])assert.ok(validate({...DEFAULTS,annualRrspWithdrawal}).length);
 assert.deepEqual(validate({...DEFAULTS,annualRrspWithdrawal:0}),[]);
 const s=scenario();delete s.annualRrspWithdrawal;near(project(s)[0].scheduledRrspWithdrawal,50000);
});
test('graph/table source colours are distinct and capital withdrawal sources stay explicit',()=>{
 assert.equal(new Set(Object.values(ACCOUNT_DISPLAY).map(a=>a.colour)).size,3);
 const r={rrspWithdrawal:1000,nonregWithdrawal:0,tfsaWithdrawal:500,distributionCash:200};
 assert.deepEqual(withdrawalSources(r),['rrsp','tfsa']);assert.deepEqual(withdrawalAmounts(r),{rrsp:1000,nonreg:0,tfsa:500});assert.deepEqual(withdrawalSources({distributionCash:200}),[]);
});
