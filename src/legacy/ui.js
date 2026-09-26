// src/legacy/ui.js
// ── Legacy Path — interactive app (ported from the approved prototype) ──
// Vanilla DOM module mounted by LegacyAppPage. Paid guide content is NOT in
// this bundle: it arrives in opts.content from Supabase (lp_content_versions,
// RLS: paid rows readable only when has_access()). Without access the user
// gets the screener and plan headlines; everything else shows an unlock card.
// The rules engine is deterministic and education-only: each item states
// which answer triggered it.

const BANDS = [
  { id:"cradle", label:"The Cradle Years", ages:[0,4] },
  { id:"child", label:"The Learning Years", ages:[5,12] },
  { id:"teen", label:"The Teen Years", ages:[13,17] },
  { id:"launch", label:"The Launch Years", ages:[18,24] },
  { id:"foundation", label:"The Foundation Years", ages:[25,34] },
  { id:"build", label:"The Building Years", ages:[35,49] },
  { id:"protect", label:"The Protection Years", ages:[50,64] },
  { id:"legacy", label:"The Legacy Years", ages:[65,120] },
];
const PAID = ["stages","library","estate","insurance","burial"];

export function mountLegacy(root, opts = {}) {
root.innerHTML = shellHtml(opts);
const C = opts.content || null;
const HAS = !!(opts.hasAccess && C);
const $ = (s, el=root) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));


/* ---------- content index: every option the app can point to ---------- */
const IDX = {};
const KIND = { v:"Savings & investing", i:"Insurance", t:"Trust", b:"Estate document", l:"Insurance financing strategy", f:"Funeral payment option" };
if (HAS) {
  C.vehicles.forEach(x => IDX["v:"+x.id] = x);
  C.insurance.policies.forEach(x => IDX["i:"+x.id] = x);
  C.trusts.trusts.forEach(x => IDX["t:"+x.id] = x);
  C.trusts.basics.forEach(x => IDX["b:"+x.id] = x);
  C.leverage.strategies.forEach(x => IDX["l:"+x.id] = x);
  C.funeral.paymentOptions.forEach(x => IDX["f:"+x.id] = x);
}
const optName = key => IDX[key] ? IDX[key].name : key;

/* ---------- screener definition ---------- */
const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const ESTATE_TAX_STATES = ["OR","MA","RI","MN","WA","IL","DC","MD","VT","HI","ME","NY","CT"];
const YN = [["yes","Yes"],["no","No"]];
const YNU = [["yes","Yes"],["no","No"],["unsure","Not sure"]];
const FAITHS = [["christian-catholic","Christian – Catholic"],["christian-protestant","Christian – Protestant / Baptist / AME / Pentecostal / Non-denominational"],["christian-orthodox","Christian – Eastern Orthodox"],["christian-lds","Christian – Latter-day Saints"],["jewish-orthodox","Jewish – Orthodox"],["jewish-conservative","Jewish – Conservative"],["jewish-reform","Jewish – Reform"],["muslim-sunni","Muslim – Sunni"],["muslim-shia","Muslim – Shia"],["secular-humanist","Non-religious / Humanist"],["other","Another faith"],["prefer-not","Prefer not to say"]];
const GOALS = [["home","Buy a home"],["college","Pay for college or trade school"],["business","Start or grow a business"],["retire-early","Retire early"],["inheritance","Leave an inheritance"],["debt-free","Get out of debt"],["credit","Build credit"],["care-parents","Care for aging parents"]];

const STEPS = [
  { title:"Household", intro:"Who you're planning for. Names aren't needed.", fields:[
    {id:"age",label:"Your age",type:"number",min:16,max:110},
    {id:"state",label:"State you live in",type:"select",options:STATES.map(s=>[s,s])},
    {id:"maritalStatus",label:"Relationship status",type:"seg",options:[["single","Single"],["married","Married"],["partnered","Partnered"],["divorced","Divorced"],["widowed","Widowed"]]},
    {id:"spouseAge",label:"Spouse or partner's age",type:"number",min:16,max:110,showIf:d=>["married","partnered"].includes(d.maritalStatus)},
    {id:"children",label:"Children's ages",type:"text",placeholder:"e.g. 2, 7, 15",help:"Separate with commas. Leave blank if none. Include grandchildren you're planning for."},
    {id:"otherDependents",label:"Do you help support an aging parent or another adult?",type:"seg",options:YN},
    {id:"specialNeedsDependent",label:"Does anyone in your family have a disability that may need lifelong support?",type:"seg",options:YN},
    {id:"veteran",label:"Has anyone in your household served in the military?",type:"seg",options:YN},
    {id:"faithTradition",label:"Faith tradition (for funeral planning)",type:"select",options:FAITHS,help:"Only used to show the matching funeral traditions."}
  ]},
  { title:"Money today", intro:"Ranges are fine. Don't enter account numbers or exact balances.", fields:[
    {id:"employment",label:"Work situation",type:"select",options:[["w2","Employee (W-2)"],["self-employed","Self-employed / 1099"],["both","Both"],["retired","Retired"],["unemployed","Between jobs"],["student","Student"]]},
    {id:"incomeRange",label:"Household income per year",type:"select",options:[["u25","Under $25,000"],["25-50","$25,000–$50,000"],["50-75","$50,000–$75,000"],["75-100","$75,000–$100,000"],["100-150","$100,000–$150,000"],["150+","Over $150,000"]]},
    {id:"employerPlan",label:"Retirement plan at work",type:"select",options:[["none","My job doesn't offer one"],["not-enrolled","Offered, not enrolled"],["below-match","Enrolled, below the full match"],["full-match","Enrolled, getting the full match"]],showIf:d=>["w2","both"].includes(d.employment)},
    {id:"emergencyFundMonths",label:"Savings you could reach in a week",type:"select",options:[["0","None"],["lt1","Less than 1 month of bills"],["1-3","1–3 months"],["3-6","3–6 months"],["6+","More than 6 months"]]},
    {id:"highInterestDebt",label:"Credit card or payday-type debt",type:"seg",options:[["none","None"],["some","Some"],["a-lot","A lot"]]},
    {id:"creditScoreRange",label:"Credit score",type:"select",options:[["unknown","I don't know"],["lt580","Below 580"],["580-669","580–669"],["670-739","670–739"],["740+","740 or higher"]]},
    {id:"housing",label:"Housing",type:"seg",options:[["rent","Rent"],["own-mortgage","Own, with mortgage"],["own-paid","Own, paid off"],["other","Other"]]},
    {id:"hasIRA",label:"Do you have an IRA (Roth or traditional)?",type:"seg",options:YN},
    {id:"hdhpEligible",label:"Is your health plan a high-deductible (HSA-eligible) plan?",type:"seg",options:YNU},
    {id:"investing",label:"Investing outside retirement accounts",type:"seg",options:[["none","None"],["some","A little"],["regular","Regularly"]]}
  ]},
  { title:"Protection", intro:"Insurance is what keeps one bad year from erasing years of progress.", fields:[
    {id:"healthInsurance",label:"Does everyone in the household have health insurance?",type:"seg",options:YN},
    {id:"lifeInsurance",label:"Life insurance on you",type:"select",options:[["none","None"],["employer-only","Only through work"],["term","My own term policy"],["permanent","Whole / universal / IUL policy"]]},
    {id:"disabilityInsurance",label:"Disability insurance (replaces pay if you can't work)",type:"seg",options:YNU}
  ]},
  { title:"Estate & legacy", intro:"Paperwork decides who is in charge if something happens to you.", fields:[
    {id:"hasWill",label:"Do you have a signed will?",type:"seg",options:YN},
    {id:"hasPOA",label:"Durable power of attorney?",type:"seg",options:YNU},
    {id:"hasHealthcareProxy",label:"Health care proxy or advance directive?",type:"seg",options:YNU},
    {id:"hasTrust",label:"Do you have a trust?",type:"seg",options:YN},
    {id:"beneficiariesUpdated",label:"Beneficiaries checked in the last 2 years?",type:"seg",options:YNU,help:"On retirement accounts, life insurance and bank accounts."},
    {id:"burialPlan",label:"Funeral and burial plans",type:"seg",options:[["none","Nothing yet"],["some","Talked about it / wrote some wishes"],["prepaid","Prepaid or funded"]]},
    {id:"burialPreference",label:"Your preference",type:"seg",options:[["burial","Burial"],["cremation","Cremation"],["green","Green / natural"],["undecided","Undecided"]]},
    {id:"ownsCemeteryLot",label:"Does your family already own cemetery plots?",type:"seg",options:YN},
    {id:"familyLotInterest",label:"Interested in a family plot so relatives can rest together?",type:"seg",options:YN}
  ]},
  { title:"Goals", intro:"Pick everything that matters to your family in the next 10 years.", fields:[
    {id:"goals",label:"Family goals",type:"multi",options:GOALS,wide:true}
  ]}
];

