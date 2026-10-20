import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,PROVINCES,project,incomeTax,incomeTaxDetails,progressive,rrifFactor,ratesFor,validate} from '../dist/engine.js';
const near=(a,b,tol=.02)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function scenario(overrides={}){const s=structuredClone(DEFAULTS);Object.assign(s,{annualRrspWithdrawal:0,age:40,retire:41,death:41,mode:'custom',equity:0,bond:0,inflation:0,expenses:0,workIncome:0,retiredIncome:0,yield:0,acb:0},overrides);for(const k of Object.keys(s.accounts))s.accounts[k]={balance:0,saving:0,equity:100};return s;}
test('progressive rates apply only to the corresponding slice',()=>near(progressive(150,[100],[.1,.2]),20));
test('TFSA compounding and year-end savings; no contribution in retirement',()=>{const s=scenario({retire:42,death:42,equity:10});s.accounts.tfsa={balance:1000,saving:100,equity:100};const r=project(s);near(r[0].tfsa,1200);near(r[1].tfsa,1420);near(r[2].tfsa,1562);assert.equal(r[2].savings,0);r.forEach(x=>near(x.tax,0));});
test('retirement living expense is paid BEFORE growth; final year inclusive',()=>{const s=scenario({age:65,retire:65,death:65,equity:10,expenses:100});s.accounts.tfsa.balance=1000;const r=project(s);assert.equal(r.length,1);near(r[0].tfsa,990);near(r[0].growth,90);});
test('inflation deflates year-end values using t+1; spending inflated from today',()=>{const s=scenario({age:64,retire:65,death:66,inflation:10,expenses:100});s.accounts.tfsa.balance=1000;const r=project(s);near(r[0].realLedger,1000/1.1);near(r[1].expenses,110);near(r[2].expenses,121);near(r[2].realLedger,769/1.1**3);});
test('fixed RRSP payment uses progressive final tax rather than withholding',()=>{const s=scenario({age:65,retire:65,death:65,expenses:40000,annualRrspWithdrawal:60000});s.accounts.rrsp.balance=200000;const [r]=project(s);near(r.rrspWithdrawal,60000);near(r.tax,incomeTax(60000,'ON',1,65));near(r.rrsp,140000);near(r.cashReinvestment,60000-r.tax-40000);near(r.taxPaid,r.tax);near(r.ledger,200000-40000-r.tax);});
test('non-registered withdrawals return principal tax-free',()=>{const s=scenario({age:65,retire:65,death:65,expenses:50000,acb:100000});s.accounts.nonreg.balance=100000;const [r]=project(s);near(r.tax,0);near(r.acb,50000);near(r.nonreg,50000);});
test('capital gains use proportional ACB and 50% inclusion; extra sales fund taxes',()=>{const s=scenario({age:60,retire:60,death:60,expenses:40000,acb:50000,retiredIncome:100000});s.accounts.nonreg.balance=100000;const [r]=project(s);near(r.withdrawals-r.tax,40000);near(r.acb,r.nonreg*.5);near(r.tax,incomeTax(100000+r.withdrawals*.25,'ON',1,60)-incomeTax(100000,'ON',1,60));});
test('interest and foreign distributions taxed annually and reinvestment adds to ACB',()=>{const s=scenario({age:40,retire:41,death:41,bond:10,workIncome:100000,acb:100000});s.accounts.nonreg={balance:100000,saving:0,equity:0};const [r]=project(s);near(r.growth,10000);near(r.tax,incomeTax(110000,'ON')-incomeTax(100000,'ON'));near(r.taxPaid,r.tax);near(r.nonreg,110000);near(r.acb,r.nonreg);near(r.withdrawals,0);near(r.externalTaxPaid,r.tax);});
test('unrealized gains do not trigger annual tax or change cost basis',()=>{const s=scenario({equity:10,workIncome:100000,acb:100000});s.accounts.nonreg.balance=100000;const [r]=project(s);near(r.tax,0);near(r.ledger,110000);near(r.acb,100000);});
test('RRIF minimum at 72, excess net cash reinvested into non-registered assets',()=>{const s=scenario({age:71,retire:71,death:72});s.accounts.rrsp.balance=100000;const r=project(s);near(r[0].rrif,0);near(r[1].rrif,5400);near(r[1].rrsp,94600);near(r[1].nonreg+r[1].tax,5400);near(rrifFactor(95),.2);near(rrifFactor(120),.2);});
test('registered contributions after age 71 redirect to non-registered',()=>{const s=scenario({age:72,retire:73,death:73});s.accounts.rrsp.saving=1000;const [r]=project(s);near(r.rrsp,0);near(r.nonreg,1000);});
test('losses offset capital gains only, carry forward and avoid ordinary-income refunds',()=>{const s=scenario({age:60,retire:60,death:61,expenses:10000,workIncome:100000,retiredIncome:100000,acb:200000});s.accounts.nonreg.balance=100000;const r=project(s);near(r[0].tax,0);near(r[0].capitalLoss,10000);near(r[1].capitalLoss,20000);});
test('depletion reports unfunded spending without negative balances',()=>{const s=scenario({age:65,retire:65,death:66,expenses:1000});s.accounts.tfsa.balance=400;const r=project(s);near(r[0].shortfall,600);near(r[1].shortfall,1000);r.forEach(x=>near(x.ledger,0));});
test('TFSA growth and withdrawals incur no annual tax and balances deflate with inflation',()=>{const s=scenario({inflation:3,equity:6,expenses:100});s.accounts.tfsa.balance=10000;for(const [i,r] of project(s).entries()){near(r.tax,0);near(r.ledger,r.tfsa);near(r.realLedger,r.ledger/1.03**(i+1));}});
test('RRSP deduction savings are reported externally and never added to assets',()=>{const s=scenario({workIncome:100000});s.accounts.rrsp.saving=10000;const [r]=project(s);near(r.ledger,10000);near(r.refund,incomeTax(100000,'ON')-incomeTax(90000,'ON'));assert.ok(r.refund>0);});
test('Ontario health premium, surtax and basic reduction; Quebec abatement; BC updated annual rate',()=>{near(incomeTax(20000,'ON'),(20000-16452)*.14+2*(20000-12989)*.0505-600);const federal=(50000-16452)*.14;const bc=50000*.056-13216*.056;near(incomeTax(50000,'BC'),federal+bc);near(incomeTax(50000,'QC'),federal*.835+(50000-18952)*.14);assert.ok(incomeTax(250000,'ON')>incomeTax(200000,'ON'));});
test('all provinces produce finite monotone tax around bracket boundaries',()=>{for(const code of Object.keys(PROVINCES)){for(const age of [40,75]){let prev=0;for(let n=0;n<=400000;n+=500){const tax=incomeTax(n,code,1,age);assert.ok(Number.isFinite(tax)&&tax>=prev-1e-6,`${code}, ${age}, ${n}`);prev=tax;}}}});
test('historical real returns convert geometrically, custom overrides retained',()=>{near(ratesFor(DEFAULTS).equity,.07304,1e-10);near(ratesFor(DEFAULTS).bond,.0404,1e-10);near(ratesFor({...DEFAULTS,mode:'custom',equity:8}).equity,.08,1e-10);});
test('full default scenario tax cash reconciles and all outputs stay finite',()=>{const r=project(DEFAULTS);assert.equal(r.length,45);assert.equal(r[0].year,2026);assert.equal(r.at(-1).age,90);for(const row of r){near(row.tax,row.taxPaid+row.unpaidTax);near(row.ledger,row.tfsa+row.rrsp+row.nonreg);for(const v of Object.values(row))assert.ok(typeof v!=='number'||Number.isFinite(v));}});
test('invalid timelines, NaN and invalid allocations are rejected',()=>{assert.ok(validate({...DEFAULTS,retire:30}).length);assert.throws(()=>project({...DEFAULTS,age:NaN}));const s=structuredClone(DEFAULTS);s.accounts.tfsa.equity=110;assert.throws(()=>project(s));});
test('verified CRA 2026 Ontario brackets and rates are pinned',()=>{
 assert.deepEqual(PROVINCES.ON.limits,[53891,107785,150000,220000]);
 assert.deepEqual(PROVINCES.ON.rates,[.0505,.0915,.1116,.1216,.1316]);
 assert.equal(PROVINCES.ON.bpa,12989);assert.equal(PROVINCES.ON.age,6342);assert.equal(PROVINCES.ON.ageStart,47210);assert.equal(PROVINCES.ON.pension,1796);
});
test('2026 federal/Ontario tax at $50,000 agrees with independently calculated bracket tax and credits',()=>{
 const d=incomeTaxDetails(50000,'ON',1,40);
 near(d.federalTax,4696.72);near(d.provincialTax,2469.0555);near(d.totalTax,7165.7755);
 near(d.effectiveTaxRate,.14331551,1e-10);
});
test('2026 federal/Ontario tax at $100,000 includes the 20% Ontario surtax tier',()=>{
 const d=incomeTaxDetails(100000,'ON',1,40);
 near(d.federalTax,14392.725);near(d.provincialTax,7127.8294);near(d.totalTax,21520.5544);
 near(d.effectiveTaxRate,.215205544,1e-10);
});
test('effective rate is undefined without taxable income and zero for income sheltered by credits',()=>{
 assert.equal(incomeTaxDetails(0).effectiveTaxRate,null);
 assert.equal(incomeTaxDetails(10000).effectiveTaxRate,0);
});
test('annual effective rate includes other taxable income but does not tax TFSA withdrawals',()=>{
 const s=scenario({age:60,retire:60,death:60,expenses:5000,retiredIncome:100000});s.accounts.tfsa.balance=10000;
 const [r]=project(s);near(r.taxableIncome,100000);near(r.totalIncomeTax,21520.5544);near(r.effectiveTaxRate,.215205544,1e-10);near(r.tax,0);near(r.tfsa,5000);
});
test('RRSP withdrawals and only 50% of net capital gains enter the effective-rate denominator',()=>{
 const s=scenario({age:60,retire:60,death:60,expenses:40000,retiredIncome:100000,acb:50000});s.accounts.nonreg.balance=100000;
 const [r]=project(s);near(r.taxableIncome,100000+r.withdrawals*.25);near(r.totalIncomeTax,r.federalIncomeTax+r.provincialIncomeTax);near(r.effectiveTaxRate,r.totalIncomeTax/r.taxableIncome,1e-10);near(r.tax,r.totalIncomeTax-incomeTax(100000,'ON',1,60));
 const registered=scenario({age:60,retire:60,death:60,expenses:40000,retiredIncome:100000});registered.accounts.rrsp.balance=100000;
 const [rrsp]=project(registered);near(rrsp.taxableIncome,100000+rrsp.withdrawals);near(rrsp.effectiveTaxRate,rrsp.totalIncomeTax/rrsp.taxableIncome,1e-10);
});
test('consuming carried-forward losses does not change the reported tax after year-end',()=>{
 const s=scenario({age:55,retire:55,death:75,equity:10,expenses:1000,retiredIncome:100000,acb:120000});s.accounts.nonreg.balance=100000;
 const rows=project(s);assert.ok(rows.some(r=>r.capitalLoss>0));assert.equal(rows.at(-1).capitalLoss,0);
 for(const r of rows){near(r.tax,r.taxPaid+r.unpaidTax);near(r.tax,Math.max(0,r.totalIncomeTax-incomeTax(100000,'ON',1,r.age)));near(r.growth,Object.values(r.growthByAccount).reduce((sum,x)=>sum+x,0));}
});
test('every projected effective rate reconciles to annual federal and Ontario tax',()=>{
 for(const r of project(DEFAULTS)){near(r.totalIncomeTax,r.federalIncomeTax+r.provincialIncomeTax);if(r.taxableIncome>0)near(r.effectiveTaxRate,r.totalIncomeTax/r.taxableIncome,1e-12);else assert.equal(r.effectiveTaxRate,null);}
});
