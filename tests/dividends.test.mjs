import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,project,incomeTaxDetails,incomeTax} from '../dist/engine.js';
const near=(a,b,tol=.02)=>assert.ok(Math.abs(a-b)<tol,a+' != '+b);
function scenario(overrides={}){
 const s=structuredClone(DEFAULTS);Object.assign(s,{age:60,retire:60,death:60,inflation:0,equity:7,bond:4,yield:2,annualRrspWithdrawal:0,expenses:0,workIncome:0,retiredIncome:0,nonregGainPercent:0},overrides);
 for(const a of Object.values(s.accounts)){a.balance=0;a.saving=0;a.equity=100;}s.accounts.nonreg.balance=100000;return s;
}
test('eligible cash grosses up 38%, with federal 15.0198% and Ontario 10% non-refundable credits',()=>{
 const d=incomeTaxDetails(100000,'ON',1,40,0,0,1000);
 near(d.taxableIncome,101380);near(d.taxableEligibleDividends,1380);
 near(d.federalDividendCredit,207.27324);near(d.ontarioDividendCredit,138);
 // At this income: gross-up * (20.5% federal + 9.15% Ontario * 1.2 surtax), minus credits.
 near(d.totalTax-incomeTax(100000,'ON'),89.15076);
 near(d.federalTax,14468.35176);near(d.provincialTax,7141.3534);
});
test('Ontario dividend credit follows surtax and precedes the basic tax reduction',()=>{
 const d=incomeTaxDetails(21620,'ON',1,40,0,0,1000);
 // ON basic = (23000-12989)*5.05% = 505.5555; minus 138 credit = 367.5555.
 // Reduction = 600-367.5555 = 232.4445, then add 180 health premium.
 near(d.taxableIncome,23000);near(d.provincialTax,315.111);near(d.federalTax,709.44676);
});
test('unused dividend credits never create refunds or offset health premium or OAS recovery',()=>{
 const d=incomeTaxDetails(0,'ON',1,40,0,0,50000);
 near(d.taxableIncome,69000);near(d.federalTax,0);near(d.provincialTax,600);near(d.totalTax,600);
 const zero=incomeTaxDetails(0,'ON',1,40,0,0,1000);near(zero.totalTax,0);
 const oas=incomeTaxDetails(100000,'ON',1,65,0,9000,1000);near(oas.oasRecoveryTax,908.55);
 near(oas.taxableIncome,101380-908.55);assert.ok(oas.totalTax>=oas.oasRecoveryTax);
});
test('credits scale with cash, not indexed bracket dollars, and unimplemented province credits are rejected',()=>{
 const a=incomeTaxDetails(100000,'ON',1,40,0,0,1000),b=incomeTaxDetails(200000,'ON',2,40,0,0,2000);
 near(b.totalTax,a.totalTax*2);near(b.federalDividendCredit,a.federalDividendCredit*2);near(b.ontarioDividendCredit,276);
 assert.throws(()=>incomeTaxDetails(50000,'BC',1,40,0,0,1000),/Ontario only/);
});
test('natural equity distributions cover spending before capital sales, split half eligible and half foreign',()=>{
 const [r]=project(scenario({expenses:2000}));
 near(r.distributionCash,2000);near(r.equityDistributions,2000);near(r.eligibleDividends,1000);near(r.foreignDistributions,1000);near(r.bondInterest,0);
 near(r.taxableIncome,2380);near(r.nonregWithdrawal,0);near(r.withdrawals,0);near(r.tax,0);near(r.shortfall,0);
 near(r.nonreg,105000);near(r.acb,100000);near(r.growth,7000);
});
test('retained holdings generate distributions: the sale solver accounts for the income lost on sold capital',()=>{
 const [r]=project(scenario({expenses:10000}));
 // sale + (100000-sale)*2% = 10000, with personal credits covering the small taxable income.
 const sale=8000/.98;near(r.nonregWithdrawal,sale);near(r.distributionCash,(100000-sale)*.02);
 near(r.distributionCash+r.withdrawals,10000);near(r.nonreg,(100000-sale)*1.05);near(r.acb,100000-sale);
});
test('capital gains, dividend credit and tax top-up solve together rather than triggering extra registered draws',()=>{
 const s=scenario({expenses:50000,annualRrspWithdrawal:20000,retiredIncome:100000,nonregGainPercent:30});s.accounts.rrsp.balance=100000;
 const [r]=project(s);near(r.rrspWithdrawal,20000);near(r.nonregCostBasisSold,r.nonregWithdrawal*.7);
 near(r.taxableCapitalGains,r.nonregWithdrawal*.15);near(r.distributionCash,(100000-r.nonregWithdrawal)*.02);
 const expected=incomeTaxDetails(120000+r.foreignDistributions+r.taxableCapitalGains,'ON',1,60,0,0,r.eligibleDividends);
 near(r.tax,expected.totalTax-incomeTax(100000,'ON',1,60));near(r.withdrawals+r.distributionCash-r.tax,r.expenses);near(r.shortfall,0);
});
test('unused distributions are reinvested at year-end once; total return and ACB do not count gross-up as cash',()=>{
 const [r]=project(scenario());near(r.growth,7000);near(r.distributionCash,2000);near(r.cashReinvestment,2000);
 near(r.nonreg,107000);near(r.acb,102000);near(r.taxableEligibleDividends,1380);
 const s=scenario({age:59,retire:60,death:60,workIncome:100000});s.accounts.nonreg.saving=5000;
 const [work]=project(s);near(work.nonreg,112000);near(work.acb,107000);near(work.externalTaxPaid,work.tax);near(work.withdrawals,0);
});
test('bond cash interest stays ordinary and total return is not counted again as price growth',()=>{
 const s=scenario({expenses:4000});s.accounts.nonreg.equity=0;const [r]=project(s);
 near(r.bondInterest,4000);near(r.eligibleDividends,0);near(r.taxableIncome,4000);near(r.nonreg,100000);near(r.growth,4000);near(r.withdrawals,0);
 const falling=scenario({bond:-5});falling.accounts.nonreg.equity=0;const [loss]=project(falling);
 near(loss.distributionCash,0);near(loss.nonreg,95000);near(loss.acb,100000);
});
test('depletion stops distributions and never sells beyond available capital',()=>{
 const s=scenario({expenses:200000,death:61,retiredIncome:100000});const [first,next]=project(s);
 near(first.nonregWithdrawal,100000);near(first.distributionCash,0);near(first.nonreg,0);near(first.acb,0);assert.ok(first.shortfall>0);
 near(next.distributionCash,0);near(next.withdrawals,0);
});