const SAMPLE = { age:34, state:"NY", maritalStatus:"married", spouseAge:32, children:"2, 9", otherDependents:"yes", specialNeedsDependent:"no", veteran:"yes", faithTradition:"christian-protestant",
  employment:"w2", incomeRange:"50-75", employerPlan:"below-match", emergencyFundMonths:"lt1", highInterestDebt:"some", creditScoreRange:"580-669", housing:"rent", hasIRA:"no", hdhpEligible:"unsure", investing:"none",
  healthInsurance:"yes", lifeInsurance:"employer-only", disabilityInsurance:"no",
  hasWill:"no", hasPOA:"no", hasHealthcareProxy:"unsure", hasTrust:"no", beneficiariesUpdated:"unsure", burialPlan:"none", burialPreference:"burial", ownsCemeteryLot:"no", familyLotInterest:"yes",
  goals:["home","college","credit","inheritance"] };

let saved = opts.initialIntake || null;
let S = { intake: saved || SAMPLE, isSample: !saved, step: 0, draft: null, faith: null, insTab: "types", lib: {cat:"all", mine:false, q:""}, band: null };

/* ---------- helpers ---------- */
const kidsOf = d => String(d.children||"").split(/[,\s]+/).map(n=>parseInt(n,10)).filter(n=>!isNaN(n)&&n>=0&&n<60);
const bandFor = age => BANDS.find(b => age>=b.ages[0] && age<=b.ages[1]) || BANDS[BANDS.length-1];
const is = (v, ...vals) => vals.includes(v);
const yes = v => v === "yes";
function people(d){
  const out = [{role:"You", age:+d.age||0}];
  if (is(d.maritalStatus,"married","partnered") && d.spouseAge) out.push({role:"Spouse", age:+d.spouseAge});
  kidsOf(d).forEach((a,i)=>out.push({role:"Child "+(i+1), age:a}));
  return out;
}

