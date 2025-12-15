// Simple MVP engine for headcount and runway calculations

// ----- Data model types (informal, for reference) -----
// type Hire = {
//   id: string
//   title: string
//   annualSalary: number
//   startMonth: number
//   endMonth?: number
// }
//
// type NonHeadcountCost = {
//   id: string
//   label: string
//   monthlyAmount: number
//   startMonth: number
//   endMonth?: number
//   isOneTime?: boolean  // If true, this cost is applied only in startMonth, not recurring
// }
//
// type ScenarioInput = {
//   id: string
//   name: string
//   startingCash: number
//   currency: string
//   projectionMonths: number
//   employeeCostMultiplier: number
//   hires: Hire[]
//   nonHeadcountCosts: NonHeadcountCost[]
// }

export const seedStageScenario = {
  id: 'scenario_seed_mvp',
  name: 'Seed-Stage SaaS Plan',
  startingCash: 1_500_000,
  currency: 'USD',
  projectionMonths: 24,
  employeeCostMultiplier: 1.3,
  hires: [
    {
      id: 'hire_ceo',
      title: 'Founder / CEO',
      annualSalary: 180_000,
      startMonth: 0,
    },
    {
      id: 'hire_cto',
      title: 'Founder / CTO',
      annualSalary: 180_000,
      startMonth: 0,
    },
    {
      id: 'hire_eng1',
      title: 'Senior Software Engineer',
      annualSalary: 180_000,
      startMonth: 0,
    },
    {
      id: 'hire_ae1',
      title: 'Account Executive',
      annualSalary: 140_000,
      startMonth: 3,
    },
    {
      id: 'hire_designer1',
      title: 'Product Designer',
      annualSalary: 150_000,
      startMonth: 6,
    },
    {
      id: 'hire_eng2',
      title: 'Mid-level Software Engineer',
      annualSalary: 160_000,
      startMonth: 9,
    },
  ],
  nonHeadcountCosts: [
    {
      id: 'cost_rent',
      label: 'Office & Workspace',
      monthlyAmount: 8_000,
      startMonth: 0,
    },
    {
      id: 'cost_software',
      label: 'Software & Tools',
      monthlyAmount: 3_000,
      startMonth: 0,
    },
    {
      id: 'cost_legal',
      label: 'Legal & Accounting',
      monthlyAmount: 2_000,
      startMonth: 0,
    },
    {
      id: 'cost_marketing',
      label: 'Marketing',
      monthlyAmount: 5_000,
      startMonth: 6,
    },
  ],
}

// Predefined roles for the custom "what-if" drag-and-drop scenario
export const availableRoles = [
  { id: 'role_founder_ceo', title: 'Founder / CEO', annualSalary: 180_000 },
  { id: 'role_founder_cto', title: 'Founder / CTO', annualSalary: 180_000 },
  { id: 'role_senior_eng', title: 'Senior Software Engineer', annualSalary: 180_000 },
  { id: 'role_mid_eng', title: 'Mid-level Software Engineer', annualSalary: 160_000 },
  { id: 'role_ae', title: 'Account Executive', annualSalary: 140_000 },
  { id: 'role_designer', title: 'Product Designer', annualSalary: 150_000 },
]

// A simple "aggressive hiring" scenario to support basic what-if comparisons
export const aggressiveHiringScenario = {
  ...seedStageScenario,
  id: 'scenario_aggressive',
  name: 'Aggressive Hiring Plan',
  // Same starting cash, but more people added earlier
  hires: [
    ...seedStageScenario.hires,
    {
      id: 'hire_eng3',
      title: 'Senior Software Engineer',
      annualSalary: 185_000,
      startMonth: 3,
    },
    {
      id: 'hire_ae2',
      title: 'Account Executive',
      annualSalary: 145_000,
      startMonth: 6,
    },
  ],
}

