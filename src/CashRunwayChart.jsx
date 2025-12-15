import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

function CashRunwayChart({ monthly, currency }) {
  if (!monthly || monthly.length === 0) return null

  const data = monthly.map((row) => ({
    month: row.monthIndex + 1,
    closingCash: Math.round(row.closingCash),
  }))

  const formatCurrency = (value) =>
    `${currency} ${Number(value).toLocaleString()}`

  return (
    <div
      style={{
        width: '50%',
        minWidth: 320,
        margin: '2rem auto',
        height: 260,
      }}
    >
      <h2>Cash balance over time</h2>
      <LineChart
        width={500}
        height={220}
        data={data}
        margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
      >
        <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          label={{ value: 'Month', position: 'insideBottom', offset: -5 }}
        />
        <YAxis tickLine={false} tickFormatter={formatCurrency} width={100} />
        <Tooltip
          formatter={(value) => formatCurrency(value)}
          labelFormatter={(label) => `Month ${label}`}
        />
        <Line
          type="monotone"
          dataKey="closingCash"
          stroke="#8884d8"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </div>
  )
}

export default CashRunwayChart


