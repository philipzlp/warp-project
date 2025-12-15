import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

function CashRunwayChart({ monthly, currency }) {
  if (!monthly || monthly.length === 0) return null

  const data = monthly.map((row) => ({
    month: row.monthIndex + 1,
    closingCash: Math.round(row.closingCash),
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
      <h2 style={{ marginBottom: '0.5rem' }}>Cash balance over time</h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
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
            formatter={(value) => formatNumber(value)}
            labelFormatter={(label) => `Month ${label}`}
          />
          <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1} />
          <Line
            type="monotone"
            dataKey="closingCash"
            stroke="#2563eb"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default CashRunwayChart


