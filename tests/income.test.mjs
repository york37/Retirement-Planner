import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,project,incomeTax,incomeTaxDetails,validate} from '../dist/engine.js';
const near=(actual,expected,tolerance=.02)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function scenario(overrides={}){
 const s=structuredClone(DEFAULTS);
 Object.assign(s,{age:60,retire:60,death:60,inflation:0,equity:0,bond:0,yield:0,expenses:40000,workIncome:0,retiredIncome:0,acb:0},overrides);
 for(const key of ['tfsa','rrsp','nonreg'])s.accounts[key]={balance:0,saving:0,equity:100};
 s.accounts.tfsa.balance=200000;
 return s;
}

test('pension starts at its chosen age; CPP/OAS start at 65 and all retain purchasing power through the final year',()=>{
 const s=scenario({age:60,retire:62,death:68,inflation:3,pensionIncome:10000,pensionStart:63,cppIncome:12000,oasIncome:8000});
 const rows=project(s);assert.equal(rows.at(-1).age,68);
 for(const r of rows){
  const factor=1.03**(r.age-60);
  near(r.pensionIncome,r.age>=63?10000*factor:0);
  near(r.cppIncome,r.age>=65?12000*factor:0);near(r.oasIncome,r.age>=65?8000*factor:0);
  near(r.benefitIncome,r.pensionIncome+r.cppIncome+r.oasIncome);
 }
});

test('a pension already in payment is active immediately; a future pension beyond the horizon remains zero',()=>{
 near(project(scenario({pensionIncome:10000,pensionStart:55}))[0].pensionIncome,10000);
 near(project(scenario({pensionIncome:10000,pensionStart:70}))[0].pensionIncome,0);
});

test('taxable pension covers spending before TFSA withdrawals and investment growth',()=>{
 const s=scenario({pensionIncome:20000,pensionStart:60,equity:10}),[r]=project(s);
 const tax=incomeTax(20000,'ON',1,60,20000);
 near(r.tax,tax);near(r.taxPaid,tax);near(r.taxableIncome,20000);
 near(r.tfsaWithdrawal,40000-20000+tax);near(r.tfsa,(200000-r.tfsaWithdrawal)*1.1);
 near(r.shortfall,0);near(r.benefitSurplus,0);
});

test('pension surplus is invested once in non-registered assets and increases cost basis',()=>{
 const s=scenario({pensionIncome:60000,pensionStart:60,expenses:20000}),[r]=project(s);
 const tax=incomeTax(60000,'ON',1,60,60000);
 near(r.withdrawals,0);near(r.benefitSurplus,60000-tax-20000);near(r.nonreg,r.benefitSurplus);
 near(r.acb,r.nonreg);near(r.rrifReinvestment,0);near(r.tfsa,200000);
 near(r.ledger,200000+60000-20000-tax);
});

test('pension before retirement is saved while scheduled contributions still occur and reduce taxable income',()=>{
 const s=scenario({age:60,retire:61,death:61,pensionIncome:30000,pensionStart:60});
 s.accounts.rrsp.saving=10000;
 const [r]=project(s),tax=incomeTax(20000,'ON',1,60,30000);
 near(r.expenses,0);near(r.pensionIncome,30000);near(r.taxableIncome,20000);near(r.tax,tax);
 near(r.nonreg,30000-tax);near(r.rrsp,10000);near(r.savings,10000);
});

test('CPP/OAS are taxable but do not receive the eligible employer-pension credit',()=>{
 const pension=project(scenario({age:65,retire:65,death:65,pensionIncome:50000,pensionStart:65}))[0];
 const cpp=project(scenario({age:65,retire:65,death:65,cppIncome:50000}))[0];
 near(pension.tax,incomeTax(50000,'ON',1,65,50000));near(cpp.tax,incomeTax(50000,'ON',1,65,0));
 assert.ok(cpp.tax>pension.tax);
 const oas=project(scenario({age:65,retire:65,death:65,oasIncome:50000}))[0];
 near(oas.tax,cpp.tax);near(oas.oasRecoveryTax,0);
});