/* ---------- rules engine: deterministic, every item says why it fired ---------- */
function recommend(d){
  const R = [];
  const add = (o) => R.push(o);
  const age = +d.age||0, kids = kidsOf(d), minors = kids.filter(k=>k<18);
  const partnered = is(d.maritalStatus,"married","partnered");
  const hasDeps = minors.length>0 || partnered || yes(d.otherDependents) || yes(d.specialNeedsDependent);
  const working = is(d.employment,"w2","self-employed","both");
  const goals = d.goals||[];
  const lowIncome = is(d.incomeRange,"u25");

  // FOUNDATION
  if (is(d.emergencyFundMonths,"0","lt1")) add({id:"ef-start",p:1,pillar:"foundation",title:"Build a starter emergency fund",
    why:`You said you have <b>${d.emergencyFundMonths==="0"?"no savings":"less than a month of bills"}</b> you could reach quickly. One car repair or missed paycheck can turn into high-interest debt.`,
    action:"Aim for $1,000 first, then one month of bills, in a separate high-yield savings account.", opts:["v:emergency-fund","v:hysa"], link:"library"});
  else if (d.emergencyFundMonths==="1-3") add({id:"ef-grow",p:2,pillar:"foundation",title:"Grow savings to 3–6 months of bills",
    why:"You have <b>1–3 months</b> saved. That's a real start; 3–6 months covers most job losses.", action:"Automate a transfer each payday into high-yield savings.", opts:["v:emergency-fund","v:hysa","v:treasuries"]});
  if (d.highInterestDebt==="a-lot") add({id:"debt",p:1,pillar:"foundation",title:"Make a plan to pay down high-interest debt",
    why:"You have <b>a lot</b> of credit card or payday-type debt. Rates of 20–30% or more grow faster than almost any investment can.",
    action:"List every debt with its rate. Pay minimums on all, then put every extra dollar on the highest rate (avalanche) or smallest balance (snowball). A nonprofit credit counselor (NFCC member) can help for free or low cost.", opts:[]});
  else if (d.highInterestDebt==="some") add({id:"debt-some",p:2,pillar:"foundation",title:"Clear remaining high-interest balances",
    why:"You have <b>some</b> high-interest debt.", action:"Target the highest rate first and stop new balances.", opts:[]});
  if (is(d.creditScoreRange,"unknown","lt580")) add({id:"credit",p:d.creditScoreRange==="lt580"?1:2,pillar:"foundation",title:d.creditScoreRange==="unknown"?"Check your credit reports and score":"Rebuild your credit",
    why: d.creditScoreRange==="unknown" ? "You <b>don't know your score</b>. Credit affects mortgage rates, insurance prices, apartments and sometimes jobs." : "Your score is <b>below 580</b>, which makes borrowing much more expensive.",
    action:"Get your free reports at AnnualCreditReport.com and dispute errors. Tools that build history are listed below.", opts:["v:secured-card","v:credit-builder-loan","v:authorized-user"]});
  else if (d.creditScoreRange==="580-669" || goals.includes("credit")) add({id:"credit-up",p:2,pillar:"foundation",title:"Raise your score into the 700s",
    why: d.creditScoreRange==="580-669" ? "Your score is <b>580–669</b>. Moving into the 700s can save thousands on a mortgage." : "You picked <b>build credit</b> as a goal.",
    action:"Pay every bill on time, keep card balances under 30% of limits (under 10% is better), and don't close old cards.", opts:["v:secured-card","v:credit-builder-loan","v:authorized-user"]});

  // GROW
  if (is(d.employerPlan,"not-enrolled","below-match")) add({id:"match",p:1,pillar:"grow",title:"Get the full employer match",
    why:`Your job offers a plan and you're <b>${d.employerPlan==="not-enrolled"?"not enrolled":"below the full match"}</b>. The match is extra pay you only get if you contribute.`,
    action:"Ask HR what percent they match and raise your contribution to at least that amount.", opts:["v:employer-401k","v:target-date"]});
  if (is(d.employment,"self-employed","both")) add({id:"self",p:2,pillar:"grow",title:"Open a retirement plan for your self-employment income",
    why:"You have <b>self-employment income</b>. You can be your own employer for retirement savings.", action:"Compare a Solo 401(k) and a SEP IRA.", opts:["v:solo-401k-sep","v:roth-ira"]});
  if (d.hasIRA==="no" && !lowIncome && age>=18) add({id:"ira",p:2,pillar:"grow",title:"Learn how an IRA could add to your retirement savings",
    why:"You <b>don't have an IRA</b> yet. It sits on top of any workplace plan.", action:"Compare Roth (pay tax now, tax-free later) and traditional (deduct now, pay tax later).", opts:["v:roth-ira","v:traditional-ira"]});
  if (d.hdhpEligible==="yes") add({id:"hsa",p:2,pillar:"grow",title:"Use your HSA as a triple-tax-advantaged account",
    why:"Your health plan is <b>HSA-eligible</b>.", action:"Contribute what you can, especially if your employer adds money.", opts:["v:hsa"]});
  if (d.investing==="none" && is(d.emergencyFundMonths,"3-6","6+") && d.highInterestDebt!=="a-lot") add({id:"invest",p:2,pillar:"grow",title:"Start investing with low-cost index funds",
    why:"You have <b>3+ months saved</b> and <b>no investments</b> outside retirement. Money sitting in cash loses ground to inflation over time.", action:"Learn how broad index funds and target-date funds spread your risk.", opts:["v:index-funds","v:target-date","v:bonds"]});
  if (goals.includes("home") && d.housing==="rent") add({id:"home",p:2,pillar:"grow",title:"Get ready to buy a home",
    why:"You picked <b>buy a home</b> and you <b>rent</b> today. For most families a home is the first big wealth-building asset.", action:"Check for first-time buyer programs in "+esc(d.state)+" (state housing finance agency), and get credit and savings ready.", opts:["v:primary-home","v:rental-property","l:cash-value-down-payment"]});
  if (goals.includes("business")) add({id:"biz",p:2,pillar:"grow",title:"Learn the financing paths for a family business",
    why:"You picked <b>start or grow a business</b>. SBA lenders often require life insurance assigned as collateral.", action:"Talk to your local Small Business Development Center (free) before borrowing.", opts:["v:small-business","v:solo-401k-sep","l:collateral-assignment"]});
  if (age>=50 && working) add({id:"catchup",p:2,pillar:"grow",title: (age>=60&&age<=63)?"Use the age 60–63 \"super catch-up\"":"Use catch-up contributions",
    why:`At <b>${age}</b>, the IRS lets you save more each year than younger workers.`, action:"See the current catch-up limits under your workplace plan and IRA.", opts:["v:employer-401k","v:roth-ira"]});
  if (age>=60) add({id:"ss",p:2,pillar:"grow",title:"Plan when to claim Social Security",
    why:`At <b>${age}</b>, your claiming age matters. Waiting past full retirement age raises the monthly check up to age 70.`, action:"Create a my Social Security account at ssa.gov to see your estimates.", opts:["v:social-security","v:medicare","v:annuities"]});
  if (age>=62 && d.housing==="own-paid") add({id:"rm",p:3,pillar:"grow",title:"Understand reverse mortgages before anyone pitches one",
    why:"You <b>own your home outright</b>. Reverse mortgages can help some retirees but reduce what heirs inherit.", action:"Required HUD counseling comes first. Learn the costs before any sales meeting.", opts:["v:reverse-mortgage"]});
  if (goals.includes("retire-early")) add({id:"early",p:3,pillar:"grow",title:"Map an early-retirement path",
    why:"You picked <b>retire early</b>.", action:"Learn how Roth contributions and taxable brokerage accounts can be reached before 59½.", opts:["v:roth-ira","v:index-funds","v:dividend-investing"]});

  // PROTECT
  if (d.healthInsurance==="no") add({id:"health",p:1,pillar:"protect",title:"Get health coverage for everyone",
    why:"Someone in your household is <b>uninsured</b>. Medical bills are a leading cause of debt in America.", action:"Check HealthCare.gov or your state marketplace, Medicaid and CHIP (for children).", opts:["i:health-aca"]});
  if (hasDeps && is(d.lifeInsurance,"none","employer-only")) add({id:"life",p: d.lifeInsurance==="none"?1:2, pillar:"protect", title:"Close the life insurance gap",
    why:`People depend on your income${minors.length?` (<b>${minors.length} child${minors.length>1?"ren":""} under 18</b>)`:""}, and you have <b>${d.lifeInsurance==="none"?"no life insurance":"coverage only through work"}</b>. Work coverage usually ends when the job does and is often only 1–2× salary.`,
    action:"Learn how families size coverage (often 10–12× income plus debts and college) and why term is the lowest-cost way to buy a large death benefit.", opts:["i:term-life","i:group-life","l:term-as-loan-protection","i:whole-life"]});
  if (d.housing==="own-mortgage" && hasDeps) add({id:"mortgage-protect",p:2,pillar:"protect",title:"Make sure the house stays in the family",
    why:"You have a <b>mortgage</b> and people who depend on you.", action:"Term coverage sized to the mortgage balance lets survivors pay it off.", opts:["l:term-as-loan-protection","i:homeowners-renters"]});
  if (working && d.disabilityInsurance!=="yes") add({id:"di",p:2,pillar:"protect",title:"Protect your paycheck with disability insurance",
    why:"You <b>work for your income</b> and don't have disability coverage. A disabling illness or injury is more likely than death during working years.", action:"Ask HR about group long-term disability first; individual policies cost about 1–3% of income.", opts:["i:disability"]});
  if (age>=50) add({id:"ltc",p:2,pillar:"protect",title:"Plan for long-term care costs",
    why:`At <b>${age}</b>, long-term care coverage is still affordable to qualify for. Nursing home costs can wipe out savings meant for heirs.`, action:"Compare traditional and hybrid policies; ask about state partnership programs.", opts:["i:ltc-hybrid","t:medicaid-asset-protection"]});
  if (yes(d.otherDependents) || goals.includes("care-parents")) add({id:"parents",p:2,pillar:"protect",title:"Plan for an aging parent's care and costs",
    why:"You <b>help support an aging parent or adult</b>. Medicaid looks back 5 years at gifts in most states.", action:"Help them sign a power of attorney and health care proxy now, while they can.", opts:["b:durable-power-of-attorney","b:health-care-proxy","t:medicaid-asset-protection","i:ltc-hybrid","f:funeral-trust"]});

  // LEGACY
  if (d.hasWill==="no") add({id:"will",p: minors.length?1:2, pillar:"legacy", title: minors.length?"Write a will and name a guardian for your children":"Write a will",
    why: minors.length ? `You have <b>${minors.length} child${minors.length>1?"ren":""} under 18</b> and <b>no will</b>. Without one, a court decides who raises them and state law decides who inherits.` : "You have <b>no will</b>, so state law decides who inherits.",
    action:"A basic will is often a few hundred dollars with an attorney; some employers offer free legal plans.", opts:["b:will","b:guardianship-nomination","t:testamentary","b:letter-of-instruction"]});
  if (d.hasPOA!=="yes" || d.hasHealthcareProxy!=="yes") add({id:"poa",p:2,pillar:"legacy",title:"Sign a power of attorney and health care proxy",
    why:"You're <b>missing or unsure about</b> the documents that let someone you trust handle money and medical decisions if you can't.", action:"These are often done at the same time as a will.", opts:["b:durable-power-of-attorney","b:health-care-proxy"]});
  if (d.beneficiariesUpdated!=="yes") add({id:"benef",p:2,pillar:"legacy",title:"Check every beneficiary designation",
    why:"Beneficiaries on retirement accounts and life insurance <b>override your will</b>. You said they haven't been checked recently.", action:"Log in to each account and confirm primary and backup beneficiaries. Add payable-on-death to bank accounts.", opts:["b:beneficiary-designations","b:tod-pod"]});
  if (yes(d.specialNeedsDependent)) add({id:"snt",p:1,pillar:"legacy",title:"Protect a family member with a disability",
    why:"Someone in your family <b>may need lifelong support</b>. Leaving money to them directly can cancel SSI and Medicaid.", action:"Learn how a supplemental needs trust and an ABLE account work together.", opts:["t:special-needs","v:able-account"]});
  if (d.hasTrust==="no" && (is(d.housing,"own-mortgage","own-paid") || goals.includes("inheritance") || minors.length)) add({id:"trust",p:3,pillar:"legacy",title:"Learn whether a trust fits your family",
    why:[is(d.housing,"own-mortgage","own-paid")?"you <b>own a home</b>":null, goals.includes("inheritance")?"you want to <b>leave an inheritance</b>":null, minors.length?"you have <b>minor children</b>":null].filter(Boolean).join(", ").replace(/^./,c=>c.toUpperCase())+". Trusts can avoid probate and control when and how heirs receive money.",
    action:"Compare a revocable living trust with a will-only plan.", opts:["t:revocable-living","b:pour-over-will","t:spendthrift","t:ilit","t:dynasty"]});
  if (goals.includes("inheritance")) add({id:"inherit",p:3,pillar:"legacy",title:"Use life insurance to create an inheritance",
    why:"You picked <b>leave an inheritance</b>. A death benefit can create a tax-free inheritance, and an ILIT keeps it outside a taxable estate.", action:"Learn the trade-offs between permanent policies and buying term and investing the difference.", opts:["l:ilit-leverage","t:ilit","l:policy-loan","i:whole-life","i:iul"]});
  if (ESTATE_TAX_STATES.includes(d.state) && (is(d.housing,"own-mortgage","own-paid") || is(d.incomeRange,"100-150","150+"))) add({id:"stax",p:3,pillar:"legacy",title:`Know ${esc(d.state)}'s estate tax`,
    why:`<b>${esc(d.state)}</b> has its own estate tax with a much lower limit than the federal one. Home value, life insurance and retirement accounts all count.`, action:"Ask an estate attorney whether your total could cross the state threshold.", opts:["t:ilit","t:revocable-living"]});

  // CHILDREN
  if (minors.length){
    add({id:"kids",p:2,pillar:"grow",title:`Start investing for ${minors.length>1?"your children":"your child"}`,
      why:`Ages <b>${minors.join(", ")}</b>. Time is the biggest advantage a child has. Small amounts invested at birth can grow a lot by adulthood.`,
      action:"Compare accounts built for children. Children born 2025–2028 may qualify for a $1,000 Treasury seed deposit in a Trump Account.", opts:["v:trump-account","v:plan-529","v:utma-ugma", ...(minors.some(k=>k>=13)?["v:custodial-roth"]:[])]});
    if (minors.some(k=>k>=13)) add({id:"teen",p:3,pillar:"foundation",title:"Build your teen's credit and money habits",
      why:"You have a <b>teenager</b>. Adding them as an authorized user and opening a custodial Roth for their job income both start early.", action:"Add them to a card you pay in full; don't give them the card at first.", opts:["v:authorized-user","v:custodial-roth"]});
  }
  if (goals.includes("college")) add({id:"college",p:2,pillar:"grow",title:"Fund college or trade school",
    why:"You picked <b>college or trade school</b>. 529 plans now cover apprenticeships and workforce credentials too.", action:"Check whether "+esc(d.state)+" gives a tax deduction for its own 529 plan.", opts:["v:plan-529","v:coverdell"]});

  // BURIAL
  if (d.burialPlan==="none") add({id:"burial",p: age>=55?1:2, pillar:"legacy", title:"Put funeral wishes in writing and decide how to pay",
    why:`You have <b>no funeral or burial plan</b>. The national median funeral with burial is about $8,300 before cemetery costs, and families often decide under stress within days.`,
    action:"Write your wishes, pick a funeral home and ask for its price list, and decide how costs will be covered.", opts:["f:final-expense-insurance","f:pod-account","f:preneed-contract","i:final-expense"], link:"burial"});
  if (yes(d.familyLotInterest) && !yes(d.ownsCemeteryLot)) add({id:"lot",p:3,pillar:"legacy",title:"Price out a family plot",
    why:"You want <b>relatives to rest together</b> and the family doesn't own plots yet. Buying adjacent spaces at one time usually costs less and keeps them together.", action:"Visit 2–3 cemeteries and compare total costs: plots, opening and closing, vaults and markers.", opts:[], link:"burial"});
  if (yes(d.veteran)) add({id:"va",p:3,pillar:"legacy",title:"Use veterans burial benefits",
    why:"Someone in your household <b>served</b>. Eligible veterans can be buried in a national cemetery at no cost, with a headstone and flag.", action:"Apply for pre-need eligibility with the VA now so the family isn't searching for paperwork later.", opts:["f:va-benefits"], link:"burial"});

  const order = {protect:0, foundation:1, grow:2, legacy:3};
  return R.sort((a,b)=> a.p-b.p || order[a.pillar]-order[b.pillar]);
}

