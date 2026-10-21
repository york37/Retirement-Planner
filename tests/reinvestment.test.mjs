import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,project,incomeTax} from '../dist/engine.js';
const near=(a,b,tolerance=.02)=>assert.ok(Math.abs(a-b)<tolerance,a+' != '+b);
function scenario(overrides={}){
 const s=structuredClone(DEFAULTS);
 Object.assign(s,{age:60,retire:60,death:60,inflation:0,equity:0,bond:0,yield:0,expenses:0,annualRrspWithdrawal:0,workIncome:0,retiredIncome:0,pensionIncome:0,cppIncome:0,oasIncome:0},overrides);
 for(const a of Object.values(s.accounts)){a.balance=0;a.saving=0;a.equity=100;}
 return s;
}

test('annual surplus below, at and above $14,000 fills TFSA before non-registered',()=>{
 // Small registered payments are sheltered by personal credits, isolating the allocation boundary.
 for(const surplus of [0,1000,13999.99,14000,14000.01,15000]){
  const s=scenario({annualRrspWithdrawal:surplus});s.accounts.rrsp.balance=100000;
  const [r]=project(s);near(r.tax,0);near(r.cashReinvestment,surplus);
  near(r.tfsa,Math.min(surplus,14000));near(r.nonreg,Math.max(0,surplus-14000));
  near(r.tfsaReinvestment,r.tfsa);near(r.nonregReinvestment,r.nonreg);near(r.acb,r.nonreg);
  near(r.cashReinvestment,r.tfsaReinvestment+r.nonregReinvestment);
  near(r.ledger,100000);near(r.rrsp,100000-surplus);
 }
});

test('living expenses and tax are paid before the surplus allocation and deposits earn no same-year return',()=>{
 const s=scenario({annualRrspWithdrawal:100000,expenses:20000,equity:10});s.accounts.rrsp.balance=200000;
 const [r]=project(s),tax=incomeTax(100000,'ON',1,60),surplus=100000-20000-tax;
 near(r.tax,tax);near(r.cashReinvestment,surplus);near(r.tfsaReinvestment,14000);
 near(r.nonregReinvestment,surplus-14000);near(r.acb,surplus-14000);
 near(r.tfsa,14000);near(r.nonreg,surplus-14000);near(r.rrsp,110000);near(r.growth,10000);
 near(r.ledger,200000+r.growth-r.expenses-r.tax);
});

test('the fixed nominal allocation cap resets each year and TFSA deposits compound starting next year',()=>{
 const s=scenario({death:62,annualRrspWithdrawal:50000,inflation:3,equity:10});s.accounts.rrsp.balance=1000000;
 const rows=project(s);let openingTfsa=0;
 for(const r of rows){
  assert.ok(r.cashReinvestment>14000);near(r.tfsaReinvestment,14000);
  near(r.nonregReinvestment,r.cashReinvestment-14000);near(r.tfsa,openingTfsa*1.1+14000);
  openingTfsa=r.tfsa;
 }
 near(rows[1].growthByAccount.tfsa,1400);near(rows[2].growthByAccount.tfsa,2940);
});

test('unused annual allocation does not carry forward',()=>{
 const s=scenario({death:61,annualRrspWithdrawal:5000,pensionIncome:50000,pensionStart:61});s.accounts.rrsp.balance=100000;
 const [first,next]=project(s);near(first.tfsaReinvestment,5000);near(first.nonregReinvestment,0);
 assert.ok(next.cashReinvestment>14000);near(next.tfsaReinvestment,14000);assert.ok(next.nonregReinvestment>0);
});

test('all cash sources share one annual cap and required RRIF payments are not reinvested twice',()=>{
 const s=scenario({age:72,retire:72,death:72,pensionIncome:20000,pensionStart:65,cppIncome:12000,oasIncome:8000,yield:2,expenses:1000});
 s.accounts.rrsp.balance=1000000;s.accounts.nonreg.balance=100000;
 const [r]=project(s);near(r.rrspWithdrawal,r.rrif);near(r.rrif,54000);
 near(r.cashReinvestment,r.benefitIncome+r.rrspWithdrawal+r.distributionCash-r.tax-r.expenses);
 near(r.tfsaReinvestment,14000);near(r.nonregReinvestment,r.cashReinvestment-14000);
 near(r.nonreg,100000-r.distributionCash+r.nonregReinvestment);
 near(r.acb,70000+r.nonregReinvestment);
});

test('scheduled savings remain separate from the surplus allocation, including working-year income',()=>{
 const s=scenario({retire:61,death:61,pensionIncome:50000,pensionStart:60});
 s.accounts.tfsa.saving=7000;s.accounts.nonreg.saving=5000;
 const [r]=project(s);near(r.withdrawals,0);near(r.savings,12000);near(r.savingsByAccount.tfsa,7000);
 near(r.tfsaReinvestment,14000);near(r.tfsa,21000);
 near(r.nonreg,r.nonregReinvestment+5000);near(r.acb,r.nonreg);
 near(r.cashReinvestment,r.benefitIncome-r.tax);
});

test('an unfunded expense does not create a surplus deposit',()=>{
 const s=scenario({expenses:50000,annualRrspWithdrawal:5000});s.accounts.rrsp.balance=100000;s.accounts.tfsa.balance=1000;
 const [r]=project(s);near(r.shortfall,44000);near(r.tfsa,0);near(r.cashReinvestment,0);
 near(r.tfsaReinvestment,0);near(r.nonregReinvestment,0);near(r.acb,0);
});
