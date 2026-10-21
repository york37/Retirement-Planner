// All time-series charts share the same retirement range and five-year age ticks.
export function retirementTimeline(rows,retirementAge){
 const data=rows.filter(row=>row.age>=retirementAge);
 const ticks=data.flatMap((row,i)=>(row.age-retirementAge)%5===0?[i]:[]);
 return {data,ticks};
}
export function timelineWidth(availableWidth,tickCount){
 return Math.max(280,Math.round(availableWidth)||900,110+Math.max(0,tickCount-1)*64);
}
export function realAnnualTax(row,state){
 return row.totalIncomeTax/(1+state.inflation/100)**(row.age-state.age+1);
}
