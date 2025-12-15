import './App.css'
import { useState } from 'react'
import {
  seedStageScenario,
  aggressiveHiringScenario,
  availableRoles,
  runBurnRate,
  estimateRunway,
} from './engine'
import CashRunwayChart from './CashRunwayChart.jsx'

const baseCustomNonHeadcount = seedStageScenario.nonHeadcountCosts.reduce(
  (sum, cost) => sum + cost.monthlyAmount,
  0,
)

function App() {
  const [selectedView, setSelectedView] = useState('seed') // 'seed' | 'aggressive' | 'custom'

  const [customScenario, setCustomScenario] = useState({
    ...seedStageScenario,
    id: 'scenario_custom',
    name: 'Custom what-if plan',
    hires: [],
    projectionMonths: 12,
    startingCash: seedStageScenario.startingCash,
    nonHeadcountCosts: [
      {
        id: 'custom_non_headcount',
        label: 'Non-headcount costs',
        monthlyAmount: baseCustomNonHeadcount,
        startMonth: 0,
      },
    ],
  })

  const currentScenario =
    selectedView === 'aggressive'
      ? aggressiveHiringScenario
      : selectedView === 'custom'
      ? customScenario
      : seedStageScenario

  // Run the engine once for the currently selected scenario
  const burnResult = runBurnRate(currentScenario)
  const runway = estimateRunway(burnResult)

  const months = Array.from({ length: 12 }, (_, i) => i)

  function handleRoleDragStart(roleId, event) {
    event.dataTransfer.setData('text/plain', roleId)
  }

  function handleMonthDragOver(event) {
    event.preventDefault()
  }

  function handleMonthDrop(monthIndex, event) {
    event.preventDefault()
    const roleId = event.dataTransfer.getData('text/plain')
    const role = availableRoles.find((r) => r.id === roleId)
    if (!role) return

    setCustomScenario((prev) => ({
      ...prev,
      hires: [
        ...prev.hires,
        {
          id: `${role.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: role.title,
          annualSalary: role.annualSalary,
          startMonth: monthIndex,
        },
      ],
    }))
  }

  function handleCustomStartingCashChange(event) {
    const raw = event.target.value.replace(/,/g, '')
    const value = Number(raw) || 0
    setCustomScenario((prev) => ({
      ...prev,
      startingCash: value,
    }))
  }

  function handleCustomNonHeadcountChange(event) {
    const raw = event.target.value.replace(/,/g, '')
    const value = Number(raw) || 0
    setCustomScenario((prev) => ({
      ...prev,
      nonHeadcountCosts: prev.nonHeadcountCosts.map((cost) =>
        cost.id === 'custom_non_headcount'
          ? { ...cost, monthlyAmount: value }
          : cost,
      ),
    }))
  }

  // Temporary debug output so we can inspect the math in the browser console
  // (We'll remove or refine this once we're happy with the numbers.)
  console.log('Seed-stage scenario:', seedStageScenario)
  console.log('First 3 monthly rows:', burnResult.monthly.slice(0, 3))
  console.log('Runway estimate:', runway)

  return (
    <div
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '1.5rem 1rem 3rem',
      }}
    >
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setSelectedView('seed')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '999px',
            border:
              selectedView === 'seed'
                ? '2px solid #1a73e8'
                : '1px solid #ccc',
            backgroundColor:
              selectedView === 'seed'
                ? '#e8f0fe'
                : '#fff',
            fontWeight:
              selectedView === 'seed'
                ? '600'
                : '500',
            cursor: 'pointer',
          }}
        >
          Seed plan
        </button>
        <button
          onClick={() => setSelectedView('aggressive')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '999px',
            border:
              selectedView === 'aggressive'
                ? '2px solid #1a73e8'
                : '1px solid #ccc',
            backgroundColor:
              selectedView === 'aggressive'
                ? '#e8f0fe'
                : '#fff',
            fontWeight:
              selectedView === 'aggressive'
                ? '600'
                : '500',
            cursor: 'pointer',
          }}
        >
          Aggressive plan
        </button>
        <button
          onClick={() => setSelectedView('custom')}
          style={{
            padding: '0.5rem 1rem',
            marginLeft: '0.5rem',
            borderRadius: '999px',
            border:
              selectedView === 'custom'
                ? '2px solid #1a73e8'
                : '1px solid #ccc',
            backgroundColor:
              selectedView === 'custom'
                ? '#e8f0fe'
                : '#fff',
            fontWeight:
              selectedView === 'custom'
                ? '600'
                : '500',
            cursor: 'pointer',
          }}
        >
          Custom what-if
        </button>
      </div>
      <h1>Headcount & Runway Planner (MVP)</h1>
      <div className="card">
        <p>
          <strong>Scenario:</strong> {currentScenario.name}
        </p>
        <p>
          <strong>Starting cash:</strong> {currentScenario.currency}{' '}
          {currentScenario.startingCash.toLocaleString()}
        </p>
        <p>
          <strong>Average monthly burn (MVP engine):</strong>{' '}
          {currentScenario.currency}{' '}
          {Math.round(runway.averageMonthlyBurn).toLocaleString()}
        </p>
        <p>
          <strong>Estimated runway:</strong>{' '}
          {runway.hasRunwayEnd
            ? `${runway.runwayMonths} months (cash out around month ${runway.cashOutMonth + 1})`
            : 'No cash-out within projection window'}
        </p>
      </div>
      <h2>Monthly breakdown (MVP)</h2>
      <p className="read-the-docs">
        All data is pre-configured for a typical seed-stage SaaS plan.
      </p>
      <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>Month</th>
              <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>Active hires</th>
              <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>Payroll</th>
              <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>Non-headcount</th>
              <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>Total burn</th>
              <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>Closing cash</th>
            </tr>
          </thead>
          <tbody>
            {burnResult.monthly.map((row) => (
              <tr key={row.monthIndex}>
                <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>
                  {row.monthIndex + 1}
                </td>
                <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>
                  {row.activeHires}
                </td>
                <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>
                  {currentScenario.currency}{' '}
                  {Math.round(row.payrollCost).toLocaleString()}
                </td>
                <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>
                  {currentScenario.currency}{' '}
                  {Math.round(row.nonHeadcountCost).toLocaleString()}
                </td>
                <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>
                  {currentScenario.currency}{' '}
                  {Math.round(row.totalCost).toLocaleString()}
                </td>
                <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>
                  {currentScenario.currency}{' '}
                  {Math.round(row.closingCash).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedView === 'custom' && (
        <div
          style={{
            marginTop: '2rem',
            display: 'flex',
            gap: '1.5rem',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'nowrap',
            overflowX: 'auto',
          }}
        >
          <div
            style={{
              flex: '0 0 260px',
              maxWidth: '260px',
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '1rem',
              textAlign: 'center',
            }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>Roles to add</h3>
            <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.4rem' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.2rem',
                    fontWeight: 600,
                  }}
                >
                  Starting cash
                </label>
                <input
                  type="number"
                  value={customScenario.startingCash}
                  onChange={handleCustomStartingCashChange}
                  style={{
                    width: '80%',
                    padding: '0.3rem 0.4rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.2rem',
                    fontWeight: 600,
                  }}
                >
                  Monthly non‑headcount
                </label>
                <input
                  type="number"
                  value={
                    customScenario.nonHeadcountCosts[0]
                      ? customScenario.nonHeadcountCosts[0].monthlyAmount
                      : 0
                  }
                  onChange={handleCustomNonHeadcountChange}
                  style={{
                    width: '80%',
                    padding: '0.3rem 0.4rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                  }}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: '0.75rem' }}>
              Drag a role into a month to add a hire starting that month.
            </p>
            {availableRoles.map((role) => (
              <div
                key={role.id}
                draggable
                onDragStart={(event) => handleRoleDragStart(role.id, event)}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '999px',
                  padding: '0.4rem 0.75rem',
                  marginBottom: '0.4rem',
                  fontSize: '0.85rem',
                  cursor: 'grab',
                  backgroundColor: '#fff',
                }}
              >
                <strong>{role.title}</strong>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#666' }}>
                  {currentScenario.currency} {role.annualSalary.toLocaleString()}/yr
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              flex: '1 1 auto',
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>12‑month hiring schedule</h3>
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto',
                paddingRight: '0.5rem',
              }}
            >
              {months.map((monthIndex) => {
                const hiresThisMonth = customScenario.hires.filter(
                  (h) => h.startMonth === monthIndex,
                )
                return (
                  <div
                    key={monthIndex}
                    onDragOver={handleMonthDragOver}
                    onDrop={(event) => handleMonthDrop(monthIndex, event)}
                    style={{
                      flex: '1 1 0',
                      minWidth: 70,
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      padding: '0.5rem',
                      minHeight: '180px',
                      backgroundColor: '#fafafa',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '0.25rem',
                      }}
                    >
                      M{monthIndex + 1}
                    </div>
                    {hiresThisMonth.map((hire) => (
                      <div
                        key={hire.id}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.4rem',
                          borderRadius: '999px',
                          backgroundColor: '#e3f2fd',
                          marginBottom: '0.25rem',
                        }}
                      >
                        {hire.title}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      <CashRunwayChart
        monthly={burnResult.monthly}
        currency={seedStageScenario.currency}
      />
    </div>
  )
}

export default App