/* ---------- Ask AI link-out ---------- */
function profileLine(d){
  const kids = kidsOf(d);
  const parts = [`I'm ${d.age}`, `living in ${d.state}`];
  if (is(d.maritalStatus,"married","partnered")) parts.push(d.maritalStatus);
  if (kids.length) parts.push(`with children aged ${kids.join(", ")}`);
  if ((d.goals||[]).length) parts.push(`and my goals are: ${(d.goals||[]).map(g=>(GOALS.find(x=>x[0]===g)||[g,g])[1].toLowerCase()).join(", ")}`);
  return parts.join(", ")+".";
}
function askUrl(topic, withProfile=true){
  let q = `I'm using Legacy Path, a financial education app about building generational wealth. `;
  if (withProfile && !S.isSample) q += profileLine(S.intake)+" ";
  q += `Please explain in plain language: ${topic} Cover how it works, the pros and cons, common mistakes, and the questions I should ask a licensed professional. This is for education; don't tell me what to buy.`;
  return "https://claude.ai/new?q="+encodeURIComponent(q);
}
const askLink = (topic, label="Ask AI about this") => `<a class="btn small" href="${askUrl(topic)}" target="_blank" rel="noopener">${label} ↗</a>`;

/* ---------- detail drawer ---------- */
const LABELS = {whatItIs:"What it is",bestFor:"Best for",keyRules:"Key rules and limits (2026)",taxTreatment:"Taxes",risks:"Risks",starterStep:"A first step",whoItsFor:"Who it's for",pros:"Pros",cons:"Cons",typicalCost:"Typical cost",example:"Example",whyItMatters:"Why it matters",costNote:"Cost",watchOuts:"Watch out for",howItWorks:"How it works",steps:"Steps",benefits:"Benefits",whoMightConsider:"Who might consider it",whoShouldAvoid:"Who should avoid it",questionsToAsk:"Questions to ask a licensed professional",description:"How it works"};
const SKIP = ["id","name","category","minAge","maxAge","sourceUrl"];
function renderVal(v){
  if (Array.isArray(v)) return `<ul class="clean">${v.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
  if (v && typeof v==="object") return Object.entries(v).map(([k,x])=>`<p><b>${esc(k)}:</b> ${esc(x)}</p>`).join("");
  return `<p>${esc(v)}</p>`;
}
let lastFocus = null;
function openDetail(key){
  const x = IDX[key]; if (!x) return;
  lastFocus = document.activeElement;
  const kind = KIND[key.split(":")[0]];
  const rows = Object.entries(x).filter(([k,v])=>!SKIP.includes(k) && v!=null && v!=="").map(([k,v])=>`<div><dt>${esc(LABELS[k]||k)}</dt><dd>${renderVal(v)}</dd></div>`).join("");
  const d = $("#drawer");
  d.innerHTML = `<div class="dhead"><div><div class="eyebrow">${esc(kind)}${x.category?" · "+esc(x.category.replace(/-/g," ")):""}</div><h2 id="dtitle">${esc(x.name)}</h2></div><button class="btn small" id="dclose" aria-label="Close">Close</button></div>
  <dl>${rows}</dl>
  <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">${askLink(x.name+" — "+(x.whatItIs||x.howItWorks||x.description||""))}</div>
  ${x.sourceUrl?`<div class="sources">Source: <a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">${esc(x.sourceUrl)}</a></div>`:""}
  <p class="muted" style="font-size:.8rem">Education only. Confirm details with a licensed professional in your state.</p>`;
  d.hidden = false; $("#scrim").hidden = false;
  $("#dclose").focus();
}
function closeDetail(){ $("#drawer").hidden = true; $("#scrim").hidden = true; if (lastFocus) lastFocus.focus(); }
const onClick = e=>{
  const o = e.target.closest("[data-opt]"); if (o){ e.preventDefault(); openDetail(o.dataset.opt); return; }
  if (e.target.id==="dclose" || e.target.id==="scrim") closeDetail();
  const u = e.target.closest("[data-unlock]"); if (u){ e.preventDefault(); opts.onUnlock && opts.onUnlock(); }
};
const onKey = e=>{ if (e.key==="Escape" && !$("#drawer").hidden) closeDetail(); };
const optChip = key => IDX[key] ? `<button class="chip" data-opt="${esc(key)}">${esc(optName(key))}</button>` : "";
const lockChips = n => `<button class="chip lockchip" data-unlock="1">🔒 Unlock to see ${n} option${n===1?"":"s"}</button>`;

/* ---------- views ---------- */
const ROUTES = [
  "Your plan",["plan","My family plan"],["screener","Screener"],"Learn",
  ["stages","Life stages"],["library","Options library"],["estate","Trusts & estate"],["insurance","Insurance & financing"],["burial","Burial & legacy"],"Help",
  ["ask","Ask AI"]
];
function renderNav(active){
  $("#nav").innerHTML = ROUTES.map(r => typeof r==="string" ? `<div class="navlabel eyebrow">${r}</div>` : `<a href="#${r[0]}" ${r[0]===active?'aria-current="page"':""}>${r[1]}${!HAS && PAID.includes(r[0]) ? '<span aria-label="locked">🔒</span>' : ""}</a>`).join("");
}

function sampleNotice(){
  return S.isSample ? `<div class="notice"><div><strong>Example household.</strong> You're looking at a made-up family (34, married, renting in New York, two kids). <a href="#screener">Take the 5-minute screener</a> to see your own plan.</div></div>` : "";
}

function lifelineSVG(d){
  const W=900, H=150, x0=20, x1=W-20, maxAge=100;
  const X = a => x0 + (Math.min(a,maxAge)/maxAge)*(x1-x0);
  const bands = BANDS.map((b,i)=>{
    const a=b.ages[0], z=Math.min(b.ages[1]+1,maxAge);
    return `<rect x="${X(a)}" y="70" width="${X(z)-X(a)}" height="22" fill="var(${i%2?"--band-b":"--band-a"})"/>
      <text x="${(X(a)+X(z))/2}" y="108" text-anchor="middle">${b.ages[0]}${b.ages[1]>=120?"+":"–"+b.ages[1]}</text>`;
  }).join("");
  const ps = people(d).sort((a,b)=>a.age-b.age);
  let lastX=-99, lift=0;
  const marks = ps.map(p=>{
    const x=X(p.age); lift = (x-lastX<70) ? (lift+1)%3 : 0; lastX=x;
    const y = 58 - lift*15;
    const col = p.role==="You" ? "var(--accent)" : "var(--brand)";
    return `<line x1="${x}" y1="${y+4}" x2="${x}" y2="92" stroke="${col}" stroke-width="1.5"/><circle cx="${x}" cy="81" r="5" fill="${col}"/>
      <text class="lbl" x="${x}" y="${y}" text-anchor="middle">${esc(p.role)} · ${p.age}</text>`;
  }).join("");
  const names = BANDS.map((b,i)=>{ const a=b.ages[0], z=Math.min(b.ages[1]+1,maxAge); return `<text x="${(X(a)+X(z))/2}" y="126" text-anchor="middle" style="font-size:9px">${esc(b.label.replace(/^The /,"").replace(/ Years$/,""))}</text>`;}).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Family lifeline showing each household member's age across the eight life stages">${bands}${names}${marks}</svg>`;
}

