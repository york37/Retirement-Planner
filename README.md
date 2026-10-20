# Northstar Canadian Retirement Planner

Open **Northstar.html** directly in a modern browser. No installation, network service or external assets are required. Sources live in dist/. Regenerate the standalone file with node build-standalone.mjs. Run node --test tests/*.test.mjs for the financial and interface checks.

Ontario residency is fixed. Inputs include ages, balances and annual savings for TFSA/RRSP/non-registered accounts, equity/bond weights, retirement expenses, a manual annual RRSP withdrawal, inflation, nominal returns, pension/start age, CPP/OAS and other taxable-income context. All inputs save in browser localStorage on this device; nothing is sent to a server. Reset clears saved inputs and restores defaults. Saved inputs take precedence over defaults; older saves receive defaults for new fields. Cookies are not used. Browser restrictions, cleared site data or moving the HTML file can prevent restoration.

Defaults: current age 46, retirement 65, plan until 90, inflation 2%, equity total return 7.304%, bond total return 4.04%, equity distribution yield 2%, annual RRSP withdrawal $50,000, initial non-registered gain share 30%. Dollar inputs use commas and $1,000 arrow controls.

## Withdrawals and annual cash flow

The entered RRSP amount is a **fixed nominal gross annual payment**, starting at retirement and capped by available registered assets. Zero disables voluntary registered draws. RRSP converts internally at end of age 71 with no taxable cash payment. Minimum RRIF withdrawals begin at 72, including while working. The registered payment is the larger of the manual amount and the required minimum, never their sum.

Pension/CPP/OAS, the scheduled registered payment and non-registered cash distributions cover spending and incremental tax. Non-registered capital sales fill any remaining gap, followed by TFSA. The solver includes capital-gains tax and the distributions lost when capital is sold. It never increases the manual registered payment to cover depleted other accounts; the app reports unmet spending/unpaid tax. Excess cash is reinvested in non-registered assets at year-end.

Capital sales occur before growth. Annual distributions are based on the retained non-registered balance after sales and are available for the same year's budget as an annual approximation; monthly timing is not modeled. Total non-registered return includes cash distributions: only total return minus those cash distributions stays invested as price appreciation. Surplus cash and savings are added at year-end. There are no discretionary sales before retirement; working-year investment taxes remain external so entered net savings are preserved. Required RRIF payments are the exception after 71.

## Taxable-account income

Half of non-registered equity distributions are assumed Canadian eligible dividends and half foreign ordinary income. Positive bond returns are cash interest; negative bond returns are price losses. Eligible cash dividends are grossed up 38%, with federal credit of 15.0198% and Ontario credit of 10% of the grossed-up amount. Ontario's credit follows surtax and precedes the basic tax reduction. Credits are non-refundable and cannot offset health premium or OAS recovery. The gross-up affects age credits and OAS recovery. Table/CSV credits show entitlement; usable amounts may be lower. The 50% eligible share is an explicit portfolio assumption, not an eligibility determination.

Initial non-registered cost basis is balance × (1 − gain percentage / 100), defaulting to 70% principal and 30% gain. Sales remove proportional cost basis. Only 50% of net realized gains enters income; capital losses offset gains and carry forward. Reinvested cash/contributions increase cost basis; distributions consumed for spending/tax do not. Dividend gross-up is never cash or cost basis.

The tax baseline uses 2026 federal/Ontario brackets, personal/age/pension credits, federal BPA taper, Ontario surtax/reduction and health premium. OAS recovery uses 15% above $95,323, capped at gross OAS, with its deduction and same-year settlement. Indexation uniformly follows the inflation option; future legislation is not forecast. Other-income context sets tax brackets but stays outside spending cash. Only incremental benefit/investment tax is funded by plan cash; total annual payable/effective rate includes context income. Refundable benefits, CPP/EI, AMT, foreign withholding/credits, fees and final estate/deemed-disposition taxes are outside scope. Contribution room is not enforced.

Pension, CPP/OAS and expenses are entered in today's dollars and inflation-indexed through the inclusive final year. Pension begins at the entered age; CPP/OAS begin at 65. Pension is an eligible lifetime employer pension; CPP/OAS do not receive pension credits. Early/late adjustments, eligibility and age-75 OAS increases are not estimated. All ages are measured at January 1, beginning in 2026.

## Outputs and research

Graphs show year-end nominal/real balances and annual effective tax rate or payable amounts from retirement, with five-year age labels. Real end balances divide by (1 + inflation)^(years since 2026 + 1). Withdrawal tracks distinguish registered (purple), non-registered capital (amber), TFSA (teal); cash distributions appear separately. Table/CSV retain all years, account balances, cash flows, realized gains and tax details. Effective rate = total annual federal/Ontario/OAS tax ÷ modeled taxable income, including the dividend gross-up. A dash means no taxable income.

Historical defaults use the 1900–2019 global real geometric returns (5.2% equity, 2.0% bonds) published by London Business School with the 2020 Yearbook, converted using 2% inflation. They are editable benchmarks, not nominal CAD forecasts. Constant returns omit sequence risk and volatility.

Dividend rules checked October 19, 2026; baseline brackets/credits checked October 18, 2026. Primary references are linked in the app, including [CRA T5 dividend gross-up and credit](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/completing-slips-summaries/financial-slips-summaries/return-investment-income-t5/t5-slip/completing-t5-slip.html), [CRA ON428 calculation order](https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/5006-c/5006-c-25e.pdf) and [Ontario eligible dividend credit](https://www.ontario.ca/page/ontario-dividend-tax-credit).
