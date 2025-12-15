import './App.css'
import { useState, useEffect } from 'react'
import {
  seedStageScenario,
  aggressiveHiringScenario,
  conservativeScenario,
  availableRoles,
  runBurnRate,
  estimateRunway,
} from './engine'
import CashRunwayChart from './CashRunwayChart.jsx'

const STORAGE_KEY = 'warp-project-saved-scenarios'

const baseCustomNonHeadcount = seedStageScenario.nonHeadcountCosts.reduce(
  (sum, cost) => sum + cost.monthlyAmount,
  0,
)

function App() {
  const [selectedView, setSelectedView] = useState('seed') // 'seed' | 'aggressive' | 'conservative' | 'custom' | 'saved'
  const [savedScenarios, setSavedScenarios] = useState(() => {
    // Load saved scenarios from localStorage on initial mount
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to load saved scenarios from localStorage:', error)
    }
    return []
  })
  const [selectedSavedId, setSelectedSavedId] = useState(null)

  // Save savedScenarios to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedScenarios))
    } catch (error) {
      console.error('Failed to save scenarios to localStorage:', error)
    }
  }, [savedScenarios])

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

  let currentScenario = seedStageScenario
  if (selectedView === 'aggressive') {
    currentScenario = aggressiveHiringScenario
  } else if (selectedView === 'conservative') {
    currentScenario = conservativeScenario
  } else if (selectedView === 'custom') {
    currentScenario = customScenario
  } else if (selectedView === 'saved') {
    const found = savedScenarios.find((s) => s.id === selectedSavedId)
    currentScenario = found || seedStageScenario
  }

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

  function handleSaveCurrentScenario() {
    const nameInput = window.prompt(
      'Name for this scenario (e.g. With senior exec)',
    )
    if (!nameInput) return
    const trimmed = nameInput.trim()
    if (!trimmed) return

    const id = `saved_${Date.now()}`
    const snapshot = {
      ...customScenario,
      id,
      name: trimmed,
    }

    setSavedScenarios((prev) => [...prev, snapshot])
    setSelectedView('saved')
    setSelectedSavedId(id)
  }

  function handleDeleteSavedScenario(scenarioId, event) {
    event.stopPropagation() // Prevent triggering the button's onClick
    if (window.confirm('Are you sure you want to delete this scenario?')) {
      setSavedScenarios((prev) => prev.filter((s) => s.id !== scenarioId))
      // If the deleted scenario was selected, switch back to seed view
      if (selectedView === 'saved' && selectedSavedId === scenarioId) {
        setSelectedView('seed')
        setSelectedSavedId(null)
      }
    }
  }

  function handleDeleteHire(hireId) {
    setCustomScenario((prev) => ({
      ...prev,
      hires: prev.hires.filter((hire) => hire.id !== hireId),
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
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        margin: 0,
        padding: 0,
      }}
    >
      {/* Left Sidebar */}
      <aside
        style={{
          width: '220px',
          backgroundColor: '#000',
          color: '#fff',
          padding: '1.5rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
          Scenarios
        </h2>
        <button
          onClick={() => setSelectedView('custom')}
          style={{
            width: '100%',
            textAlign: 'center',
            padding: '0.7rem 0.8rem',
            borderRadius: '8px',
            border: selectedView === 'custom' ? '3px solid #2650e6' : '2px solid #2650e6',
            backgroundColor: selectedView === 'custom' ? '#333' : '#000',
            color: '#fff',
            fontWeight: selectedView === 'custom' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '1rem',
            marginBottom: '1rem',
            boxSizing: 'border-box',
            transition: 'background 0.2s, border-color 0.2s',
          }}
        >
          Create New Plan +
        </button>
        <hr
          style={{
            border: 'none',
            borderTop: '1px solid #333',
            margin: '1rem 0 0.5rem',
          }}
        />
        <h3
          style={{
            fontSize: '0.85rem',
            fontWeight: 500,
            margin: '0 0 0.5rem',
            color: '#ccc',
          }}
        >
          Suggested Schedules
        </h3>
        <button
          onClick={() => setSelectedView('seed')}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '0.6rem 0.8rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: selectedView === 'seed' ? '#333' : 'transparent',
            color: '#fff',
            fontWeight: selectedView === 'seed' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.9rem',
            marginBottom: '0.3rem',
          }}
        >
          Seed plan
        </button>
        <button
          onClick={() => setSelectedView('aggressive')}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '0.6rem 0.8rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: selectedView === 'aggressive' ? '#333' : 'transparent',
            color: '#fff',
            fontWeight: selectedView === 'aggressive' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.9rem',
            marginBottom: '0.3rem',
          }}
        >
          Aggressive plan
        </button>
        <button
          onClick={() => setSelectedView('conservative')}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '0.6rem 0.8rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: selectedView === 'conservative' ? '#333' : 'transparent',
            color: '#fff',
            fontWeight: selectedView === 'conservative' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.9rem',
            marginBottom: '0.8rem',
          }}
        >
          Conservative plan
        </button>
        {savedScenarios.length > 0 && (
          <>
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid #333',
                margin: '1rem 0 0.5rem',
              }}
            />
            <h3
              style={{
                fontSize: '0.85rem',
                fontWeight: 500,
                margin: '0 0 0.5rem',
                color: '#ccc',
              }}
            >
              Saved Scenarios
            </h3>
            {savedScenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => {
                  setSelectedView('saved')
                  setSelectedSavedId(scenario.id)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor:
                    selectedView === 'saved' && selectedSavedId === scenario.id
                      ? '#333'
                      : 'transparent',
                  color: '#fff',
                  fontWeight:
                    selectedView === 'saved' && selectedSavedId === scenario.id
                      ? 600
                      : 400,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <span style={{ flex: 1 }}>{scenario.name}</span>
                <button
                  onClick={(e) => handleDeleteSavedScenario(scenario.id, e)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#999',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    padding: '0.2rem 0.4rem',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#444'
                    e.target.style.color = '#fff'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'transparent'
                    e.target.style.color = '#999'
                  }}
                  title="Delete this scenario"
                >
                  🗑️
                </button>
              </button>
            ))}
          </>
        )}
      </aside>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '1.5rem 1rem 3rem',
        }}
      >
        <h1>Headcount & Runway Planner (MVP)</h1>
        <div className="card">
          <h2>Summary</h2>
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
              ? `${runway.runwayMonths}
                months`
              : 'No cash-out within projection window'}
        </p>
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
            <button
              onClick={handleSaveCurrentScenario}
              style={{
                width: '100%',
                marginBottom: '0.75rem',
                padding: '0.35rem 0.5rem',
                borderRadius: '999px',
                border: '1px solid #1a73e8',
                backgroundColor: '#fff',
                color: '#1a73e8',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save this scenario
            </button>
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
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.3rem',
                        }}
                      >
                        <span style={{ flex: 1 }}>{hire.title}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteHire(hire.id)
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#666',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            padding: '0.1rem 0.3rem',
                            borderRadius: '4px',
                            lineHeight: 1,
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#ff4444'
                            e.target.style.color = '#fff'
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = 'transparent'
                            e.target.style.color = '#666'
                          }}
                          title="Delete this hire"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
        <h2>Monthly breakdown (MVP)</h2>
      <p className="read-the-docs">
          All data is pre-configured for a typical seed-stage SaaS plan.
        </p>
        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}
          >
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>
                  Month
                </th>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>
                  Active hires
                </th>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>
                  Payroll
                </th>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>
                  Non-headcount
                </th>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>
                  Total burn
                </th>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>
                  Closing cash
                </th>
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
        <CashRunwayChart
          monthly={burnResult.monthly}
          currency={seedStageScenario.currency}
        />
      </main>
    </div>
  )
}

export default App