function viewPlan(){
  const d = S.intake, R = recommend(d);
  const P = {protect:"Protect",foundation:"Foundation",grow:"Grow",legacy:"Legacy"};
  const PDESC = {protect:"Insurance that keeps setbacks from wiping you out",foundation:"Savings, debt and credit",grow:"Retirement, investing, home, business, kids",legacy:"Wills, trusts, beneficiaries, burial"};
  const pill = p => ({1:'<span class="pill crit">Do first</span>',2:'<span class="pill warn">Work on next</span>',3:'<span class="pill good">When ready</span>'})[p];
  const pillarState = k => { const r=R.filter(x=>x.pillar===k); const c=r.filter(x=>x.p===1).length, w=r.filter(x=>x.p===2).length;
    const st = c? ['crit','Needs attention'] : w? ['warn','In progress'] : ['good','On track'];
    return `<div class="pillar"><div class="eyebrow">${P[k]}</div><h3>${PDESC[k]}</h3><span class="pill ${st[0]}">${st[1]}</span><div class="count">${r.length} item${r.length===1?"":"s"}${c?` · ${c} urgent`:""}</div></div>`; };
  const n1=R.filter(r=>r.p===1).length, n2=R.filter(r=>r.p===2).length, n3=R.filter(r=>r.p===3).length;
  const group = (p,title,sub) => { const list=R.filter(r=>r.p===p); if(!list.length) return "";
    return `<section class="recgroup"><header><h2>${title}</h2><span class="muted">${sub}</span></header>${list.map(r=>`
      <article class="rec p${r.p}"><div class="stripe"></div><div class="body">
        <div class="meta">${pill(r.p)}<span class="pill neutral">${P[r.pillar]}</span></div>
        <h3>${r.title}</h3>
        <p class="why">Why this shows up: ${r.why}</p>
        <p>${r.action}</p>
        ${r.opts.length?`<div><div class="eyebrow" style="margin-bottom:6px">Options to explore</div><div class="chips">${HAS ? r.opts.map(optChip).join("") : lockChips(r.opts.length)}</div></div>`:""}
        <div class="actions">${r.link?`<a class="btn small" href="#${r.link}">Open the guide</a>`:""}${askLink(r.title.replace(/<[^>]+>/g,"")+". "+r.action)}</div>
      </div></article>`).join("")}</section>`; };
  const bandsHere = [...new Set(people(d).map(p=>bandFor(p.age).label))];
  return `${sampleNotice()}
  <div class="planhead"><div class="pagehead"><div class="eyebrow">${S.isSample?"Example household":"Your family plan"} · ${esc(d.state)}</div>
    <h1>${n1?`${n1} thing${n1>1?"s":""} to do first, ${n2} to work on next`:`No urgent gaps. ${n2} things to strengthen`}</h1>
    <p>Your household spans ${bandsHere.length} life stage${bandsHere.length>1?"s":""}: ${bandsHere.map(esc).join(", ")}. Each item below says which answer triggered it, so you can see exactly why it's here.</p></div>
    <a class="btn primary" href="#screener">${S.isSample?"Take the screener":"Update my answers"}</a></div>
  <div class="lifeline"><div class="eyebrow" style="margin-bottom:4px">Family lifeline · ages 0 to 100</div>${lifelineSVG(d)}</div>
  <div class="pillars">${["protect","foundation","grow","legacy"].map(pillarState).join("")}</div>
  ${group(1,"Do first","Gaps that could undo everything else")}
  ${group(2,"Work on next","The steps that build the base")}
  ${group(3,"When you're ready","Growth and legacy moves")}
  ${HAS ? "" : `<div class="unlock"><div><div class="eyebrow" style="color:inherit;opacity:.8">Lifetime access</div><h2 style="margin-top:4px">Your whole family, every life stage, one price</h2>
    <ul><li>Screener and plan for every household member, updated whenever life changes</li><li>Full library: 31 savings and investment options, 15 insurance types, 10 trusts</li><li>Funeral and burial guides for 11 faith traditions, including family plot planning</li><li>Free Ask AI help on any topic</li></ul></div>
    <div><div class="price">$20<small>one time, plus sales tax where applicable</small></div><button class="btn accent" style="margin-top:12px" data-unlock="1">Unlock Legacy Path</button><div style="font-size:.78rem;opacity:.85;margin-top:8px">30-day refund policy</div></div></div>`}`;
}

function viewScreener(){
  const d = S.draft || (S.draft = JSON.parse(JSON.stringify(S.isSample ? {state:"NY",goals:[]} : S.intake)));
  const st = STEPS[S.step];
  const field = f => {
    if (f.showIf && !f.showIf(d)) return "";
    const v = d[f.id];
    let input = "";
    if (f.type==="number") input = `<input type="number" id="f_${f.id}" name="${f.id}" min="${f.min}" max="${f.max}" value="${esc(v??"")}" inputmode="numeric">`;
    else if (f.type==="text") input = `<input type="text" id="f_${f.id}" name="${f.id}" value="${esc(v??"")}" placeholder="${esc(f.placeholder||"")}">`;
    else if (f.type==="select") input = `<select id="f_${f.id}" name="${f.id}"><option value="">Choose…</option>${f.options.map(o=>`<option value="${esc(o[0])}" ${v===o[0]?"selected":""}>${esc(o[1])}</option>`).join("")}</select>`;
    else if (f.type==="seg") input = `<div class="seg" role="radiogroup" aria-label="${esc(f.label)}">${f.options.map((o,i)=>`<label><input type="radio" id="f_${f.id}_${i}" name="${f.id}" value="${esc(o[0])}" ${v===o[0]?"checked":""}><span>${esc(o[1])}</span></label>`).join("")}</div>`;
    else if (f.type==="multi") input = `<div class="seg">${f.options.map((o,i)=>`<label><input type="checkbox" id="f_${f.id}_${i}" name="${f.id}" value="${esc(o[0])}" ${(v||[]).includes(o[0])?"checked":""}><span>${esc(o[1])}</span></label>`).join("")}</div>`;
    const lab = (f.type==="seg"||f.type==="multi") ? `<span class="flabel">${esc(f.label)}</span>` : `<label for="f_${f.id}">${esc(f.label)}</label>`;
    return `<div class="field ${f.type==="seg"||f.wide?"wide":""}">${lab}${input}${f.help?`<span class="help">${esc(f.help)}</span>`:""}</div>`;
  };
  return `<div class="pagehead"><div class="eyebrow">Screener · step ${S.step+1} of ${STEPS.length}</div><h1>${esc(st.title)}</h1><p>${esc(st.intro)} Your answers stay on this device in the prototype.</p></div>
  <div class="stepper">${STEPS.map((s,i)=>`<span class="${i===S.step?"on":i<S.step?"done":""}">${i+1}. ${esc(s.title)}</span>`).join("")}</div>
  <form class="form" id="sform" novalidate>${st.fields.map(field).join("")}</form>
  <p class="muted" id="ferr" role="alert" hidden></p>
  <div class="formnav"><button class="btn" id="back" ${S.step===0?"disabled":""}>Back</button>
    <button class="btn primary" id="next">${S.step===STEPS.length-1?"See my plan":"Continue"}</button></div>`;
}
function readStep(){
  const form = $("#sform"); if (!form) return;
  const d = S.draft;
  STEPS[S.step].fields.forEach(f=>{
    if (f.type==="multi") d[f.id] = [...form.querySelectorAll(`input[name="${f.id}"]:checked`)].map(i=>i.value);
    else if (f.type==="seg"){ const c=form.querySelector(`input[name="${f.id}"]:checked`); if (c) d[f.id]=c.value; }
    else { const el=form.querySelector(`[name="${f.id}"]`); if (el) d[f.id] = f.type==="number" ? (el.value===""?"":+el.value) : el.value; }
  });
}
function bindScreener(){
  $("#sform").addEventListener("change", ()=>{ readStep(); const y=window.scrollY; render(); window.scrollTo(0,y); });
  $("#back").onclick = e=>{ e.preventDefault(); readStep(); S.step=Math.max(0,S.step-1); render(); };
  $("#next").onclick = e=>{ e.preventDefault(); readStep();
    const d=S.draft;
    if (S.step===0 && (!d.age || d.age<16 || d.age>110 || !d.state)){ const er=$("#ferr"); er.hidden=false; er.textContent="Enter your age (16–110) and choose your state to continue."; return; }
    if (S.step<STEPS.length-1){ S.step++; render(); window.scrollTo(0,0); return; }
    const defaults = {maritalStatus:"single",otherDependents:"no",specialNeedsDependent:"no",veteran:"no",employment:"w2",incomeRange:"50-75",employerPlan:"none",emergencyFundMonths:"lt1",highInterestDebt:"none",creditScoreRange:"unknown",housing:"rent",hasIRA:"no",hdhpEligible:"unsure",investing:"none",healthInsurance:"yes",lifeInsurance:"none",disabilityInsurance:"unsure",hasWill:"no",hasPOA:"unsure",hasHealthcareProxy:"unsure",hasTrust:"no",beneficiariesUpdated:"unsure",burialPlan:"none",burialPreference:"undecided",ownsCemeteryLot:"no",familyLotInterest:"no",faithTradition:"prefer-not",goals:[]};
    S.intake = Object.assign({}, defaults, Object.fromEntries(Object.entries(d).filter(([k,v])=>v!==""&&v!=null)));
    S.isSample=false; S.draft=null; S.step=0; S.faith=null; opts.onSaveIntake && opts.onSaveIntake(S.intake);
    location.hash="plan";
  };
}

