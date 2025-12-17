import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

// Color palette for the pie chart
const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
]

function RoleSpendingPieChart({ scenario, burnResult, currency }) {
  // Calculate total spending per role
  const roleSpending = {}
  let hasData = false
  
  if (scenario && scenario.hires && scenario.hires.length > 0) {
    hasData = true
    const projectionMonths = scenario.projectionMonths || 12
    const multiplier = scenario.employeeCostMultiplier || 1.3

    scenario.hires.forEach((hire) => {
      const startMonth = hire.startMonth || 0
      const endMonth = hire.endMonth != null ? hire.endMonth : projectionMonths - 1
      const activeMonths = Math.max(0, Math.min(endMonth, projectionMonths - 1) - startMonth + 1)
      
      const monthlyCost = (hire.annualSalary / 12) * multiplier
      const totalCost = monthlyCost * activeMonths

      const roleTitle = hire.title
      if (roleSpending[roleTitle]) {
        roleSpending[roleTitle] += totalCost
      } else {
        roleSpending[roleTitle] = totalCost
      }
    })
  }

  // Convert to array format for the pie chart
  const data = Object.entries(roleSpending)
    .map(([name, value]) => ({
      name,
      value: Math.round(value),
    }))
    .sort((a, b) => b.value - a.value) // Sort by value descending

  // If no data, use empty data to show empty circle
  const chartData = data.length === 0 ? [{ name: 'No data yet', value: 100 }] : data

  const formatCurrency = (value) => `${currency} ${Number(value).toLocaleString()}`

  const totalSpending = hasData ? data.reduce((sum, item) => sum + item.value, 0) : 0

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
      <h2 style={{ marginBottom: '1rem', textAlign: 'center', fontWeight: 700, fontSize: '1.25rem' }}>
        Spending by Role
      </h2>
      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="60%"
              cy="50%"
              labelLine={false}
              label={hasData ? ({ percent }) => {
                const percentage = (percent * 100).toFixed(0)
                return percentage + '%'
              } : false}
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
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={hasData ? COLORS[index % COLORS.length] : '#e5e7eb'}
                />
              ))}
            </Pie>
            <Tooltip content={hasData ? <CustomTooltip /> : null} />
            {hasData && (
              <Legend
                content={<CustomLegend />}
                verticalAlign="middle"
                align="left"
                wrapperStyle={{ left: 0, width: '25%' }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default RoleSpendingPieChart

