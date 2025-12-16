import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'

function CashRunwayChart({ monthly, currency, startingCash, showSpendAllLine: showSpendAllLineProp }) {
  const [showSpendAllLine, setShowSpendAllLine] = useState(showSpendAllLineProp || false)
  
  if (!monthly || monthly.length === 0) return null

  const data = monthly.map((row) => ({
    month: row.monthIndex + 1,
    closingCash: Math.round(row.closingCash),
  }))

  // Calculate the "spend all cash by month 12" line
  // Line goes from startingCash at month 1 to 0 at month 12
  // This is a linear decrease over 11 intervals (month 1 to month 12)
  const calculateSpendAllCash = (month) => {
    if (!showSpendAllLine || !startingCash) return null
    if (month > 12) return null
    // Decrease by startingCash over 11 months (from month 1 to month 12)
    const monthlyDecrease = startingCash / 11
    const cashAtMonth = Math.max(0, startingCash - (monthlyDecrease * (month - 1)))
    return Math.round(cashAtMonth)
  }

  // Merge the spend all line data with the main data
  const chartData = data.map((item) => ({
    ...item,
    spendAllCash: calculateSpendAllCash(item.month),
  }))

  const formatNumber = (value) => Number(value).toLocaleString()

  return (
    <div
      style={{
        width: '100%',
        padding: '0 2rem',
        marginTop: '2rem',
        height: 320, // fixed height; width is responsive
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Cash balance over time</h2>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={showSpendAllLine}
            onChange={(e) => setShowSpendAllLine(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Show "12-Month Steady Spending For Reference" line</span>
        </label>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 10, bottom: 30 }}
        >
          <CartesianGrid stroke="#e0e0e0" />
          <XAxis
            dataKey="month"
            tickLine={false}
            label={{ value: 'Month', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            tickLine={false}
            tickFormatter={formatNumber}
            width={80}
            label={{
              value: 'Cash',
              angle: -90,
              position: 'insideLeft',
              offset: 10,
            }}
          />
          <Tooltip
            formatter={(value, name) => {
              if (value === null) return null
              if (name === 'spendAllCash') {
                return [formatNumber(value), 'Spend all cash by month 12']
              }
              return [formatNumber(value), 'Closing cash']
            }}
            labelFormatter={(label) => `Month ${label}`}
          />
          <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1} />
          <Line
            type="monotone"
            dataKey="closingCash"
            stroke="#2563eb"
            strokeWidth={3}
            dot={false}
            name="Closing cash"
          />
          {showSpendAllLine && (
            <Line
              type="linear"
              dataKey="spendAllCash"
              stroke="#000000"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Spend all cash by month 12"
            />
          )}
          <Legend />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default CashRunwayChart


