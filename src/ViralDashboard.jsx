import { useState, useEffect } from 'react'
import {
  seedStageScenario,
  availableRoles,
  runBurnRate,
  estimateRunway,
} from './engine'
import { getAISuggestions } from './engine/ai.js'
import CashRunwayChart from './CashRunwayChart.jsx'

// ID generator
let __viralIdCounter = 0
function makeViralId(prefix) {
  __viralIdCounter += 1
  return `${prefix}_${__viralIdCounter}_${Math.random().toString(36).slice(2, 7)}`
}

function ViralDashboard({ 
  currentScenario, 
  burnResult, 
  runway,
  onScenarioChange,
  onGenerateAI,
}) {
  const [localScenario, setLocalScenario] = useState(currentScenario)
  const [expenseForm, setExpenseForm] = useState({
    label: '',
    amount: '',
    isOneTime: false,
    month: 0,
  })
  const [projectionMonths, setProjectionMonths] = useState(currentScenario.projectionMonths || 12)

  // Update local scenario when currentScenario changes
  useEffect(() => {
    setLocalScenario(currentScenario)
    setProjectionMonths(currentScenario.projectionMonths || 12)
  }, [currentScenario])

  // Recalculate when local scenario changes
  const months = Array.from({ length: projectionMonths }, (_, i) => i)
  
  const handleAddExpense = () => {
    const amount = Number(expenseForm.amount) || 0
    if (!expenseForm.label.trim() || amount <= 0) {
      alert('Please enter a valid expense name and amount! 💸')
      return
    }

    const newExpense = {
      id: makeViralId('viral_expense'),
      label: expenseForm.label.trim(),
      monthlyAmount: amount,
      startMonth: expenseForm.month,
      isOneTime: expenseForm.isOneTime,
    }

    const updatedScenario = {
      ...localScenario,
      nonHeadcountCosts: [...localScenario.nonHeadcountCosts, newExpense],
    }
    
    setLocalScenario(updatedScenario)
    onScenarioChange(updatedScenario)
    
    // Reset form
    setExpenseForm({
      label: '',
      amount: '',
      isOneTime: false,
      month: 0,
    })
  }

  const handleDeleteExpense = (expenseId) => {
    const updatedScenario = {
      ...localScenario,
      nonHeadcountCosts: localScenario.nonHeadcountCosts.filter((cost) => cost.id !== expenseId),
    }
    setLocalScenario(updatedScenario)
    onScenarioChange(updatedScenario)
  }

  const handleProjectionMonthsChange = (newMonths) => {
    const clamped = Math.max(6, Math.min(60, newMonths))
    setProjectionMonths(clamped)
    const updatedScenario = {
      ...localScenario,
      projectionMonths: clamped,
    }
    setLocalScenario(updatedScenario)
    onScenarioChange(updatedScenario)
  }

  const handleExpenseDragStart = (expenseId, event) => {
    event.dataTransfer.setData('text/plain', `expense_${expenseId}`)
  }

  const handleMonthDragOver = (event) => {
    event.preventDefault()
  }

  const handleMonthDrop = (monthIndex, event) => {
    event.preventDefault()
    const data = event.dataTransfer.getData('text/plain')
    if (data.startsWith('expense_')) {
      const expenseId = data.replace('expense_', '')
      const expense = localScenario.nonHeadcountCosts.find((e) => e.id === expenseId)
      if (expense) {
        const updatedScenario = {
          ...localScenario,
          nonHeadcountCosts: localScenario.nonHeadcountCosts.map((e) =>
            e.id === expenseId ? { ...e, startMonth: monthIndex } : e
          ),
        }
        setLocalScenario(updatedScenario)
        onScenarioChange(updatedScenario)
      }
    }
  }

  // Calculate "death clock" - when cash runs out
  const deathDate = runway.hasRunwayEnd 
    ? new Date(Date.now() + runway.runwayMonths * 30 * 24 * 60 * 60 * 1000)
    : null

  const formatDeathClock = () => {
    if (!deathDate) return '∞ (You\'re immortal!)'
    const now = new Date()
    const diff = deathDate - now
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    return `${days} days, ${hours} hours`
  }

  const getRunwayEmoji = () => {
    if (!runway.hasRunwayEnd) return '🦄'
    if (runway.runwayMonths < 3) return '💀'
    if (runway.runwayMonths < 6) return '🔥'
    if (runway.runwayMonths < 12) return '⚠️'
    return '✅'
  }

  const shareText = `🚀 My startup's runway: ${runway.hasRunwayEnd ? `${runway.runwayMonths} months` : 'Infinite!'} 

💰 Starting cash: ${currentScenario.currency} ${currentScenario.startingCash.toLocaleString()}
📊 Monthly burn: ${currentScenario.currency} ${Math.round(runway.averageMonthlyBurn).toLocaleString()}

Plan your startup's growth: [link]`

  const handleShare = (platform) => {
    const url = window.location.href
    const text = encodeURIComponent(shareText)
    
    if (platform === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, '_blank')
    } else if (platform === 'linkedin') {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank')
    }
  }

  return (
    <div style={{ 
      padding: '2rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      color: '#fff',
    }}>
      {/* Hero Section */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ 
          fontSize: '4rem', 
          fontWeight: 800, 
          margin: '0 0 1rem 0',
          textShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {getRunwayEmoji()} Your Runway Death Clock {getRunwayEmoji()}
        </h1>
        <p style={{ fontSize: '1.5rem', opacity: 0.9, margin: 0 }}>
          How long until your startup runs out of cash? 💸
        </p>
      </div>

      {/* Death Clock Card */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '3rem',
        marginBottom: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '6rem', marginBottom: '1rem' }}>
          {runway.hasRunwayEnd ? '⏰' : '🦄'}
        </div>
        <h2 style={{ 
          fontSize: '3rem', 
          color: runway.hasRunwayEnd && runway.runwayMonths < 6 ? '#ef4444' : '#10b981',
          margin: '0 0 1rem 0',
          fontWeight: 700,
        }}>
          {runway.hasRunwayEnd 
            ? `${runway.runwayMonths} months` 
            : 'Infinite Runway!'}
        </h2>
        {runway.hasRunwayEnd && (
          <div style={{ fontSize: '1.5rem', color: '#6b7280', marginBottom: '2rem' }}>
            Time remaining: {formatDeathClock()}
          </div>
        )}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '1rem',
          marginTop: '2rem',
        }}>
          <div style={{ 
            padding: '1.5rem', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '12px',
            color: '#1f2937',
          }}>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 }}>
              Starting Cash
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>
              {currentScenario.currency} {currentScenario.startingCash.toLocaleString()}
            </div>
          </div>
          <div style={{ 
            padding: '1.5rem', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '12px',
            color: '#1f2937',
          }}>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 }}>
              Monthly Burn
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>
              {currentScenario.currency} {Math.round(runway.averageMonthlyBurn).toLocaleString()}
            </div>
          </div>
          <div style={{ 
            padding: '1.5rem', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '12px',
            color: '#1f2937',
          }}>
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.7 }}>
              Active Hires
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>
              {currentScenario.hires.length}
            </div>
          </div>
        </div>
      </div>

      {/* Expense Management */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ fontSize: '1.5rem', color: '#1f2937', marginBottom: '1.5rem' }}>
          💰 Add Expenses
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#1f2937', fontWeight: 600 }}>
              Expense Name
            </label>
            <input
              type="text"
              value={expenseForm.label}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="e.g., New Office, Marketing Campaign"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '2px solid #e5e7eb',
                fontSize: '1rem',
                color: '#000000',
                backgroundColor: '#ffffff',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#1f2937', fontWeight: 600 }}>
              Amount ({currentScenario.currency})
            </label>
            <input
              type="number"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="10000"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '2px solid #e5e7eb',
                fontSize: '1rem',
                color: '#000000',
                backgroundColor: '#ffffff',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1f2937', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={!expenseForm.isOneTime}
                onChange={() => setExpenseForm((prev) => ({ ...prev, isOneTime: false }))}
              />
              <span>Monthly Recurring</span>
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1f2937', cursor: 'pointer' }}>
              <input
                type="radio"
                checked={expenseForm.isOneTime}
                onChange={() => setExpenseForm((prev) => ({ ...prev, isOneTime: true }))}
              />
              <span>One-time</span>
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#1f2937', fontWeight: 600 }}>
              Start Month
            </label>
            <select
              value={expenseForm.month}
              onChange={(e) => setExpenseForm((prev) => ({ ...prev, month: Number(e.target.value) }))}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '2px solid #e5e7eb',
                fontSize: '1rem',
                color: '#000000',
                backgroundColor: '#ffffff',
              }}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  Month {m + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleAddExpense}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: '#667eea',
            color: '#fff',
            fontSize: '1.1rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
          }}
        >
          ➕ Add Expense
        </button>

        {/* Expense List - Draggable */}
        {localScenario.nonHeadcountCosts.filter((c) => c.id !== 'custom_non_headcount' && !c.id?.startsWith('cost_')).length > 0 && (
          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
            <h4 style={{ fontSize: '1.2rem', color: '#1f2937', marginBottom: '1rem' }}>
              Your Expenses (Drag to move between months)
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {localScenario.nonHeadcountCosts
                .filter((c) => c.id !== 'custom_non_headcount' && !c.id?.startsWith('cost_'))
                .map((expense) => (
                  <div
                    key={expense.id}
                    draggable
                    onDragStart={(e) => handleExpenseDragStart(expense.id, e)}
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: expense.isOneTime ? '#fef3c7' : '#dbeafe',
                      borderRadius: '12px',
                      border: '2px solid',
                      borderColor: expense.isOneTime ? '#f59e0b' : '#3b82f6',
                      cursor: 'grab',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#1f2937' }}>
                      {expense.label}
                    </span>
                    <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                      {currentScenario.currency} {expense.monthlyAmount.toLocaleString()}
                      {expense.isOneTime ? ' (1x)' : '/mo'}
                    </span>
                    <button
                      onClick={() => handleDeleteExpense(expense.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        padding: '0 0.5rem',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Month Calendar View */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.5rem', color: '#1f2937', margin: 0 }}>
            📅 Expense Calendar
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label style={{ color: '#1f2937', fontWeight: 600 }}>
              Months: {projectionMonths}
            </label>
            <button
              onClick={() => handleProjectionMonthsChange(projectionMonths - 1)}
              disabled={projectionMonths <= 6}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: projectionMonths <= 6 ? '#e5e7eb' : '#667eea',
                color: '#fff',
                cursor: projectionMonths <= 6 ? 'not-allowed' : 'pointer',
              }}
            >
              −
            </button>
            <button
              onClick={() => handleProjectionMonthsChange(projectionMonths + 1)}
              disabled={projectionMonths >= 60}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: projectionMonths >= 60 ? '#e5e7eb' : '#667eea',
                color: '#fff',
                cursor: projectionMonths >= 60 ? 'not-allowed' : 'pointer',
              }}
            >
              +
            </button>
          </div>
        </div>
        
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          overflowX: 'auto',
          paddingBottom: '0.5rem',
        }}>
          {months.map((monthIndex) => {
            const expensesThisMonth = localScenario.nonHeadcountCosts.filter((cost) => {
              if (cost.id === 'custom_non_headcount' || cost.id?.startsWith('cost_')) return false
              if (cost.isOneTime) {
                return cost.startMonth === monthIndex
              }
              return cost.startMonth <= monthIndex
            })
            
            return (
              <div
                key={monthIndex}
                onDragOver={handleMonthDragOver}
                onDrop={(e) => handleMonthDrop(monthIndex, e)}
                style={{
                  minWidth: '150px',
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '12px',
                  border: '2px dashed #d1d5db',
                  minHeight: '200px',
                }}
              >
                <div style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: 700, 
                  marginBottom: '0.75rem',
                  color: '#1f2937',
                }}>
                  Month {monthIndex + 1}
                </div>
                {expensesThisMonth.length === 0 ? (
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: '#9ca3af', 
                    fontStyle: 'italic',
                    textAlign: 'center',
                    padding: '1rem 0',
                  }}>
                    Drop expenses here
                  </div>
                ) : (
                  expensesThisMonth.map((expense) => (
                    <div
                      key={expense.id}
                      style={{
                        padding: '0.5rem',
                        marginBottom: '0.5rem',
                        backgroundColor: expense.isOneTime ? '#fef3c7' : '#dbeafe',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        color: '#1f2937',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{expense.label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {currentScenario.currency} {expense.monthlyAmount.toLocaleString()}
                        {expense.isOneTime && ' (1x)'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <CashRunwayChart
          monthly={burnResult.monthly}
          currency={currentScenario.currency}
          startingCash={currentScenario.startingCash}
        />
      </div>

      {/* Share Buttons */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        textAlign: 'center',
      }}>
        <h3 style={{ fontSize: '1.5rem', color: '#1f2937', marginBottom: '1.5rem' }}>
          Share Your Runway Stats 🚀
        </h3>
        
        {/* Shareable Link Section */}
        <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#f3f4f6', borderRadius: '12px' }}>
          <h4 style={{ fontSize: '1.1rem', color: '#1f2937', marginBottom: '1rem' }}>
            🔗 Share Your Scenario
          </h4>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
            Copy this link to share your exact scenario with others
          </p>
          <button
            onClick={() => {
              // Generate shareable link for current scenario
              const shareableScenario = {
                ...currentScenario,
                id: 'shared',
                name: currentScenario.name || 'Shared Scenario',
              }
              const scenarioJson = JSON.stringify(shareableScenario)
              const encoded = encodeURIComponent(scenarioJson)
              const shareUrl = `${window.location.origin}${window.location.pathname}?scenario=${encoded}`
              
              navigator.clipboard.writeText(shareUrl).then(() => {
                alert('✅ Shareable link copied! Share this URL with others.')
              }).catch(() => {
                window.prompt('Copy this link:', shareUrl)
              })
            }}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: '#667eea',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
            }}
          >
            📋 Copy Shareable Link
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            onClick={() => handleShare('twitter')}
            style={{
              padding: '1rem 2rem',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: '#1DA1F2',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(29, 161, 242, 0.4)',
            }}
          >
            🐦 Share on Twitter
          </button>
          <button
            onClick={() => handleShare('linkedin')}
            style={{
              padding: '1rem 2rem',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: '#0077b5',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 119, 181, 0.4)',
            }}
          >
            💼 Share on LinkedIn
          </button>
        </div>
        <p style={{ marginTop: '1.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
          Show the world your startup's financial planning skills! 📊
        </p>
      </div>

      {/* CTA to Warp */}
      <div style={{
        marginTop: '2rem',
        padding: '2rem',
        backgroundColor: 'rgba(236, 72, 153, 0.2)',
        borderRadius: '20px',
        textAlign: 'center',
        border: '2px solid #ec4899',
      }}>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
          Tired of manual payroll planning? 🤔
        </h3>
        <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem', opacity: 0.9 }}>
          Let Warp automate your back-office operations so you can focus on growth!
        </p>
        <a
          href="https://www.joinwarp.com/integrations"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '1rem 2rem',
            borderRadius: '12px',
            backgroundColor: '#ec4899',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.4)',
          }}
        >
          Check out Warp →
        </a>
      </div>
    </div>
  )
}

export default ViralDashboard