function viewStages(){
  const ps = people(S.intake);
  const cur = S.band || bandFor(+S.intake.age||30).id;
  const b = C.ageBands.find(x=>x.id===cur);
  const whoIn = band => ps.filter(p=>p.age>=band.ages[0]&&p.age<=band.ages[1]).map(p=>p.role);
  return `<div class="pagehead"><div class="eyebrow">Cradle to grave · 8 life stages</div><h1>What to focus on at every age</h1><p>Each stage has its own lessons and checklist. Stages marked with a name are where someone in ${S.isSample?"the example":"your"} household is right now.</p></div>
  <div class="tabs" role="tablist">${C.ageBands.map(x=>{const w=whoIn(x);return `<button class="tab" role="tab" data-band="${x.id}" aria-selected="${x.id===cur}"><span class="eyebrow">${x.ages[0]}${x.ages[1]>=120?"+":"–"+x.ages[1]}</span><b>${esc(x.label.replace(/^The /,""))}</b>${w.length?`<span class="who">${esc(w.join(", "))}</span>`:""}</button>`}).join("")}</div>
  <section class="section">
    <div class="prose"><div class="eyebrow">Ages ${b.ages[0]}${b.ages[1]>=120?" and up":" to "+b.ages[1]}</div><h2>${esc(b.label)}: ${esc(b.headline)}</h2><p>${esc(b.whyItMatters)}</p></div>
    <div class="chips">${b.priorities.map(p=>`<span class="chip static">${esc(p)}</span>`).join("")}</div>
    ${b.lessons.map((l,i)=>`<details class="acc" ${i===0?"open":""}><summary>${esc(l.title)}</summary><div><p>${esc(l.body)}</p>${askLink(l.title+" (for the "+b.label+", ages "+b.ages[0]+"–"+b.ages[1]+")")}</div></details>`).join("")}
    <div class="twocol">
      <div class="card"><h3>Checklist for this stage</h3><ul class="check">${b.checklist.map(c=>`<li>${esc(c)}</li>`).join("")}</ul></div>
      ${b.parentActions.length?`<div class="card"><h3>What parents and guardians do</h3><ul class="check">${b.parentActions.map(c=>`<li>${esc(c)}</li>`).join("")}</ul></div>`:`<div class="card"><h3>Options that fit this stage</h3><div class="chips">${b.vehicleIds.map(id=>optChip("v:"+id)).join("")}</div></div>`}
    </div>
    ${b.parentActions.length?`<div class="card"><h3>Options that fit this stage</h3><div class="chips">${b.vehicleIds.map(id=>optChip("v:"+id)).join("")}</div></div>`:""}
  </section>`;
}

const CATS = [["all","All"],["safety","Safety"],["credit","Credit"],["child","Children"],["education","Education"],["retirement","Retirement"],["investing","Investing"],["income","Income"],["real-estate","Real estate"],["business","Business"],["health","Health"]];
function viewLibrary(){
  const L = S.lib, ages = people(S.intake).map(p=>p.age);
  const fits = v => ages.some(a => (v.minAge==null||a>=v.minAge) && (v.maxAge==null||a<=v.maxAge));
  const list = C.vehicles.filter(v => (L.cat==="all"||v.category===L.cat) && (!L.mine||fits(v)) && (!L.q || (v.name+" "+v.whatItIs).toLowerCase().includes(L.q.toLowerCase())));
  return `<div class="pagehead"><div class="eyebrow">Options library · ${C.vehicles.length} options</div><h1>Every place a family's money can go</h1><p>From a child's first account to Social Security. Open any option for the 2026 rules, taxes, risks and a first step.</p></div>
  <div class="toolbar"><input class="search" id="libq" type="search" placeholder="Search options" value="${esc(L.q)}" aria-label="Search options">
    <label class="checkline"><input type="checkbox" id="libmine" ${L.mine?"checked":""}> Only options that fit my household's ages</label></div>
  <div class="chips">${CATS.map(c=>`<button class="chip ${L.cat===c[0]?"on":""}" data-cat="${c[0]}">${c[1]}</button>`).join("")}</div>
  <div class="grid">${list.map(v=>`<article class="card"><div class="eyebrow">${esc(v.category.replace(/-/g," "))}${v.minAge!=null||v.maxAge!=null?` · ages ${v.minAge??0}${v.maxAge!=null?"–"+v.maxAge:"+"}`:""}</div><h3>${esc(v.name)}</h3><p>${esc(v.whatItIs)}</p><div class="cardfoot"><button class="btn small" data-opt="v:${esc(v.id)}">Details</button></div></article>`).join("") || `<p class="muted">No options match. Clear the search or pick another category.</p>`}</div>`;
}

function viewEstate(){
  const T = C.trusts, d = S.intake;
  const status = {"will":d.hasWill,"durable-power-of-attorney":d.hasPOA,"health-care-proxy":d.hasHealthcareProxy,"beneficiary-designations":d.beneficiariesUpdated};
  const st = v => v==="yes" ? '<span class="pill good">In place</span>' : v==="no" ? '<span class="pill crit">Missing</span>' : v ? '<span class="pill warn">Check</span>' : "";
  const kf = T.keyFacts2026, labels = {federalEstateTaxExemption:"Federal estate tax exemption",annualGiftExclusion:"Annual gift exclusion",giftToNonCitizenSpouse:"Gifts to a non-citizen spouse",stateEstateTaxes:"State estate taxes",stateInheritanceTaxes:"State inheritance taxes",medicaidLookBack:"Medicaid look-back"};
  return `<div class="pagehead"><div class="eyebrow">Trusts & estate</div><h1>Deciding who gets what, and who's in charge</h1><p>${esc(T.intro)}</p></div>
  <section class="section"><h2>Documents every adult needs</h2><div class="grid">${T.basics.map(b=>`<article class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div class="eyebrow">Estate document</div>${st(status[b.id])}</div><h3>${esc(b.name)}</h3><p>${esc(b.whatItIs)}</p><div class="cardfoot"><button class="btn small" data-opt="b:${esc(b.id)}">Why it matters</button></div></article>`).join("")}</div></section>
  <section class="section"><h2>Family trusts, explained</h2><p class="muted" style="max-width:70ch">A trust is a legal container that holds assets for the people you name, with rules you set. Families use them to skip probate, protect heirs from creditors or poor decisions, keep benefits for a disabled relative, and pass wealth down more than one generation.</p>
    <div class="grid">${T.trusts.map(t=>`<article class="card"><div class="eyebrow">Trust · ${esc(t.typicalCost)}</div><h3>${esc(t.name)}</h3><p>${esc(t.whatItIs)}</p><p class="muted"><b>For:</b> ${esc(t.whoItsFor)}</p><div class="cardfoot"><button class="btn small" data-opt="t:${esc(t.id)}">Pros, cons and an example</button></div></article>`).join("")}</div></section>
  <section class="section"><h2>2026 numbers to know</h2><div class="tablewrap"><table><tbody>${Object.entries(labels).map(([k,l])=>kf[k]?`<tr><th scope="row" style="width:32%">${l}</th><td>${esc(kf[k])}</td></tr>`:"").join("")}</tbody></table></div><p class="muted" style="font-size:.85rem">${esc(kf.note||"")}</p></section>
  <section class="section"><h2>Questions to bring to an estate attorney</h2><div class="card"><ul class="check">${(T.questionsToAskAnEstateAttorney||[]).map(q=>`<li>${esc(q)}</li>`).join("")}</ul><div class="cardfoot">${askLink("how families choose between a will and a revocable living trust, and when an irrevocable or dynasty trust makes sense")}</div></div></section>
  ${sources(T.sources)}`;
}