test('OAS recovery uses the 2026 threshold, is capped at OAS received, and is deductible from taxable income',()=>{
 const below=incomeTaxDetails(95323,'ON',1,65,0,9000);near(below.oasRecoveryTax,0);
 const d=incomeTaxDetails(100000,'ON',1,65,0,9000),repayment=701.55;
 near(d.oasRecoveryTax,repayment);near(d.taxableIncome,100000-repayment);
 near(d.totalTax,incomeTax(100000-repayment,'ON',1,65)+repayment);
 near(d.totalTax,d.federalTax+d.provincialTax+d.oasRecoveryTax);
 near(d.effectiveTaxRate,d.totalTax/d.taxableIncome,1e-12);
 near(incomeTaxDetails(200000,'ON',1,65,0,9000).oasRecoveryTax,9000);
 near(incomeTaxDetails(200000,'ON',1,65).oasRecoveryTax,0);
 near(incomeTaxDetails(200000,'ON',2,65,0,18000).oasRecoveryTax,repayment*2);
});

test('investment withdrawals gross up for income tax and additional OAS recovery',()=>{
 const s=scenario({age:65,retire:65,death:65,expenses:80000,pensionIncome:80000,pensionStart:65,cppIncome:12000,oasIncome:9000,order:'rrsp,nonreg,tfsa'});
 s.accounts.rrsp.balance=200000;s.accounts.tfsa.balance=0;
 const [r]=project(s);
 assert.ok(r.rrspWithdrawal>0);assert.ok(r.oasRecoveryTax>0);
 const expected=incomeTaxDetails(101000+r.rrspWithdrawal,'ON',1,65,80000,9000);
 near(r.totalIncomeTax,expected.totalTax);near(r.taxableIncome,expected.taxableIncome);
 near(r.expenses+r.tax,r.benefitIncome+r.withdrawals);near(r.taxPaid,r.tax);near(r.shortfall,0);
 near(r.rrsp,200000-r.rrspWithdrawal);
});

test('benefits and mandatory RRIF payments reconcile account balances for every withdrawal priority',()=>{
 for(const order of ['nonreg,rrsp,tfsa','rrsp,nonreg,tfsa','tfsa,nonreg,rrsp']){
  const s=structuredClone(DEFAULTS);Object.assign(s,{order,pensionIncome:24000,pensionStart:60,cppIncome:12000,oasIncome:8500});
  let opening=Object.fromEntries(Object.entries(s.accounts).map(([key,a])=>[key,a.balance]));
  for(const r of project(s)){
   for(const key of ['tfsa','rrsp','nonreg']){
    const surplus=key==='nonreg'?r.benefitSurplus+r.rrifReinvestment:0;
    near(r[key],opening[key]+surplus+r.growthByAccount[key]+r.savingsByAccount[key]-r.withdrawalsByAccount[key]);
   }
   near(r.benefitIncome+r.withdrawals+r.shortfall+r.externalTaxPaid,r.expenses+r.taxPaid+r.benefitSurplus+r.rrifReinvestment);
   near(r.tax,r.taxPaid+r.unpaidTax);
   near(r.totalIncomeTax,r.federalIncomeTax+r.provincialIncomeTax+r.oasRecoveryTax);
   opening={tfsa:r.tfsa,rrsp:r.rrsp,nonreg:r.nonreg};
  }
 }
});

test('new income amounts and pension start age reject invalid input',()=>{
 for(const field of ['pensionIncome','cppIncome','oasIncome']){
  for(const value of [NaN,-1,Infinity,1e11])assert.ok(validate({...DEFAULTS,[field]:value}).length,`${field}: ${value}`);
 }
 for(const value of [NaN,17,121,65.5])assert.ok(validate({...DEFAULTS,pensionStart:value}).length);
 assert.deepEqual(validate({...DEFAULTS,pensionStart:55}),[]);
});
