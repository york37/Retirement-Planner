// 2026 annual tax rates, reverified against CRA and Ontario sources on 2026-10-18.
// Federal/Ontario brackets, credits, surtax and health premium sources are linked in the app.
export const PROVINCES={
 ON:{name:'Ontario',bpa:12989,limits:[53891,107785,150000,220000],rates:[.0505,.0915,.1116,.1216,.1316],age:6342,ageStart:47210,pension:1796},
 BC:{name:'British Columbia',bpa:13216,limits:[50363,100728,115648,140430,190405,265545],rates:[.056,.077,.105,.1229,.147,.168,.205]},
 AB:{name:'Alberta',bpa:22769,limits:[61200,154259,185111,246813,370220],rates:[.08,.10,.12,.13,.14,.15]},
 QC:{name:'Quebec',bpa:18952,limits:[54345,108680,132245],rates:[.14,.19,.24,.2575]},
 MB:{name:'Manitoba',bpa:15780,limits:[47000,100000],rates:[.108,.1275,.174]},
 NB:{name:'New Brunswick',bpa:13664,limits:[52333,104666,193861],rates:[.094,.14,.16,.195]},
 NL:{name:'Newfoundland & Labrador',bpa:11188,limits:[44678,89354,159528,223340,285319,570638,1141275],rates:[.087,.145,.158,.178,.198,.208,.213,.218]},
 NS:{name:'Nova Scotia',bpa:11932,limits:[30995,61991,97417,157124],rates:[.0879,.1495,.1667,.175,.21]},
 PE:{name:'Prince Edward Island',bpa:15000,limits:[33928,65820,106890,142520,200000],rates:[.095,.1347,.166,.1762,.19,.20]},
 SK:{name:'Saskatchewan',bpa:20381,limits:[54532,155805],rates:[.105,.125,.145]},
 NT:{name:'Northwest Territories',bpa:18198,limits:[53003,106009,172346],rates:[.059,.086,.122,.1405]},
 NU:{name:'Nunavut',bpa:19659,limits:[55801,111602,181439],rates:[.04,.07,.09,.115]},
 YT:{name:'Yukon',bpa:16452,limits:[58523,117045,181440,500000],rates:[.064,.09,.109,.128,.15]}
};
const positive=x=>Math.max(0,x);
export function progressive(income,limits,rates){let tax=0,low=0; for(let i=0;i<rates.length;i++){const high=limits[i]??Infinity;tax+=positive(Math.min(income,high)-low)*rates[i];low=high;}return tax;}
// OAS recovery is deductible from income and added to total payable. Other income is tax context.
// income excludes eligible-dividend cash; the last argument is actual eligible cash dividends.
export function incomeTaxDetails(income,province='ON',index=1,age=40,pension=0,oas=0,eligibleDividends=0){
 if(eligibleDividends>0&&province!=='ON')throw new Error('Eligible dividend credits are modeled for Ontario only.');
 const taxableEligibleDividends=positive(eligibleDividends)*1.38;
 income+=taxableEligibleDividends;
 const federalDividendCredit=taxableEligibleDividends*.150198,ontarioDividendCredit=taxableEligibleDividends*.10;
 const oasRecoveryTax=Math.min(positive(oas),.15*positive(income-95323*index));
 const taxableIncome=positive(income-oasRecoveryTax),n=taxableIncome/index,p=PROVINCES[province];
 const bpa=16452-Math.min(1623,positive(n-181440)*1623/77042);
 const senior=age>=65?positive(9208-.15*positive(n-46432)):0;
 let federal=positive(progressive(n,[58523,117045,181440,258482],[.14,.205,.26,.29,.33])-.14*(bpa+senior+Math.min(2000,positive(pension/index))));
 if(province==='QC')federal*=.835;
 const federalDividendCreditUsed=Math.min(federal*index,federalDividendCredit);
 federal=positive(federal-federalDividendCredit/index);
 let provincialBpa=p.bpa;
 if(province==='MB')provincialBpa*=Math.max(0,1-positive(n-200000)/200000);
 if(province==='YT')provincialBpa=bpa;
 let credits=provincialBpa;
 if(province==='ON'){if(age>=65)credits+=positive(p.age-.15*positive(n-p.ageStart));credits+=Math.min(p.pension,positive(pension/index));}
 let provincial=positive(progressive(n,p.limits,p.rates)-p.rates[0]*credits);
 if(province==='ON'){
  const surtax=.2*positive(provincial-5818)+.36*positive(provincial-7446);
  provincial+=surtax;
  // ON428: dividend credit follows surtax and precedes the Ontario tax reduction.
  provincial=positive(provincial-ontarioDividendCredit/index);
  provincial-=Math.min(provincial,positive(600-provincial));
  const health=n<=20000?0:n<=36000?Math.min(300,.06*(n-20000)):n<=48000?Math.min(450,300+.06*(n-36000)):n<=72000?Math.min(600,450+.25*(n-48000)):n<=200000?Math.min(750,600+.25*(n-72000)):Math.min(900,750+.25*(n-200000));
  provincial+=health;
 }
 if(province==='BC')provincial-=Math.min(provincial,positive(690-.0356*positive(n-25570)));
 const federalTax=federal*index,provincialTax=provincial*index,totalTax=federalTax+provincialTax+oasRecoveryTax;
 return {taxableIncome,taxableEligibleDividends,federalDividendCredit,federalDividendCreditUsed,ontarioDividendCredit:province==='ON'?ontarioDividendCredit:0,federalTax,provincialTax,oasRecoveryTax,totalTax,effectiveTaxRate:taxableIncome>0?totalTax/taxableIncome:null};
}
export function incomeTax(income,province='ON',index=1,age=40,pension=0,oas=0,eligibleDividends=0){return incomeTaxDetails(income,province,index,age,pension,oas,eligibleDividends).totalTax;}
export function initialNonregCostBasis(balance,gainPercent){return balance*(1-gainPercent/100);}
function resolveCapitalAssumptions(s){
 const nonregGainPercent=s.nonregGainPercent??DEFAULTS.nonregGainPercent;
 // Explicit ACB remains available to model fixtures and portfolios with an initial capital loss.
 return {...s,nonregGainPercent,annualRrspWithdrawal:s.annualRrspWithdrawal??DEFAULTS.annualRrspWithdrawal,acb:s.acb??initialNonregCostBasis(s.accounts.nonreg.balance,nonregGainPercent)};
}
export const DEFAULTS={age:46,retire:65,death:90,province:'ON',inflation:2,mode:'custom',equity:7.304,bond:4.04,yield:2,nonregGainPercent:30,expenses:48000,workIncome:100000,retiredIncome:0,pensionIncome:0,pensionStart:65,cppIncome:0,oasIncome:0,indexTax:true,annualRrspWithdrawal:50000,accounts:{tfsa:{balance:90000,saving:7000,equity:80},rrsp:{balance:250000,saving:15000,equity:70},nonreg:{balance:100000,saving:5000,equity:60}}};
export function ratesFor(s){return s.mode==='historical'?{equity:(1.052*(1+s.inflation/100)-1),bond:(1.02*(1+s.inflation/100)-1)}:{equity:s.equity/100,bond:s.bond/100};}
export function validate(s){s=resolveCapitalAssumptions(s);const errors=[];if(!Number.isFinite(s.annualRrspWithdrawal)||s.annualRrspWithdrawal<0||s.annualRrspWithdrawal>1e10)errors.push('Annual RRSP withdrawal must be between $0 and $10 billion.');if(!Number.isFinite(s.nonregGainPercent)||s.nonregGainPercent<0||s.nonregGainPercent>100)errors.push('Starting non-registered capital gain must be between 0% and 100%.');if(!Number.isInteger(s.age)||s.age<18||s.age>110)errors.push('Current age must be a whole number from 18 to 110.');if(!Number.isInteger(s.retire)||s.retire<s.age||s.retire>110)errors.push('Retirement age must be at least your current age and at most 110.');if(!Number.isInteger(s.death)||s.death<s.retire||s.death>120)errors.push('Planning age must be at least retirement age and at most 120.');if(!Number.isInteger(s.pensionStart)||s.pensionStart<18||s.pensionStart>120)errors.push('Pension start age must be a whole number from 18 to 120.');if(!PROVINCES[s.province])errors.push('Select a province or territory.');for(const key of ['inflation','equity','bond','yield','expenses','workIncome','retiredIncome','pensionIncome','cppIncome','oasIncome','acb'])if(!Number.isFinite(s[key]))errors.push('All assumptions must contain finite numbers.');if(s.inflation<0||s.inflation>20)errors.push('Inflation must be between 0% and 20%.');if(s.equity< -50||s.equity>30||s.bond< -50||s.bond>30)errors.push('Returns must be between −50% and 30%.');if(s.yield<0||s.yield>15)errors.push('Equity distribution yield must be between 0% and 15%.');for(const key of ['expenses','workIncome','retiredIncome','pensionIncome','cppIncome','oasIncome','acb'])if(s[key]<0||s[key]>1e10)errors.push('Dollar inputs must be between $0 and $10 billion.');for(const a of Object.values(s.accounts))if(!Number.isFinite(a.balance)||!Number.isFinite(a.saving)||!Number.isFinite(a.equity)||a.balance<0||a.saving<0||a.balance>1e10||a.saving>1e8||a.equity<0||a.equity>100)errors.push('Account balances, savings and allocations must be valid non-negative numbers (equity 0–100%).');return [...new Set(errors)];}
const rrif=[.0528,.054,.0553,.0567,.0582,.0598,.0617,.0636,.0658,.0682,.0708,.0738,.0771,.0808,.0851,.0899,.0955,.1021,.1099,.1192,.1306,.1449,.1634,.1879,.20];
export function rrifFactor(age){return age<71?1/(90-age):rrif[Math.min(24,age-71)];}
const sum=b=>b.tfsa+b.rrsp+b.nonreg;
function simulate(s){
 const rates=ratesFor(s),b=Object.fromEntries(Object.entries(s.accounts).map(([k,a])=>[k,a.balance]));
 let acb=s.acb,loss=0;const rows=[];
 for(let age=s.age;age<=s.death;age++){
  const t=age-s.age,factor=(1+s.inflation/100)**t,endFactor=factor*(1+s.inflation/100),taxIndex=s.indexTax?factor:1,retired=age>=s.retire;
  const base=(retired?s.retiredIncome:s.workIncome)*factor;
  const pensionIncome=age>=s.pensionStart?s.pensionIncome*factor:0,cppIncome=age>=65?s.cppIncome*factor:0,oasIncome=age>=65?s.oasIncome*factor:0;
  const benefitIncome=pensionIncome+cppIncome+oasIncome,contribution=!retired&&age<=71?s.accounts.rrsp.saving:0;
  const adjustedBase=positive(base-contribution),incomeBase=positive(base+benefitIncome-contribution);
  const contextTax=incomeTax(adjustedBase,s.province,taxIndex,age,0);
  const expenses=retired?s.expenses*factor:0;
  const minimum=age>=72?b.rrsp*rrifFactor(age):0,scheduledRrspWithdrawal=retired?s.annualRrspWithdrawal:0;
  // The manual amount is a gross, fixed nominal payment, not a taxable-income guide.
  const rrspDraw=Math.min(b.rrsp,Math.max(scheduledRrspWithdrawal,minimum));
  b.rrsp-=rrspDraw;
  const pension=pensionIncome+(age>=72?rrspDraw:0);
  const openingNonreg=b.nonreg,openingAcb=acb,w=s.accounts.nonreg.equity/100;
  // Returns already include cash income. Only price return stays in the taxable account.
  // Annual approximation: capital sales occur first; distributions accrue on the retained balance.
  const equityCashRate=w*s.yield/100,interestRate=(1-w)*positive(rates.bond);
  function preview(sale){
   const cost=openingNonreg>0?openingAcb*sale/openingNonreg:0,gains=sale-cost,remaining=positive(openingNonreg-sale);
   const equityDistributions=remaining*equityCashRate,eligibleDividends=equityDistributions*.5,foreignDistributions=equityDistributions*.5,bondInterest=remaining*interestRate;
   const taxableCapitalGains=.5*positive(gains-loss);
   const details=incomeTaxDetails(incomeBase+rrspDraw+foreignDistributions+bondInterest+taxableCapitalGains,s.province,taxIndex,age,pension,oasIncome,eligibleDividends);
   const tax=positive(details.totalTax-contextTax),distributionCash=equityDistributions+bondInterest;
   return {cost,gains,equityDistributions,eligibleDividends,foreignDistributions,bondInterest,taxableCapitalGains,details,tax,distributionCash,net:benefitIncome+rrspDraw+sale+distributionCash-tax};
  }
  let nonregSale=0,tfsaSale=0,p=preview(0);
  if(retired&&p.net<expenses){
   nonregSale=openingNonreg;
   if(preview(nonregSale).net>=expenses){
    let lo=0,hi=nonregSale;
    // This solves sale proceeds, changing distributions and capital-gains tax together.
    for(let j=0;j<60;j++){const mid=(lo+hi)/2;if(preview(mid).net<expenses)lo=mid;else hi=mid;}
    nonregSale=hi;
   }
   p=preview(nonregSale);
   tfsaSale=Math.min(b.tfsa,positive(expenses-p.net));
  }
  b.nonreg-=nonregSale;acb-=p.cost;b.tfsa-=tfsaSale;
  const withdrawalsByAccount={rrsp:rrspDraw,nonreg:nonregSale,tfsa:tfsaSale},totalDraw=rrspDraw+nonregSale+tfsaSale;
  const benefitTax=positive(incomeTax(incomeBase,s.province,taxIndex,age,pensionIncome,oasIncome)-contextTax);
  let externalTaxPaid=0;
  if(!retired){
   // Preserve entered net savings: investment-income taxes while working remain external.
   const benefitAndMinimumTax=positive(incomeTax(incomeBase+rrspDraw,s.province,taxIndex,age,pension,oasIncome)-contextTax);
   externalTaxPaid=positive(p.tax-Math.min(p.tax,benefitAndMinimumTax,benefitIncome+rrspDraw));
  }
  const grossCash=benefitIncome+totalDraw+p.distributionCash;
  const portfolioTaxPaid=Math.min(positive(p.tax-externalTaxPaid),grossCash),taxPaid=portfolioTaxPaid+externalTaxPaid;
  const unpaidTax=positive(p.tax-taxPaid),spendable=positive(grossCash-portfolioTaxPaid);
  const shortfall=positive(expenses-spendable),cashReinvestment=positive(spendable-expenses);
  const benefitSurplus=Math.min(cashReinvestment,positive(benefitIncome-benefitTax-expenses));
  const rrifReinvestment=Math.min(positive(cashReinvestment-benefitSurplus),rrspDraw);
  const distributionReinvestment=positive(cashReinvestment-benefitSurplus-rrifReinvestment);
  const growthByAccount={},savingsByAccount={tfsa:0,rrsp:0,nonreg:0};let growth=0;
  for(const k of ['tfsa','rrsp','nonreg']){
   const weight=s.accounts[k].equity/100,returnRate=weight*rates.equity+(1-weight)*rates.bond;
   growthByAccount[k]=b[k]*returnRate;growth+=growthByAccount[k];
   b[k]=positive(b[k]+growthByAccount[k]-(k==='nonreg'?p.distributionCash:0));
  }
  // Apply the user's fixed annual surplus allocation once, after growth and tax.
  // This is a planning allocation cap; personal TFSA contribution room is assumed.
  const tfsaReinvestment=Math.min(14000,cashReinvestment),nonregReinvestment=cashReinvestment-tfsaReinvestment;
  const reinvestmentByAccount={tfsa:tfsaReinvestment,rrsp:0,nonreg:nonregReinvestment};
  b.tfsa+=tfsaReinvestment;b.nonreg+=nonregReinvestment;
  // Only deposits to non-registered investments add to their cost basis.
  acb+=nonregReinvestment;
  let savings=0;
  if(!retired)for(const k of ['tfsa','rrsp','nonreg']){
   const amount=s.accounts[k].saving,destination=k==='rrsp'&&age>71?'nonreg':k;
   b[destination]+=amount;savingsByAccount[destination]+=amount;if(destination==='nonreg')acb+=amount;savings+=amount;
  }
  const ledger=sum(b),taxDetails=p.details;
  loss=positive(loss-p.gains);
  rows.push({year:2026+t,age,retired,scheduledRrspWithdrawal,pensionIncome,cppIncome,oasIncome,benefitIncome,benefitTax,benefitSurplus,
   expenses,savings,growth,tax:p.tax,taxPaid,externalTaxPaid,portfolioTaxPaid,unpaidTax,shortfall,withdrawals:totalDraw,withdrawalsByAccount,
   growthByAccount,savingsByAccount,reinvestmentByAccount,tfsaReinvestment,nonregReinvestment,rrifReinvestment,cashReinvestment,distributionReinvestment,
   rrspWithdrawal:rrspDraw,nonregWithdrawal:nonregSale,tfsaWithdrawal:tfsaSale,rrif:minimum,
   rrspEndBalance:age>=71?0:b.rrsp,rrifEndBalance:age>=71?b.rrsp:0,rrspToRrifTransfer:age===71?b.rrsp:0,
   rrspCashWithdrawal:age<=71?rrspDraw:0,rrifCashWithdrawal:age>=72?rrspDraw:0,
   tfsa:b.tfsa,rrsp:b.rrsp,nonreg:b.nonreg,acb,nonregCostBasisSold:p.cost,realizedCapitalGains:p.gains,taxableCapitalGains:p.taxableCapitalGains,capitalLoss:loss,
   distributionCash:p.distributionCash,equityDistributions:p.equityDistributions,eligibleDividends:p.eligibleDividends,foreignDistributions:p.foreignDistributions,bondInterest:p.bondInterest,
   taxableEligibleDividends:taxDetails.taxableEligibleDividends,federalDividendCredit:taxDetails.federalDividendCredit,ontarioDividendCredit:taxDetails.ontarioDividendCredit,
   ledger,realLedger:ledger/endFactor,realGrowth:growth/endFactor,taxableIncome:taxDetails.taxableIncome,federalIncomeTax:taxDetails.federalTax,provincialIncomeTax:taxDetails.provincialTax,
   oasRecoveryTax:taxDetails.oasRecoveryTax,totalIncomeTax:taxDetails.totalTax,effectiveTaxRate:taxDetails.effectiveTaxRate,
   refund:positive(incomeTax(base+benefitIncome,s.province,taxIndex,age,pensionIncome,oasIncome)-incomeTax(incomeBase,s.province,taxIndex,age,pensionIncome,oasIncome))});
 }
 return rows;
}
export function project(s){s=resolveCapitalAssumptions(s);const errors=validate(s);if(errors.length)throw new Error(errors.join(' '));return simulate(s);}
