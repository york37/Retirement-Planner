// Shared display metadata and source selection keep the graph, table and CSV consistent.
export const ACCOUNT_DISPLAY={
 rrsp:{name:'RRSP / RRIF',short:'RRSP',colour:'#8765ad',withdrawal:'rrspWithdrawal'},
 nonreg:{name:'Non-registered',short:'Non-reg.',colour:'#bd8841',withdrawal:'nonregWithdrawal'},
 tfsa:{name:'TFSA',short:'TFSA',colour:'#338779',withdrawal:'tfsaWithdrawal'}
};
export function withdrawalAmounts(row){
 return Object.fromEntries(Object.entries(ACCOUNT_DISPLAY).map(([key,account])=>[key,row[account.withdrawal]??0]));
}
export function withdrawalSources(row){
 return Object.entries(withdrawalAmounts(row)).filter(([,amount])=>amount>=.005).map(([key])=>key);
}