function viewInsurance(){
  const I = C.insurance, L = C.leverage, tab = S.insTab;
  const CATL = {life:"Life insurance","final-expense":"Final expense",income:"Income protection",health:"Health","long-term-care":"Long-term care",property:"Property",liability:"Liability"};
  const cats = [...new Set(I.policies.map(p=>p.category))];
  const types = `<p class="muted" style="max-width:70ch">${esc(I.intro)}</p>
    <details class="acc"><summary>Insurance words, defined</summary><div><div class="tablewrap"><table><tbody>${Object.entries(I.keyTerms).map(([k,v])=>`<tr><th scope="row" style="width:28%">${esc(k.replace(/([A-Z])/g," $1").toLowerCase())}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table></div></div></details>
    ${cats.map(c=>`<section class="section"><h2>${esc(CATL[c]||c)}</h2><div class="grid">${I.policies.filter(p=>p.category===c).map(p=>`<article class="card"><div class="eyebrow">${esc(CATL[c]||c)}</div><h3>${esc(p.name)}</h3><p>${esc(p.whatItIs)}</p><p class="muted"><b>Cost:</b> ${esc(p.costNote)}</p><div class="cardfoot"><button class="btn small" data-opt="i:${esc(p.id)}">Pros, cons, watch-outs</button></div></article>`).join("")}</div></section>`).join("")}
    <section class="section"><h2>Questions to ask a licensed agent</h2><div class="card"><ul class="check">${(I.questionsToAskALicensedAgent||[]).map(q=>`<li>${esc(q)}</li>`).join("")}</ul></div></section>
    ${sources(I.sources)}`;
  const fin = `<div class="prose"><p>${esc(L.intro)}</p></div>
    <div class="card"><h3>How cash value works</h3><p>${esc(L.howCashValueWorks)}</p></div>
    <section class="section"><h2>Six ways families use policies to reach financing</h2><div class="grid">${L.strategies.map(s=>`<article class="card"><div class="eyebrow">Strategy</div><h3>${esc(s.name)}</h3><p>${esc(s.howItWorks)}</p><p class="muted"><b>Who should avoid it:</b> ${esc(s.whoShouldAvoid)}</p><div class="cardfoot"><button class="btn small" data-opt="l:${esc(s.id)}">Steps, example, risks</button></div></article>`).join("")}</div></section>
    <section class="section"><h2>${esc(L.comparison.title)}</h2><div class="twocol"><div class="card"><div class="eyebrow">Approach A</div><h3>Buy term, invest the difference</h3><p>${esc(L.comparison.buyTermInvestDifference)}</p></div><div class="card"><div class="eyebrow">Approach B</div><h3>Permanent policy with cash value</h3><p>${esc(L.comparison.permanentPolicyApproach)}</p></div></div>
    <div class="notice"><div><strong>Bottom line.</strong> ${esc(L.comparison.bottomLine)}</div></div>
    <div>${askLink("the difference between buying term life insurance and investing the difference versus using a whole life policy for policy loans (infinite banking), with a numeric example")}</div></section>
    ${sources(L.sources)}`;
  return `<div class="pagehead"><div class="eyebrow">Insurance & financing</div><h1>Protect the family, then put the policies to work</h1><p>Insurance comes first because it protects everything else. Some policies can also be pledged or borrowed against to finance a home, business or other assets.</p></div>
  <div class="tabs" role="tablist"><button class="tab" role="tab" data-ins="types" aria-selected="${tab==="types"}"><b>Types of insurance</b></button><button class="tab" role="tab" data-ins="fin" aria-selected="${tab==="fin"}"><b>Using policies to access financing</b></button></div>
  ${tab==="types"?types:fin}`;
}

function viewBurial(){
  const F = C.funeral, d = S.intake;
  const def = F.traditions.find(t=>t.id===d.faithTradition) ? d.faithTradition : "christian-protestant";
  const cur = S.faith || def, t = F.traditions.find(x=>x.id===cur);
  const faiths = [...new Set(F.traditions.map(x=>x.faith))];
  const row = (l,v) => v?`<div><dt>${l}</dt><dd><p>${esc(v)}</p></dd></div>`:"";
  return `<div class="pagehead"><div class="eyebrow">Burial & legacy</div><h1>Planning a goodbye, before anyone has to</h1><p>${esc(F.intro)}</p></div>
  <div class="card"><h3>Why families plan ahead</h3><ul class="check">${F.whyPlanAhead.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
  <section class="section"><h2>Traditions and customs</h2>
    <div class="faithhead"><label for="faithsel" class="eyebrow">Show the tradition for</label><select id="faithsel">${faiths.map(f=>`<optgroup label="${esc(f)}">${F.traditions.filter(x=>x.faith===f).map(x=>`<option value="${x.id}" ${x.id===cur?"selected":""}>${esc(x.tradition)}</option>`).join("")}</optgroup>`).join("")}</select>
      ${S.faith==null && F.traditions.find(x=>x.id===d.faithTradition)?`<span class="pill neutral">From ${S.isSample?"the example's":"your"} screener</span>`:""}</div>
    <article class="card" style="gap:14px"><div><div class="eyebrow">${esc(t.faith)}</div><h2>${esc(t.tradition)}</h2></div><p>${esc(t.overview)}</p>
      <dl class="twocol" style="margin:0">${row("Timing",t.timing)}${row("Caring for the body",t.bodyCare)}${row("The service",t.service)}${row("Burial or cremation",t.finalDisposition)}${row("Mourning",t.mourning)}${row("Cemetery and plots",t.cemetery)}${row("Costs",t.costNotes)}${row("For guests",t.respectNotes)}</dl>
      <div><div class="eyebrow" style="margin-bottom:6px">Questions for clergy or the funeral home</div><ul class="check">${t.questionsForClergyOrFuneralHome.map(q=>`<li>${esc(q)}</li>`).join("")}</ul></div>
      <p class="muted" style="font-size:.85rem">Practices vary by congregation, family and region. Your clergy or community's funeral home is the final word.</p>
      <div>${askLink("funeral and burial customs in the "+t.tradition+" tradition, and how to plan and budget for them ahead of time")}</div></article>
  </section>
  <section class="section"><h2>Step by step</h2><div class="steps">${F.planningSteps.map(s=>`<div class="card"><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></div>`).join("")}</div></section>
  <section class="section"><h2>Cemetery lots and family plots</h2><p class="muted" style="max-width:70ch">${esc(F.cemeteryLots.intro)}</p>
    <div class="tablewrap"><table><thead><tr><th>Option</th><th>What it is</th><th>Typical cost</th><th>Tips</th></tr></thead><tbody>${F.cemeteryLots.options.map(o=>`<tr><td><b>${esc(o.name)}</b></td><td>${esc(o.description)}</td><td class="num" style="white-space:normal;min-width:130px">${esc(o.typicalCost)}</td><td>${esc(o.tips)}</td></tr>`).join("")}</tbody></table></div>
    <div class="twocol"><div class="card"><h3>Buying for the whole family</h3><ul class="check">${F.cemeteryLots.familyPlotTips.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div><div class="card"><h3>Questions to ask the cemetery</h3><ul class="check">${F.cemeteryLots.questionsToAsk.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>
    <p class="muted" style="font-size:.85rem">${esc(F.cemeteryLots.stateNote)}</p></section>
  <section class="section"><h2>What it costs</h2><div class="tablewrap"><table><thead><tr><th>Item</th><th>Typical</th><th>Note</th></tr></thead><tbody>${F.costs.map(c=>`<tr><td><b>${esc(c.item)}</b></td><td class="num">${esc(c.typicalRange)}</td><td>${esc(c.note)}</td></tr>`).join("")}</tbody></table></div></section>
  <section class="section"><h2>Ways to pay</h2><div class="grid">${F.paymentOptions.map(p=>`<article class="card"><div class="eyebrow">Payment option</div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="cardfoot"><button class="btn small" data-opt="f:${esc(p.id)}">Pros and cons</button></div></article>`).join("")}</div></section>
  <div class="twocol"><div class="card"><h3>Your rights under the FTC Funeral Rule</h3><ul class="check">${F.consumerRights.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
    <div class="card"><h3>Veterans</h3><p>${esc(F.veterans.summary)}</p><ul class="clean">${F.veterans.benefits.map(x=>`<li>${esc(x)}</li>`).join("")}</ul><p class="muted"><b>How to apply:</b> ${esc(F.veterans.howToApply)}</p></div></div>
  <section class="section"><h2>When a loved one dies: a checklist</h2><div class="card"><ul class="check">${F.afterDeathChecklist.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></section>
  ${sources(F.sources)}`;
}

function viewAsk(){
  const topics = ["How does a Roth IRA for a child work?","Is whole life insurance a good way to build family wealth?","What is a revocable living trust and do I need one?","How do I prepare my family financially for my funeral?","How do I raise my credit score to buy a home?","How can I use life insurance to get an SBA loan?"];
  return `<div class="pagehead"><div class="eyebrow">Ask AI · free</div><h1>Ask anything, in plain language</h1><p>Questions open in Claude, a free AI assistant, in a new tab. You'll need a free Claude account. Paid Claude plans are optional and aren't part of Legacy Path.</p></div>
  <div class="askbox"><label for="askq" style="font-weight:600">Your question</label>
    <textarea id="askq">${esc(topics[0])}</textarea>
    <div class="chips">${topics.map(t=>`<button class="chip" data-topic="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <label class="checkline"><input type="checkbox" id="askprof" ${S.isSample?"disabled":"checked"}> <span>Include my general profile (age, state, children's ages, goals). No names, balances or account numbers are ever sent.${S.isSample?" Take the screener to enable this.":""}</span></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary" id="askgo" href="#" target="_blank" rel="noopener">Open in Claude ↗</a><button class="btn" id="askcopy">Copy question</button></div>
    <p class="muted" id="askmsg" style="font-size:.85rem" hidden></p></div>
  <div class="notice"><div><strong>Before you act on any AI answer:</strong> AI can be wrong or out of date. Check the figures with the source, and talk to a licensed professional before buying a policy, moving retirement money or signing legal documents.</div></div>`;
}

function sources(list){ if (!list||!list.length) return ""; return `<details class="acc"><summary>Sources (${list.length})</summary><div class="sources">${list.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join("")}</div></details>`; }

function viewLocked(r){
  const name = (ROUTES.find(x=>Array.isArray(x)&&x[0]===r)||[r,r])[1];
  const pending = opts.hasAccess && !C;
  return `<div class="pagehead"><div class="eyebrow">${pending ? "Almost ready" : "Included with Legacy Path"}</div><h1>${esc(name)}</h1>
  <p>${pending ? "Your purchase is active. The guides are being published. Check back shortly." : "Unlock every life stage, the full options library, trusts and estate guides, insurance and financing strategies, and burial planning for your family's faith tradition."}</p></div>
  ${pending ? "" : `<div class="unlock"><div><div class="eyebrow" style="color:inherit;opacity:.8">Lifetime access</div><h2 style="margin-top:4px">One price for your whole family</h2><ul><li>8 life stages from the cradle years to the legacy years</li><li>31 savings and investment options with 2026 rules</li><li>10 trusts, 15 insurance types and 6 ways families use policies to reach financing</li><li>Funeral and burial guides for 11 faith traditions, including family plots</li></ul></div><div><div class="price">$20<small>one time, plus sales tax where applicable</small></div><button class="btn accent" style="margin-top:12px" data-unlock="1">Unlock Legacy Path</button><div style="font-size:.78rem;opacity:.85;margin-top:8px">30-day refund policy</div></div></div>`}`;
}

/* ---------- router ---------- */
const VIEWS = {plan:viewPlan, screener:viewScreener, stages:viewStages, library:viewLibrary, estate:viewEstate, insurance:viewInsurance, burial:viewBurial, ask:viewAsk};
function route(){ const h=(location.hash||"").slice(1); return VIEWS[h]?h:"plan"; }
function render(){
  const r = route(); renderNav(r);
  if (!HAS && PAID.includes(r)) { $("#view").innerHTML = viewLocked(r); return; }
  $("#view").innerHTML = VIEWS[r]();
  if (r==="screener") bindScreener();
  if (r==="stages") root.querySelectorAll("[data-band]").forEach(t=>t.onclick=()=>{ S.band=t.dataset.band; render(); });
  if (r==="insurance") root.querySelectorAll("[data-ins]").forEach(t=>t.onclick=()=>{ S.insTab=t.dataset.ins; render(); });
  if (r==="burial") $("#faithsel").onchange = e=>{ S.faith=e.target.value; const y=window.scrollY; render(); window.scrollTo(0,y); };
  if (r==="library"){
    root.querySelectorAll("[data-cat]").forEach(c=>c.onclick=()=>{ S.lib.cat=c.dataset.cat; render(); });
    $("#libmine").onchange = e=>{ S.lib.mine=e.target.checked; render(); };
    const q=$("#libq"); q.oninput = e=>{ S.lib.q=e.target.value; const pos=e.target.selectionStart; render(); const n=$("#libq"); n.focus(); try{n.setSelectionRange(pos,pos);}catch(_){ /* older browsers */ } };
  }
  if (r==="ask"){
    const upd=()=>{ $("#askgo").href = askUrl($("#askq").value.trim()||"how to start building generational wealth.", $("#askprof").checked); };
    $("#askq").oninput=upd; $("#askprof").onchange=upd; upd();
    root.querySelectorAll("[data-topic]").forEach(c=>c.onclick=()=>{ $("#askq").value=c.dataset.topic; upd(); });
    $("#askcopy").onclick=()=>{ const t=$("#askq").value, m=$("#askmsg"); m.hidden=false;
      navigator.clipboard.writeText(t).then(()=>{m.textContent="Copied.";}).catch(()=>{ $("#askq").select(); m.textContent="Press Ctrl+C (or ⌘C) to copy the selected text."; }); };
  }
}
const onHash = ()=>{ render(); window.scrollTo(0,0); $("#view").focus({preventScroll:true}); };
root.addEventListener("click", onClick);
{ const so = $("#lp-signout"); if (so) so.onclick = () => opts.onSignOut && opts.onSignOut(); }
document.addEventListener("keydown", onKey);
window.addEventListener("hashchange", onHash);
render();
return () => {
  root.removeEventListener("click", onClick);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("hashchange", onHash);
};

}

function shellHtml(opts){
  const e = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  return `
<header class="topbar">
  <a class="brand" href="${e(opts.homeHref || "/")}" style="color:inherit;text-decoration:none">
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 22 C 11 22, 11 14, 15 14 S 19 8, 24 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="6" cy="22" r="2.2" fill="currentColor"/><circle cx="15" cy="14" r="2.2" fill="currentColor"/><circle cx="24" cy="8" r="2.2" fill="currentColor"/></svg>
    <div>Legacy Path<small>Certified Training Standards</small></div>
  </a>
  <div class="spacer"></div>
  ${opts.email ? `<span class="hide-sm" style="font-size:.85rem;opacity:.85">${e(opts.email)}</span>` : ""}
  <a class="btn small hide-sm" href="#screener">Retake screener</a>
  <button class="btn small" type="button" id="lp-signout">Sign out</button>
</header>
<div class="layout">
  <nav class="nav" id="nav" aria-label="Sections"></nav>
  <main id="view" tabindex="-1"></main>
  <footer class="foot">
    <div><strong>Education only.</strong> Legacy Path teaches general financial concepts. It is not investment, insurance, tax or legal advice, and Certified Training Standards LLC is not a registered investment adviser, broker-dealer or licensed insurance producer. The "options to explore" come from simple rules applied to your answers. They show topics people in similar situations commonly learn about, not recommendations to buy anything. Laws and limits change and vary by state; confirm with a licensed professional before acting.</div>
    <div>© 2026 Certified Training Standards LLC · 418 Broadway Ste 8N, Albany, NY 12205 · tyrone.pettway@ctsllc.group · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/refunds">Refunds</a></div>
  </footer>
</div>
<div class="scrim" id="scrim" hidden></div>
<aside class="drawer" id="drawer" hidden role="dialog" aria-modal="true" aria-labelledby="dtitle"></aside>`;
}