// A "conservative" scenario with slower, more cautious hiring
export const conservativeScenario = {
  ...seedStageScenario,
  id: 'scenario_conservative',
  name: 'Conservative Plan',
  // Same starting cash, but fewer hires spread out more slowly
  hires: [
    {
      id: 'hire_ceo_conservative',
      title: 'Founder / CEO',
      annualSalary: 180_000,
      startMonth: 0,
    },
    {
      id: 'hire_cto_conservative',
      title: 'Founder / CTO',
      annualSalary: 180_000,
      startMonth: 0,
    },
    // First engineer comes later
    {
      id: 'hire_eng1_conservative',
      title: 'Senior Software Engineer',
      annualSalary: 180_000,
      startMonth: 3,
    },
    // Sales hire much later
    {
      id: 'hire_ae1_conservative',
      title: 'Account Executive',
      annualSalary: 140_000,
      startMonth: 9,
    },
    // Designer comes even later
    {
      id: 'hire_designer1_conservative',
      title: 'Product Designer',
      annualSalary: 150_000,
      startMonth: 15,
    },
  ],
}

export function runBurnRate(scenario) {
  const monthly = []

  let previousClosingCash = scenario.startingCash
  let totalPayrollCost = 0
  let totalNonHeadcountCost = 0
  let totalBurn = 0
  let firstNegativeMonth = null

  for (let monthIndex = 0; monthIndex < scenario.projectionMonths; monthIndex += 1) {
    // Active hires
    const activeHires = scenario.hires.filter((hire) => {
      const starts = hire.startMonth <= monthIndex
      const ends = hire.endMonth == null || monthIndex <= hire.endMonth
      return starts && ends
    })

    const activeHiresCount = activeHires.length

    const payrollCost = activeHires.reduce((sum, hire) => {
      const monthlyBase = hire.annualSalary / 12
      const fullyLoaded = monthlyBase * scenario.employeeCostMultiplier
      return sum + fullyLoaded
    }, 0)

    // Active non-headcount costs
    const activeCosts = scenario.nonHeadcountCosts.filter((cost) => {
      // For one-time costs, only apply in the exact month
      if (cost.isOneTime) {
        return cost.startMonth === monthIndex
      }
      // For recurring costs, check if within the active period
      const starts = cost.startMonth <= monthIndex
      const ends = cost.endMonth == null || monthIndex <= cost.endMonth
      return starts && ends
    })

    const nonHeadcountCost = activeCosts.reduce((sum, cost) => {
      return sum + cost.monthlyAmount
    }, 0)

    const totalCost = payrollCost + nonHeadcountCost
    const burn = totalCost
    const closingCash = previousClosingCash - totalCost

    if (firstNegativeMonth === null && closingCash < 0) {
      firstNegativeMonth = monthIndex
    }

    totalPayrollCost += payrollCost
    totalNonHeadcountCost += nonHeadcountCost
    totalBurn += burn

    monthly.push({
      monthIndex,
      activeHires: activeHiresCount,
      payrollCost,
      nonHeadcountCost,
      totalCost,
      burn,
      closingCash,
    })

    previousClosingCash = closingCash
  }

  const summary = {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    currency: scenario.currency,
    startingCash: scenario.startingCash,
    endingCash: previousClosingCash,
    totalPayrollCost,
    totalNonHeadcountCost,
    averageMonthlyBurn: totalBurn / scenario.projectionMonths,
    firstNegativeMonth,
  }

  return { scenario, monthly, summary }
}

export function estimateRunway(result) {
  const { summary, monthly } = result
  const { startingCash, endingCash, averageMonthlyBurn, firstNegativeMonth, currency, scenarioId, scenarioName } =
    summary

  const currentMonthlyBurn = monthly[0] ? monthly[0].burn : 0

  let runwayMonths = null
  let cashOutMonth = null
  let hasRunwayEnd = false

  if (firstNegativeMonth != null) {
    hasRunwayEnd = true
    runwayMonths = firstNegativeMonth + 1
    cashOutMonth = firstNegativeMonth
  }

  let staticRunwayMonths = null
  if (currentMonthlyBurn > 0) {
    staticRunwayMonths = startingCash / currentMonthlyBurn
  }

  const veryShortRunway = runwayMonths != null && runwayMonths < 6
  const safeRunway = runwayMonths != null && runwayMonths >= 18

  return {
    scenarioId,
    scenarioName,
    currency,
    hasRunwayEnd,
    runwayMonths,
    cashOutMonth,
    startingCash,
    endingCash,
    averageMonthlyBurn,
    currentMonthlyBurn,
    staticRunwayMonths,
    veryShortRunway,
    safeRunway,
  }
}


