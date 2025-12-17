import { useState, useEffect, useRef } from 'react'
import {
  seedStageScenario,
  availableRoles,
  runBurnRate,
  estimateRunway,
} from './engine'
import { getAISuggestions, predictOutcome } from './engine/ai.js'
import CashRunwayChart from './CashRunwayChart.jsx'
import AirplaneAnimation from './AirplaneAnimation.jsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

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
  const [companyName, setCompanyName] = useState('')
  const [companySummary, setCompanySummary] = useState('')
  const [prediction, setPrediction] = useState(null)
  const [isPredicting, setIsPredicting] = useState(false)
  const [predictionError, setPredictionError] = useState(null)
  const [showPredictionResult, setShowPredictionResult] = useState(false)
  const [warpSaveToggle, setWarpSaveToggle] = useState(false)
  const [shouldAnimate, setShouldAnimate] = useState(false)
  const pdfExportRef = useRef(null)

  // Update local scenario when currentScenario changes
  useEffect(() => {
    setLocalScenario(currentScenario)
    setProjectionMonths(currentScenario.projectionMonths || 12)
    
    // Restore or reset viral mode specific data based on scenario
    if (currentScenario.companyName !== undefined) {
      setCompanyName(currentScenario.companyName)
    } else {
      setCompanyName('')
    }
    if (currentScenario.companySummary !== undefined) {
      setCompanySummary(currentScenario.companySummary)
    } else {
      setCompanySummary('')
    }
    if (currentScenario.prediction !== undefined && currentScenario.prediction !== null) {
      setPrediction(currentScenario.prediction)
      setShowPredictionResult(true)
      setShouldAnimate(false) // Don't animate when restoring from state/URL
    } else {
      // Reset prediction state when not in scenario
      setPrediction(null)
      setShowPredictionResult(false)
      setShouldAnimate(false)
    }
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

  const handleRoleDragStart = (roleId, event) => {
    event.dataTransfer.setData('text/plain', `role_${roleId}`)
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
    } else if (data.startsWith('role_')) {
      const roleId = data.replace('role_', '')
      const role = availableRoles.find((r) => r.id === roleId)
      if (role) {
        const updatedScenario = {
          ...localScenario,
          hires: [
            ...localScenario.hires,
            {
              id: makeViralId(`hire_${role.id}`),
              title: role.title,
              annualSalary: role.annualSalary,
              startMonth: monthIndex,
            },
          ],
        }
        setLocalScenario(updatedScenario)
        onScenarioChange(updatedScenario)
      }
    }
  }

  const handleDeleteHire = (hireId) => {
    const updatedScenario = {
      ...localScenario,
      hires: localScenario.hires.filter((hire) => hire.id !== hireId),
    }
    setLocalScenario(updatedScenario)
    onScenarioChange(updatedScenario)
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

  const handlePredictOutcome = async () => {
    if (!companySummary.trim()) {
      alert('Please enter a company summary first! 📝')
      return
    }

    if (companySummary.length > 100) {
      alert('Company summary must be 100 characters or less! ✂️')
      return
    }

    setIsPredicting(true)
    setPredictionError(null)
    setShowPredictionResult(false)
    setPrediction(null) // Clear previous prediction
    setShouldAnimate(true) // Enable animation for new prediction

    try {
      // Recalculate burn and runway for current scenario
      const currentBurnResult = runBurnRate(localScenario)
      const currentRunway = estimateRunway(currentBurnResult)
      
      const result = await predictOutcome(
        companySummary.trim(),
        localScenario,
        currentBurnResult,
        currentRunway
      )
      setPrediction(result)
      // Animation will handle showing the result
    } catch (error) {
      console.error('Error predicting outcome:', error)
      setPredictionError(error.message || 'Failed to get prediction. Make sure the backend server is running.')
      setIsPredicting(false)
    }
  }

  const handleAnimationComplete = () => {
    setShowPredictionResult(true)
    setIsPredicting(false)
  }

  const handleExportViralPDF = async () => {
    if (!prediction || !pdfExportRef.current) {
      alert('Please generate a prediction first! 🔮')
      return
    }

    try {
      // Generate shareable links
      const shareableScenario = {
        ...localScenario,
        id: 'shared',
        name: localScenario.name || 'Shared Scenario',
        // Include viral mode specific data
        companyName: companyName,
        companySummary: companySummary,
        prediction: prediction,
      }
      const scenarioJson = JSON.stringify(shareableScenario)
      const encoded = encodeURIComponent(scenarioJson)
      const shareUrl = `${window.location.origin}${window.location.pathname}?mode=viral&scenario=${encoded}`
      const viralModeUrl = `${window.location.origin}${window.location.pathname}?mode=viral`
      const warpUrl = 'https://www.joinwarp.com/integrations'

      const pdf = new jsPDF('p', 'mm', 'a4')
      const canvas = await html2canvas(pdfExportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        height: pdfExportRef.current.scrollHeight,
        width: pdfExportRef.current.scrollWidth,
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      
      // Ensure it fits on exactly one page - scale down if needed
      const finalHeight = Math.min(imgHeight, pageHeight)
      const scaleFactor = finalHeight / imgHeight
      const finalWidth = imgWidth * scaleFactor
      
      // Add image to first page only, centered if needed
      const xOffset = (imgWidth - finalWidth) / 2
      pdf.addImage(imgData, 'PNG', xOffset, 0, finalWidth, finalHeight)
      
      // Add clickable links for the three buttons
      // Button positions adjusted for scaling
      const buttonHeight = 10 // mm (approximate)
      const buttonGap = 4 // mm (approximate)
      const topPadding = 11 // mm (30px padding / 2.83 scale factor)
      
      // Scale link positions to match image scaling
      const linkWidth = (imgWidth - 20) * scaleFactor
      const linkX = xOffset + 10
      
      // First button: "Check Out My Company"
      pdf.link(linkX, topPadding * scaleFactor, linkWidth, buttonHeight * scaleFactor, { url: shareUrl })
      
      // Second button: "Test it here"
      pdf.link(linkX, (topPadding + buttonHeight + buttonGap) * scaleFactor, linkWidth, buttonHeight * scaleFactor, { url: viralModeUrl })
      
      // Third button: "Save with Warp"
      pdf.link(linkX, (topPadding + (buttonHeight + buttonGap) * 2) * scaleFactor, linkWidth, buttonHeight * scaleFactor, { url: warpUrl })

      const fileName = `${companyName || 'Startup'}_${prediction.prediction}_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(fileName)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    }
  }

  // Recalculate burn and runway for animation
  const currentBurnResult = runBurnRate(localScenario)
  const currentRunway = estimateRunway(currentBurnResult)

  return (
    <div style={{ 
      padding: '2rem',
      minHeight: '100vh',
      color: '#fff',
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes disco {
          0% { background-color: #ff00ff; }
          14.28% { background-color: #9d00ff; }
          28.56% { background-color: #0000ff; }
          42.84% { background-color: #00ff00; }
          57.12% { background-color: #ffff00; }
          71.4% { background-color: #ff4500; }
          85.68% { background-color: #00ffff; }
          100% { background-color: #ff00ff; }
        }
        .disco-background {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: -1;
          animation: disco 1.5s linear infinite;
        }
      `}</style>
      <div className="disco-background"></div>
      {/* Instructions Section */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h2 style={{ fontSize: '2rem', color: '#1f2937', marginBottom: '1.5rem', textAlign: 'center' }}>
          🚀 How to Use Viral Mode
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '12px',
            border: '2px solid #667eea',
          }}>
            <div style={{
              fontSize: '2.5rem',
              marginBottom: '0.5rem',
              textAlign: 'center',
            }}>
              1️⃣
            </div>
            <h3 style={{
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#1f2937',
              marginBottom: '0.5rem',
              textAlign: 'center',
            }}>
              Input Company Info
            </h3>
            <p style={{
              fontSize: '0.95rem',
              color: '#6b7280',
              margin: 0,
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              Enter your company name and a brief summary (max 100 characters)
            </p>
          </div>
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '12px',
            border: '2px solid #667eea',
          }}>
            <div style={{
              fontSize: '2.5rem',
              marginBottom: '0.5rem',
              textAlign: 'center',
            }}>
              2️⃣
            </div>
            <h3 style={{
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#1f2937',
              marginBottom: '0.5rem',
              textAlign: 'center',
            }}>
              Add Expenses
            </h3>
            <p style={{
              fontSize: '0.95rem',
              color: '#6b7280',
              margin: 0,
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              Input your company's expenses and organize them by month in the calendar
            </p>
          </div>
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '12px',
            border: '2px solid #667eea',
          }}>
            <div style={{
              fontSize: '2.5rem',
              marginBottom: '0.5rem',
              textAlign: 'center',
            }}>
              3️⃣
            </div>
            <h3 style={{
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#1f2937',
              marginBottom: '0.5rem',
              textAlign: 'center',
            }}>
              Learn Your Fate
            </h3>
            <p style={{
              fontSize: '0.95rem',
              color: '#6b7280',
              margin: 0,
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              Click "Predict Outcome" to see if your startup will take off or crash! 🚀💥
            </p>
          </div>
        </div>
      </div>

      {/* Airplane Animation - Runway at the top */}
      <AirplaneAnimation
        runwayMonths={currentRunway.runwayMonths}
        hasRunwayEnd={currentRunway.hasRunwayEnd}
        prediction={prediction}
        onAnimationComplete={handleAnimationComplete}
        companyName={companyName || 'Your Company'}
        autoAnimate={shouldAnimate}
      />

      {/* Company Summary & Prediction Section */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ fontSize: '1.5rem', color: '#1f2937', marginBottom: '1.5rem' }}>
          🎯 Will Your Startup Take Off or Crash?
        </h3>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#1f2937', fontWeight: 600 }}>
            Company Name
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g., Acme Corp"
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '2px solid #e5e7eb',
              fontSize: '1rem',
              color: '#000000',
              backgroundColor: '#ffffff',
              fontFamily: 'inherit',
            }}
          />
        </div>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#1f2937', fontWeight: 600 }}>
            Company Summary (max 100 characters)
          </label>
          <textarea
            value={companySummary}
            onChange={(e) => {
              const value = e.target.value
              if (value.length <= 100) {
                setCompanySummary(value)
              }
            }}
            placeholder="e.g., AI-powered SaaS platform for small businesses"
            maxLength={100}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '2px solid #e5e7eb',
              fontSize: '1rem',
              color: '#000000',
              backgroundColor: '#ffffff',
              minHeight: '80px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div style={{ 
            fontSize: '0.85rem', 
            color: companySummary.length >= 90 ? '#ef4444' : '#6b7280',
            marginTop: '0.5rem',
            textAlign: 'right',
          }}>
            {companySummary.length}/100 characters
          </div>
        </div>

        <button
          onClick={handlePredictOutcome}
          disabled={isPredicting || !companySummary.trim()}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: isPredicting || !companySummary.trim() ? '#9ca3af' : '#667eea',
            color: '#fff',
            fontSize: '1.1rem',
            fontWeight: 600,
            cursor: isPredicting || !companySummary.trim() ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
            transition: 'all 0.2s',
          }}
        >
          {isPredicting ? '🔮 Predicting...' : '🔮 Predict Outcome'}
        </button>

        {predictionError && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#fee2e2',
            borderRadius: '8px',
            border: '1px solid #ef4444',
            color: '#991b1b',
            fontSize: '0.9rem',
          }}>
            ❌ {predictionError}
          </div>
        )}

        {prediction && showPredictionResult && (
          <>
            <div style={{
              marginTop: '1.5rem',
              padding: '1.5rem',
              backgroundColor: prediction.prediction === 'TAKE OFF' ? '#d1fae5' : '#fee2e2',
              borderRadius: '12px',
              border: `2px solid ${prediction.prediction === 'TAKE OFF' ? '#10b981' : '#ef4444'}`,
              animation: 'fadeIn 0.5s ease-in',
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem',
                marginBottom: '1rem',
              }}>
                <div style={{ fontSize: '3rem' }}>
                  {prediction.prediction === 'TAKE OFF' ? '🚀' : '💥'}
                </div>
                <div>
                  <h4 style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 700,
                    color: prediction.prediction === 'TAKE OFF' ? '#065f46' : '#991b1b',
                    margin: 0,
                  }}>
                    {prediction.prediction === 'TAKE OFF' ? 'TAKE OFF!' : 'CRASH'}
                  </h4>
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: prediction.prediction === 'TAKE OFF' ? '#047857' : '#dc2626',
                    marginTop: '0.25rem',
                  }}>
                    Confidence: {prediction.confidence}
                  </div>
                </div>
              </div>
              {prediction.companyType && (
                <div style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: '8px',
                }}>
                  <div style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: prediction.prediction === 'TAKE OFF' ? '#047857' : '#dc2626',
                    marginBottom: '0.5rem',
                  }}>
                    Company Type:
                  </div>
                  <div style={{
                    fontSize: '0.95rem',
                    color: prediction.prediction === 'TAKE OFF' ? '#065f46' : '#991b1b',
                    lineHeight: 1.5,
                  }}>
                    {prediction.companyType}
                  </div>
                </div>
              )}
              <p style={{ 
                fontSize: '1rem', 
                color: prediction.prediction === 'TAKE OFF' ? '#065f46' : '#991b1b',
                margin: 0,
                lineHeight: 1.6,
              }}>
                {prediction.reasoning}
              </p>
            </div>
            
            <button
              onClick={handleExportViralPDF}
              style={{
                width: '100%',
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#ec4899',
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(236, 72, 153, 0.4)',
                transition: 'all 0.2s',
              }}
            >
              📄 Export Viral PDF Card
            </button>
          </>
        )}
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
          💰 Add Expenses & 👥 Hire Employees
        </h3>
        
        {/* Starting Cash Input */}
        <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#f3f4f6', borderRadius: '12px', border: '2px solid #10b981' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#1f2937', fontWeight: 600, fontSize: '1.1rem' }}>
            💵 Starting Cash ({currentScenario.currency})
          </label>
          <input
            type="text"
            value={localScenario.startingCash.toLocaleString()}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, '')
              const value = Number(raw) || 0
              const updatedScenario = {
                ...localScenario,
                startingCash: value,
              }
              setLocalScenario(updatedScenario)
              onScenarioChange(updatedScenario)
            }}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '2px solid #10b981',
              fontSize: '1.1rem',
              color: '#000000',
              backgroundColor: '#ffffff',
              fontWeight: 600,
            }}
            placeholder="Enter starting cash amount"
          />
        </div>
        
        {/* Current Hires Section */}
        {localScenario.hires.length > 0 && (
          <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '2px solid #10b981' }}>
            <h4 style={{ fontSize: '1.2rem', color: '#1f2937', marginBottom: '1rem' }}>
              👥 Your Hires
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {localScenario.hires.map((hire) => (
                <div
                  key={hire.id}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#d1fae5',
                    borderRadius: '12px',
                    border: '2px solid #10b981',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#1f2937' }}>
                    {hire.title}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    Month {hire.startMonth + 1}
                  </span>
                  <button
                    onClick={() => handleDeleteHire(hire.id)}
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

        {/* Warp Save Toggle */}
        <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1.1rem',
              color: '#ec4899',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={warpSaveToggle}
              onChange={(e) => {
                const isChecked = e.target.checked
                setWarpSaveToggle(isChecked)
                
                // Adjust starting cash by 50,000
                const adjustment = isChecked ? 50000 : -50000
                const updatedScenario = {
                  ...localScenario,
                  startingCash: Math.max(0, localScenario.startingCash + adjustment),
                }
                setLocalScenario(updatedScenario)
                onScenarioChange(updatedScenario)
              }}
              style={{
                width: '1.2rem',
                height: '1.2rem',
                cursor: 'pointer',
                accentColor: '#ec4899',
              }}
            />
            <span style={{ fontSize: '1.1rem', color: '#ec4899', fontWeight: 600 }}>
              Save 50,000 with Warp
            </span>
          </label>
        </div>

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
        
        {/* Available Roles Section - At bottom, right above calendar */}
        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
          <h4 style={{ fontSize: '1.2rem', color: '#1f2937', marginBottom: '1rem' }}>
            👥 Available Roles (Drag to calendar to hire)
          </h4>
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            overflowX: 'auto',
            paddingBottom: '0.5rem',
          }}>
            {availableRoles.map((role) => (
              <div
                key={role.id}
                draggable
                onDragStart={(event) => handleRoleDragStart(role.id, event)}
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#dbeafe',
                  borderRadius: '12px',
                  border: '2px solid #3b82f6',
                  cursor: 'grab',
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: '150px',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.95rem' }}>
                  {role.title}
                </span>
                <span style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {currentScenario.currency} {role.annualSalary.toLocaleString()}/yr
                </span>
              </div>
            ))}
          </div>
        </div>
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
            
            const hiresThisMonth = localScenario.hires.filter((hire) => hire.startMonth === monthIndex)
            
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
                {expensesThisMonth.length === 0 && hiresThisMonth.length === 0 ? (
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: '#9ca3af', 
                    fontStyle: 'italic',
                    textAlign: 'center',
                    padding: '1rem 0',
                  }}>
                    Drop expenses or hires here
                  </div>
                ) : (
                  <>
                    {hiresThisMonth.map((hire) => (
                      <div
                        key={hire.id}
                        style={{
                          padding: '0.5rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#d1fae5',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          color: '#1f2937',
                          border: '1px solid #10b981',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>👤 {hire.title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {currentScenario.currency} {hire.annualSalary.toLocaleString()}/yr
                        </div>
                      </div>
                    ))}
                    {expensesThisMonth.map((expense) => (
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
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>
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
        {/* Hero Section - Moved to top */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 800, 
            margin: '0 0 1rem 0',
            color: '#1f2937',
          }}>
            {getRunwayEmoji()} Your Runway Death Clock {getRunwayEmoji()}
          </h1>
          <p style={{ fontSize: '1.2rem', color: '#6b7280', margin: 0 }}>
            How long until your startup runs out of cash? 💸
          </p>
        </div>
        
        <div style={{ fontSize: '6rem', marginBottom: '1rem' }}>
          {runway.hasRunwayEnd ? '⏰' : '🦄'}
        </div>
        <h2 style={{ 
          fontSize: '3rem', 
          color: runway.hasRunwayEnd && runway.runwayMonths < 6 ? '#ef4444' : '#10b981',
          margin: '0 0 0.5rem 0',
          fontWeight: 700,
        }}>
          {runway.hasRunwayEnd 
            ? `${runway.runwayMonths} months` 
            : 'Infinite Runway!'}
        </h2>
        {!runway.hasRunwayEnd && (
          <div style={{ fontSize: '0.9rem', color: '#9ca3af', marginBottom: '1rem' }}>
            in {projectionMonths} month period
          </div>
        )}
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

      {/* Hidden PDF Export Content - Colorful Viral Design */}
      <div ref={pdfExportRef} style={{
        position: 'absolute',
        left: '-9999px',
        width: '210mm', // A4 width
        height: '297mm', // A4 height - exactly one page
        padding: '30px',
        background: prediction?.prediction === 'TAKE OFF' 
          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)'
          : 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #991b1b 100%)',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}>
        {/* Viral Shareable Elements */}
        {(() => {
          // Generate shareable link for current scenario
          const shareableScenario = {
            ...localScenario,
            id: 'shared',
            name: localScenario.name || 'Shared Scenario',
            // Include viral mode specific data
            companyName: companyName,
            companySummary: companySummary,
            prediction: prediction,
          }
          const scenarioJson = JSON.stringify(shareableScenario)
          const encoded = encodeURIComponent(scenarioJson)
          const shareUrl = `${window.location.origin}${window.location.pathname}?mode=viral&scenario=${encoded}`
          const viralModeUrl = `${window.location.origin}${window.location.pathname}?mode=viral`
          const warpUrl = 'https://www.joinwarp.com/integrations'
          
          return (
            <div style={{
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              {/* Check Out My Company Button */}
              <a
                href={shareUrl}
                data-pdf-link={shareUrl}
                style={{
                  display: 'block',
                  padding: '10px 20px',
                  backgroundColor: '#ec4899',
                  color: '#ffffff',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontSize: '16px',
                  fontWeight: 700,
                  textAlign: 'center',
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 8px rgba(236, 72, 153, 0.4)',
                }}
              >
                🔗 Check Out My Company
              </a>
              
              {/* Test Your Company Link */}
              <a
                href={viralModeUrl}
                data-pdf-link={viralModeUrl}
                style={{
                  display: 'block',
                  padding: '10px 20px',
                  backgroundColor: '#ec4899',
                  color: '#ffffff',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontSize: '16px',
                  fontWeight: 700,
                  textAlign: 'center',
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 8px rgba(236, 72, 153, 0.4)',
                }}
              >
                🚀 Think your company might survive? Test it here
              </a>
              
              {/* Save with Warp Button */}
              <a
                href={warpUrl}
                data-pdf-link={warpUrl}
                style={{
                  display: 'block',
                  padding: '10px 20px',
                  backgroundColor: '#ec4899',
                  color: '#ffffff',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontSize: '16px',
                  fontWeight: 700,
                  textAlign: 'center',
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 8px rgba(236, 72, 153, 0.4)',
                }}
              >
                💰 Save {companyName || 'Your Company'} $50,000 by switching to Warp
              </a>
            </div>
          )
        })()}
        
        {/* Header with Company Name */}
        <div style={{
          textAlign: 'center',
          marginBottom: '20px',
        }}>
          <h1 style={{
            fontSize: '40px',
            fontWeight: 900,
            margin: '0 0 8px 0',
            textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
            color: '#ffffff',
          }}>
            {companyName || 'Your Company'}
          </h1>
          <div style={{
            fontSize: '16px',
            opacity: 0.9,
            fontWeight: 600,
          }}>
            {companySummary || 'Startup Financial Prediction'}
          </div>
        </div>

        {/* Prediction Card - Smaller */}
        {prediction && (
          <div style={{
            backgroundColor: prediction.prediction === 'TAKE OFF' 
              ? 'rgba(16, 185, 129, 0.95)' 
              : 'rgba(239, 68, 68, 0.95)',
            borderRadius: '18px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
            border: '3px solid #ffffff',
            flex: '0 0 auto',
          }}>
            <div style={{
              textAlign: 'center',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '42px', marginBottom: '8px' }}>
                {prediction.prediction === 'TAKE OFF' ? '🚀' : '💥'}
              </div>
              <h2 style={{
                fontSize: '32px',
                fontWeight: 900,
                margin: '0 0 8px 0',
                color: '#ffffff',
                textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
              }}>
                {prediction.prediction === 'TAKE OFF' ? 'TAKE OFF!' : 'CRASH!'}
              </h2>
              <div style={{
                fontSize: '16px',
                fontWeight: 700,
                opacity: 0.95,
              }}>
                Confidence: {prediction.confidence}
              </div>
            </div>

            {prediction.companyType && (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: '12px',
              }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  marginBottom: '6px',
                }}>
                  Company Type:
                </div>
                <div style={{
                  fontSize: '14px',
                  lineHeight: 1.5,
                }}>
                  {prediction.companyType}
                </div>
              </div>
            )}

            <div style={{
              fontSize: '14px',
              lineHeight: 1.5,
              fontWeight: 500,
            }}>
              {prediction.reasoning}
            </div>
          </div>
        )}

        {/* Financial Info Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '20px',
          flex: '0 0 auto',
        }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '15px',
            padding: '15px',
            textAlign: 'center',
            border: '2px solid #ffffff',
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '8px',
              opacity: 0.9,
            }}>
              Starting Cash
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: 900,
            }}>
              {currentScenario.currency} {currentScenario.startingCash.toLocaleString()}
            </div>
          </div>

          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '15px',
            padding: '15px',
            textAlign: 'center',
            border: '2px solid #ffffff',
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '8px',
              opacity: 0.9,
            }}>
              Monthly Burn
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: 900,
            }}>
              {currentScenario.currency} {Math.round(currentRunway.averageMonthlyBurn).toLocaleString()}
            </div>
          </div>

          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '15px',
            padding: '15px',
            textAlign: 'center',
            border: '2px solid #ffffff',
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '8px',
              opacity: 0.9,
            }}>
              Runway
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: 900,
            }}>
              {currentRunway.hasRunwayEnd 
                ? `${currentRunway.runwayMonths} months` 
                : '∞'}
            </div>
          </div>
        </div>

        {/* Expenses Summary */}
        {localScenario.nonHeadcountCosts.filter((c) => c.id !== 'custom_non_headcount' && !c.id?.startsWith('cost_')).length > 0 && (
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '15px',
            padding: '15px',
            marginBottom: '20px',
            border: '2px solid #ffffff',
            flex: '0 0 auto',
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: 800,
              margin: '0 0 12px 0',
            }}>
              💰 Expenses
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
            }}>
              {localScenario.nonHeadcountCosts
                .filter((c) => c.id !== 'custom_non_headcount' && !c.id?.startsWith('cost_'))
                .slice(0, 6)
                .map((expense) => (
                  <div key={expense.id} style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    borderRadius: '10px',
                    padding: '10px',
                  }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      marginBottom: '5px',
                    }}>
                      {expense.label}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      opacity: 0.9,
                    }}>
                      {currentScenario.currency} {expense.monthlyAmount.toLocaleString()}
                      {expense.isOneTime ? ' (1x)' : '/mo'}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          marginTop: 'auto',
          paddingTop: '15px',
          borderTop: '2px solid rgba(255, 255, 255, 0.3)',
          fontSize: '14px',
          opacity: 0.9,
          fontWeight: 600,
          flex: '0 0 auto',
        }}>
          Generated by Warp Headcount Planner 🚀
        </div>
      </div>
    </div>
  )
}

export default ViralDashboard

