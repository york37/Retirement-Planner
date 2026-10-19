import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDollarValue,parseDollarValue,stepDollarValue} from '../dist/money-inputs.js';
test('dollar fields format thousands separators without losing cents or in-progress decimals',()=>{
 for(const [input,expected] of [['90000','90,000'],['1250000.50','1,250,000.50'],['1234.','1,234.'],['0','0'],['','']])assert.equal(formatDollarValue(input),expected);
});
test('formatted and legacy unformatted saved amounts parse to the same calculation values',()=>{
 for(const value of ['1,234,567.50','1234567.50'])assert.equal(parseDollarValue(value),1234567.5);
 assert.equal(parseDollarValue('0'),0);
 for(const invalid of ['', ' ', 'abc', '1.2.3'])assert.ok(Number.isNaN(parseDollarValue(invalid)));
});
test('dollar arrows move exactly $1,000 and respect non-negative and maximum bounds',()=>{
 assert.equal(stepDollarValue('90,000',1),91000);
 assert.equal(stepDollarValue('90,000',-1),89000);
 assert.equal(stepDollarValue('12,345.67',1),13345.67);
 assert.equal(stepDollarValue('500',-1),0);
 assert.equal(stepDollarValue('99,500',1,0,100000),100000);
 assert.equal(stepDollarValue('',1),1000);
});
test('comma formatting round trips zero, account-sized balances and decimal expenses',()=>{
 for(const amount of [0,1000,90000,250000,10000000000,12345.67])assert.equal(parseDollarValue(formatDollarValue(amount)),amount);
});
