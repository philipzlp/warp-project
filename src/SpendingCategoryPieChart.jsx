import { useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

// Color palette for the spending categories
const CATEGORY_COLORS = {
  headcount: '#3b82f6', // blue
  fixedNonHeadcount: '#ef4444', // red
  recurringNonHeadcount: '#10b981', // green
  warpSavings: '#8b5cf6', // purple
}

const WARP_SAVINGS_AMOUNT = 50000

function SpendingCategoryPieChart({ scenario, burnResult, currency }) {
  const [showWarpSavings, setShowWarpSavings] = useState(false)

  if (!scenario || !burnResult) {
    return null
  }

  const formatCurrency = (value) => `${currency} ${Number(value).toLocaleString()}`

  // Get total headcount spending from the summary
  const totalHeadcount = burnResult.summary?.totalPayrollCost || 0

  // Calculate fixed (one-time) and recurring non-headcount costs
  let totalFixedNonHeadcount = 0
  let totalRecurringNonHeadcount = 0

  if (scenario.nonHeadcountCosts) {
    scenario.nonHeadcountCosts.forEach((cost) => {
      if (cost.isOneTime) {
        // One-time costs are applied only once
        totalFixedNonHeadcount += cost.monthlyAmount
      } else {
        // Recurring costs: calculate total over active months
        const startMonth = cost.startMonth || 0
        const endMonth = cost.endMonth != null ? cost.endMonth : (scenario.projectionMonths || 12) - 1
        const activeMonths = Math.max(0, Math.min(endMonth, (scenario.projectionMonths || 12) - 1) - startMonth + 1)
        totalRecurringNonHeadcount += cost.monthlyAmount * activeMonths
      }
    })
  }

  // Prepare data for pie chart
  let data = [
    {
      name: 'Headcount',
      value: Math.round(totalHeadcount),
      color: CATEGORY_COLORS.headcount,
    },
    {
      name: 'Fixed Non-Headcount',
      value: Math.round(totalFixedNonHeadcount),
      color: CATEGORY_COLORS.fixedNonHeadcount,
    },
    {
      name: 'Recurring Non-Headcount',
      value: Math.round(totalRecurringNonHeadcount),
      color: CATEGORY_COLORS.recurringNonHeadcount,
    },
  ]

  // Add Warp Savings slice if toggle is on
  if (showWarpSavings) {
    data.push({
      name: 'Warp Savings',
      value: WARP_SAVINGS_AMOUNT,
      color: CATEGORY_COLORS.warpSavings,
    })
  }

  data = data.filter((item) => item.value > 0) // Only show categories with spending

  if (data.length === 0) return null

  const totalSpending = data.reduce((sum, item) => sum + item.value, 0)

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      const total = data.payload.value
      const percentage = ((total / totalSpending) * 100).toFixed(1)
      return (
        <div
          style={{
            backgroundColor: '#fff',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>{data.name}</p>
          <p style={{ margin: '0.25rem 0 0', color: '#666' }}>
            {formatCurrency(total)} ({percentage}%)
          </p>
        </div>
      )
    }
    return null
  }

  const CustomLegend = ({ payload }) => {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          padding: '1rem',
        }}
      >
        {payload.map((entry, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <div
              style={{
                width: '14px',
                height: '14px',
                backgroundColor: entry.color,
                borderRadius: '3px',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.9rem', color: '#333' }}>{entry.value}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        padding: '0 2rem',
        marginTop: '3rem',
        marginBottom: '2rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0, textAlign: 'center' }}>
          Spending by Category
        </h2>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          <input
            type="checkbox"
            checked={showWarpSavings}
            onChange={(e) => setShowWarpSavings(e.target.checked)}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
            }}
          />
          <span>Show the value of saving with Warp</span>
        </label>
      </div>
      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="60%"
              cy="50%"
              labelLine={false}
              label={({ percent }) => {
                const percentage = (percent * 100).toFixed(0)
                return percentage + '%'
              }}
              labelStyle={{
                fill: '#fff',
                fontSize: '14px',
                fontWeight: 'bold',
                textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
              }}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              content={<CustomLegend />}
              verticalAlign="middle"
              align="left"
              wrapperStyle={{ left: 0, width: '25%' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default SpendingCategoryPieChart

