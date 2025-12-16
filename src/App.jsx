import './App.css'
import { useState, useEffect, useRef } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import {
  seedStageScenario,
  aggressiveHiringScenario,
  conservativeScenario,
  availableRoles,
  runBurnRate,
  estimateRunway,
} from './engine'
import CashRunwayChart from './CashRunwayChart.jsx'
import RoleSpendingPieChart from './RoleSpendingPieChart.jsx'
import SpendingCategoryPieChart from './SpendingCategoryPieChart.jsx'
import OptionPoolSuggestion from './OptionPoolSuggestion.jsx'
import AIInsights from './AIInsights.jsx'
import ViralDashboard from './ViralDashboard.jsx'
import { getAISuggestions } from './engine/ai.js'

const STORAGE_KEY = 'warp-project-saved-scenarios'

// ID generator that's safe for React (not called during render)
let __localIdCounter = 0
function makeLocalId(prefix) {
  __localIdCounter += 1
  return `${prefix}_${__localIdCounter}_${Math.random().toString(36).slice(2, 7)}`
}

const baseCustomNonHeadcount = seedStageScenario.nonHeadcountCosts.reduce(
  (sum, cost) => sum + cost.monthlyAmount,
  0,
)

function App() {
  const [mode, setMode] = useState('utility') // 'utility' | 'viral'
  
  // Load scenario from URL if present (for shareable links) - check this BEFORE initializing selectedView
  const loadScenarioFromURL = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const scenarioData = urlParams.get('scenario')
      if (scenarioData) {
        const decoded = decodeURIComponent(scenarioData)
        const parsed = JSON.parse(decoded)
        // Validate it has required fields
        if (parsed && parsed.startingCash !== undefined && parsed.hires && parsed.nonHeadcountCosts) {
          return parsed
        }
      }
    } catch (error) {
      console.error('Failed to load scenario from URL:', error)
    }
    return null
  }
  
  // Initialize selectedView to 'custom' if we have a URL scenario, otherwise 'seed'
  const [selectedView, setSelectedView] = useState(() => {
    const urlScenario = loadScenarioFromURL()
    return urlScenario ? 'custom' : 'seed'
  })
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

  // Function to create a fresh blank custom scenario
  const createBlankCustomScenario = () => ({
    ...seedStageScenario,
    id: 'scenario_custom',
    name: 'Custom what-if plan',
    hires: [],
    projectionMonths: 12,
    startingCash: seedStageScenario.startingCash,
    employeeCostMultiplier: seedStageScenario.employeeCostMultiplier,
    nonHeadcountCosts: [
      {
        id: 'custom_non_headcount',
        label: 'Non-headcount costs',
        monthlyAmount: baseCustomNonHeadcount,
        startMonth: 0,
      },
    ],
    aiInsights: null, // No AI insights for new plans
  })
  
  const [customScenario, setCustomScenario] = useState(() => {
    // Check URL first for shared scenario
    const urlScenario = loadScenarioFromURL()
    if (urlScenario) {
      return urlScenario
    }
    const scenario = createBlankCustomScenario()
    return scenario
  })

  // State for projection months (for custom scenarios)
  const [projectionMonths, setProjectionMonths] = useState(() => {
    // Use projectionMonths from customScenario (which may have been loaded from URL)
    return customScenario.projectionMonths || 12
  })

  // Track if we loaded from URL (state so it can be cleared)
  const [loadedFromURL, setLoadedFromURL] = useState(() => {
    return loadScenarioFromURL() !== null
  })

  // Helper to handle view changes and clear URL indicator if needed
  const handleViewChange = (newView) => {
    setSelectedView(newView)
    // Clear the "loaded from URL" indicator when user manually switches views
    if (loadedFromURL) {
      setLoadedFromURL(false)
    }
  }

  // For viral mode, always use customScenario so it can be modified
  // For utility mode, use the selected view scenario
  let currentScenario = seedStageScenario
  if (mode === 'viral') {
    currentScenario = customScenario
  } else if (selectedView === 'aggressive') {
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

  // Use dynamic months based on current scenario
  const months = Array.from({ length: currentScenario.projectionMonths }, (_, i) => i)

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
          id: makeLocalId(role.id),
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

  function handleEmployeeCostMultiplierChange(event) {
    const value = Number(event.target.value) || 1.3
    setCustomScenario((prev) => ({
      ...prev,
      employeeCostMultiplier: value,
    }))
  }

  function handleProjectionMonthsChange(event) {
    const value = Number(event.target.value) || 12
    const clampedValue = Math.max(6, Math.min(60, value)) // Between 6 and 60 months
    setProjectionMonths(clampedValue)
    // Update custom scenario immediately
    setCustomScenario((prev) => ({
      ...prev,
      projectionMonths: clampedValue,
    }))
  }

  // Generate shareable link for current scenario (works with any scenario type)
  function generateShareableLink(scenario) {
    // Create a clean scenario object (remove internal IDs that might cause issues)
    const shareableScenario = {
      ...scenario,
      id: 'shared', // Override ID
      name: scenario.name || 'Shared Scenario',
    }
    
    // Encode scenario as JSON and add to URL
    const scenarioJson = JSON.stringify(shareableScenario)
    const encoded = encodeURIComponent(scenarioJson)
    const shareUrl = `${window.location.origin}${window.location.pathname}?scenario=${encoded}`
    
    return shareUrl
  }

  function handleShareScenario() {
    // Use currentScenario (the one currently displayed) instead of customScenario
    const shareUrl = generateShareableLink(currentScenario)
    
    // Copy to clipboard
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert('✅ Shareable link copied to clipboard! Share this URL with others.')
    }).catch(() => {
      // Fallback: show in prompt if clipboard API fails
      window.prompt('Copy this link to share your scenario:', shareUrl)
    })
  }

  function handleSaveCurrentScenario() {
    const nameInput = window.prompt(
      'Name for this scenario (e.g. With senior exec)',
    )
    if (!nameInput) return
    const trimmed = nameInput.trim()
    if (!trimmed) return

    const id = makeLocalId('saved')
    const snapshot = {
      ...customScenario,
      id,
      name: trimmed,
      // Include AI insights if they exist
      aiInsights: customScenario.aiInsights || null,
    }

    setSavedScenarios((prev) => [...prev, snapshot])
    handleViewChange('saved')
    setSelectedSavedId(id)
    // Reset to blank slate after saving
    setCustomScenario(createBlankCustomScenario())
    // Reset expense form as well
    setCustomExpenseForm({
      label: '',
      amount: '',
      isOneTime: false,
      month: 0,
    })
  }

  // Handler to save AI insights to the current scenario
  function handleSaveAIInsights(insights) {
    if (selectedView === 'custom') {
      // Save to custom scenario
      setCustomScenario((prev) => ({
        ...prev,
        aiInsights: insights,
      }))
    } else if (selectedView === 'saved' && selectedSavedId) {
      // Update saved scenario in the savedScenarios array
      setSavedScenarios((prev) =>
        prev.map((s) =>
          s.id === selectedSavedId
            ? { ...s, aiInsights: insights }
            : s
        )
      )
    }
    // Note: seed, aggressive, and conservative scenarios are read-only
    // AI insights can be generated for them but won't persist
  }

  function handleDeleteSavedScenario(scenarioId, event) {
    event.stopPropagation() // Prevent triggering the button's onClick
    if (window.confirm('Are you sure you want to delete this scenario?')) {
      setSavedScenarios((prev) => prev.filter((s) => s.id !== scenarioId))
      // If the deleted scenario was selected, switch back to seed view
      if (selectedView === 'saved' && selectedSavedId === scenarioId) {
        handleViewChange('seed')
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

  // State for custom expense form
  const [customExpenseForm, setCustomExpenseForm] = useState({
    label: '',
    amount: '',
    isOneTime: false,
    month: 0,
  })

  function handleAddCustomExpense() {
    const amount = Number(customExpenseForm.amount) || 0
    if (!customExpenseForm.label.trim() || amount <= 0) {
      alert('Please enter a valid expense name and amount')
      return
    }

    const newExpense = {
      id: makeLocalId('custom_expense'),
      label: customExpenseForm.label.trim(),
      monthlyAmount: amount,
      startMonth: customExpenseForm.month,
      isOneTime: customExpenseForm.isOneTime,
    }

    setCustomScenario((prev) => ({
      ...prev,
      nonHeadcountCosts: [...prev.nonHeadcountCosts, newExpense],
    }))

    // Reset form
    setCustomExpenseForm({
      label: '',
      amount: '',
      isOneTime: false,
      month: 0,
    })
  }

  function handleDeleteExpense(expenseId) {
    setCustomScenario((prev) => ({
      ...prev,
      nonHeadcountCosts: prev.nonHeadcountCosts.filter((cost) => cost.id !== expenseId),
    }))
  }

  // Refs for PDF export
  const summaryRef = useRef(null)
  const tableRef = useRef(null)
  const chartRef = useRef(null)
  const rolePieChartRef = useRef(null)
  const categoryPieChartRef = useRef(null)
  const aiInsightsRef = useRef(null)

  async function handleExportToPDF() {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      let yPosition = margin

      // Helper function to add a new page if needed
      const checkNewPage = (height) => {
        if (yPosition + height > pageHeight - margin) {
          pdf.addPage()
          yPosition = margin
        }
      }

      // Add title
      pdf.setFontSize(18)
      pdf.text(currentScenario.name, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      // Capture and add summary
      if (summaryRef.current) {
        const summaryCanvas = await html2canvas(summaryRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
        })
        const summaryImg = summaryCanvas.toDataURL('image/png')
        const imgWidth = pageWidth - 2 * margin
        const imgHeight = (summaryCanvas.height * imgWidth) / summaryCanvas.width
        
        checkNewPage(imgHeight)
        pdf.addImage(summaryImg, 'PNG', margin, yPosition, imgWidth, imgHeight)
        yPosition += imgHeight + 5
      }

      // Capture and add table
      if (tableRef.current) {
        const tableCanvas = await html2canvas(tableRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
        })
        const tableImg = tableCanvas.toDataURL('image/png')
        const imgWidth = pageWidth - 2 * margin
        const imgHeight = (tableCanvas.height * imgWidth) / tableCanvas.width
        
        checkNewPage(imgHeight)
        pdf.addImage(tableImg, 'PNG', margin, yPosition, imgWidth, imgHeight)
        yPosition += imgHeight + 5
      }

      // Capture and add cash runway chart
      if (chartRef.current) {
        const chartCanvas = await html2canvas(chartRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
        })
        const chartImg = chartCanvas.toDataURL('image/png')
        const imgWidth = pageWidth - 2 * margin
        const imgHeight = (chartCanvas.height * imgWidth) / chartCanvas.width
        
        checkNewPage(imgHeight)
        pdf.addImage(chartImg, 'PNG', margin, yPosition, imgWidth, imgHeight)
        yPosition += imgHeight + 5
      }

      // Capture and add role spending pie chart
      if (rolePieChartRef.current) {
        const pieCanvas = await html2canvas(rolePieChartRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
        })
        const pieImg = pieCanvas.toDataURL('image/png')
        const imgWidth = pageWidth - 2 * margin
        const imgHeight = (pieCanvas.height * imgWidth) / pieCanvas.width
        
        checkNewPage(imgHeight)
        pdf.addImage(pieImg, 'PNG', margin, yPosition, imgWidth, imgHeight)
        yPosition += imgHeight + 5
      }

      // Capture and add category pie chart
      if (categoryPieChartRef.current) {
        const pieCanvas = await html2canvas(categoryPieChartRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
        })
        const pieImg = pieCanvas.toDataURL('image/png')
        const imgWidth = pageWidth - 2 * margin
        const imgHeight = (pieCanvas.height * imgWidth) / pieCanvas.width
        
        checkNewPage(imgHeight)
        pdf.addImage(pieImg, 'PNG', margin, yPosition, imgWidth, imgHeight)
        yPosition += imgHeight + 5
      }

      // Capture and add AI insights (if available and has content)
      if (aiInsightsRef.current) {
        // Check if there's actual content (not just the empty state message)
        const container = aiInsightsRef.current.querySelector('.ai-insights-container')
        const hasContent = container && (
          container.querySelector('div > div') || // Has insights content
          container.textContent?.includes('Summary') // Has summary section
        )
        if (hasContent) {
          const aiCanvas = await html2canvas(aiInsightsRef.current, {
            backgroundColor: '#ffffff',
            scale: 2,
          })
          const aiImg = aiCanvas.toDataURL('image/png')
          const imgWidth = pageWidth - 2 * margin
          const imgHeight = (aiCanvas.height * imgWidth) / aiCanvas.width
          
          checkNewPage(imgHeight)
          pdf.addImage(aiImg, 'PNG', margin, yPosition, imgWidth, imgHeight)
          yPosition += imgHeight + 5
        }
      }

      // Save the PDF
      pdf.save(`${currentScenario.name.replace(/\s+/g, '_')}_report.pdf`)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      alert('Failed to export PDF. Please try again.')
    }
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
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
          Scenarios
        </h2>
        <button
          onClick={() => {
            handleViewChange('custom')
            const newScenario = createBlankCustomScenario()
            setCustomScenario(newScenario)
            setProjectionMonths(newScenario.projectionMonths)
            // Reset expense form as well
            setCustomExpenseForm({
              label: '',
              amount: '',
              isOneTime: false,
              month: 0,
            })
            // Clear any AI insights state when creating new plan
            setSelectedSavedId(null)
          }}
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
          onClick={() => handleViewChange('seed')}
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
          onClick={() => handleViewChange('aggressive')}
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
          onClick={() => handleViewChange('conservative')}
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
                  handleViewChange('saved')
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ fontWeight: '400', fontSize: '3rem', margin: 0 }}>
            Headcount and Runway Planner
          </h1>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              padding: '0.5rem',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
            }}
          >
            <button
              onClick={() => setMode('utility')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: mode === 'utility' ? '#1a73e8' : 'transparent',
                color: mode === 'utility' ? '#fff' : '#6b7280',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Utility Mode
            </button>
            <button
              onClick={() => setMode('viral')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: mode === 'viral' ? '#ec4899' : 'transparent',
                color: mode === 'viral' ? '#fff' : '#6b7280',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              🚀 Viral Mode
            </button>
          </div>
        </div>
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            marginTop: '1rem',
            marginBottom: '2rem',
            padding: '1rem 0',
            textAlign: 'center',
            borderTop: '2px solid #ec4899',
            borderBottom: '2px solid #ec4899',
            backgroundColor: '#ffffff',
            width: '100%',
          }}
        >
          <a
            href="https://www.joinwarp.com/integrations"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#ec4899',
              fontSize: '1rem',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-block',
            }}
            onMouseEnter={(e) => {
              e.target.style.textDecoration = 'underline'
            }}
            onMouseLeave={(e) => {
              e.target.style.textDecoration = 'none'
            }}
          >
            Streamline your payroll and compliance with Warp →
          </a>
        </div>

        {/* Conditional Rendering: Utility vs Viral Mode */}
        {mode === 'viral' ? (
          <ViralDashboard
            currentScenario={customScenario}
            burnResult={burnResult}
            runway={runway}
            onScenarioChange={(updatedScenario) => {
              setCustomScenario(updatedScenario)
              // Ensure we're in custom view when modifying in viral mode
              if (selectedView !== 'custom') {
                handleViewChange('custom')
              }
            }}
            onGenerateAI={getAISuggestions}
          />
        ) : (
          <>
        <div className="card" ref={summaryRef}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>Summary</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleShareScenario}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #10b981',
                  backgroundColor: '#10b981',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🔗 Share Link
              </button>
              <button
                onClick={handleExportToPDF}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #1a73e8',
                  backgroundColor: '#1a73e8',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Export to PDF
              </button>
            </div>
          </div>
          {loadedFromURL && (
            <div style={{
              padding: '0.75rem',
              marginBottom: '0.75rem',
              backgroundColor: '#d1fae5',
              borderRadius: '6px',
              border: '1px solid #10b981',
              fontSize: '0.9rem',
              color: '#065f46',
            }}>
              ✅ Loaded from shared link
            </div>
          )}
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

        <div ref={aiInsightsRef}>
          <AIInsights
            key={currentScenario.id}
            scenario={currentScenario}
            burnResult={burnResult}
            runway={runway}
            onGenerate={getAISuggestions}
            initialInsights={currentScenario.aiInsights || null}
            onInsightsSaved={handleSaveAIInsights}
          />
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
            <h3 style={{ marginBottom: '0.5rem' }}>Customize Plan</h3>
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
            <div
              style={{
                marginBottom: '0.75rem',
                padding: '0.75rem',
                borderRadius: '6px',
                border: '2px solid #10b981',
                backgroundColor: '#d1fae5',
              }}
            >
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.3rem',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  color: '#065f46',
                }}
              >
                Salary multiplier
              </label>
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="3.0"
                value={customScenario.employeeCostMultiplier}
                onChange={handleEmployeeCostMultiplierChange}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #10b981',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                  backgroundColor: '#fff',
                  fontWeight: 600,
                }}
              />
              <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '0.2rem', textAlign: 'center' }}>
                Multiplies base salary to account for benefits, taxes, and overhead
              </div>
            </div>
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
              <div style={{ marginBottom: '0.4rem' }}>
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
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.2rem',
                    fontWeight: 600,
                  }}
                >
                  Planning period (months)
                </label>
                <input
                  type="number"
                  min="6"
                  max="60"
                  value={projectionMonths}
                  onChange={handleProjectionMonthsChange}
                  style={{
                    width: '80%',
                    padding: '0.3rem 0.4rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.2rem' }}>
                  {projectionMonths} months ({Math.round(projectionMonths / 12 * 10) / 10} years)
                </div>
              </div>
            </div>
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid #ddd',
                margin: '0.75rem 0',
              }}
            />
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Add Custom Expense
            </h4>
            <div style={{ marginBottom: '0.5rem' }}>
              <input
                type="text"
                placeholder="Expense name (e.g., New Office)"
                value={customExpenseForm.label}
                onChange={(e) =>
                  setCustomExpenseForm((prev) => ({ ...prev, label: e.target.value }))
                }
                style={{
                  width: '100%',
                  padding: '0.3rem 0.4rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '0.8rem',
                  marginBottom: '0.3rem',
                }}
              />
              <input
                type="number"
                placeholder="Amount"
                value={customExpenseForm.amount}
                onChange={(e) =>
                  setCustomExpenseForm((prev) => ({ ...prev, amount: e.target.value }))
                }
                style={{
                  width: '100%',
                  padding: '0.3rem 0.4rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '0.8rem',
                  marginBottom: '0.3rem',
                  textAlign: 'center',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.3rem',
                  fontSize: '0.75rem',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="radio"
                    checked={!customExpenseForm.isOneTime}
                    onChange={() =>
                      setCustomExpenseForm((prev) => ({ ...prev, isOneTime: false }))
                    }
                  />
                  Monthly
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="radio"
                    checked={customExpenseForm.isOneTime}
                    onChange={() =>
                      setCustomExpenseForm((prev) => ({ ...prev, isOneTime: true }))
                    }
                  />
                  One-time
                </label>
              </div>
              <select
                value={customExpenseForm.month}
                onChange={(e) =>
                  setCustomExpenseForm((prev) => ({
                    ...prev,
                    month: Number(e.target.value),
                  }))
                }
                style={{
                  width: '100%',
                  padding: '0.3rem 0.4rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '0.8rem',
                  marginBottom: '0.3rem',
                }}
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    Month {m + 1}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddCustomExpense}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #1a73e8',
                  backgroundColor: '#1a73e8',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add Expense
              </button>
            </div>
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid #ddd',
                margin: '0.75rem 0',
              }}
            />
            <p style={{ fontSize: '0.85rem', color: '#555', marginBottom: '0.75rem' }}>
              Drag and drop to add a new hire
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
            <h3 style={{ marginBottom: '0.5rem' }}>
              {currentScenario.projectionMonths}‑month hiring schedule
            </h3>
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
                // Get expenses for this month (excluding the base non-headcount cost)
                const expensesThisMonth = customScenario.nonHeadcountCosts.filter(
                  (cost) => {
                    if (cost.id === 'custom_non_headcount') return false
                    // One-time expenses: only show in the exact month
                    if (cost.isOneTime) {
                      return cost.startMonth === monthIndex
                    }
                    // Recurring expenses: show if within active period
                    const starts = cost.startMonth <= monthIndex
                    const ends = cost.endMonth == null || monthIndex <= cost.endMonth
                    return starts && ends
                  },
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
                    {expensesThisMonth.map((expense) => (
                      <div
                        key={expense.id}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.4rem',
                          borderRadius: '999px',
                          backgroundColor: '#fff3cd',
                          marginBottom: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.3rem',
                        }}
                      >
                        <span style={{ flex: 1 }}>
                          {expense.label}
                          {expense.isOneTime && (
                            <span style={{ fontSize: '0.65rem', color: '#666' }}> (1x)</span>
                          )}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteExpense(expense.id)
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
                          title="Delete this expense"
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
        <div style={{ overflowX: 'auto', marginTop: '1rem' }} ref={tableRef}>
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
              {burnResult.monthly.map((row) => {
                const isNegative = row.closingCash < 0
                const cellStyle = {
                  borderBottom: '1px solid #333',
                  padding: '0.5rem',
                  color: isNegative ? '#ef4444' : 'inherit',
                }
                return (
                  <tr key={row.monthIndex}>
                    <td style={cellStyle}>{row.monthIndex + 1}</td>
                    <td style={cellStyle}>{row.activeHires}</td>
                    <td style={cellStyle}>
                      {currentScenario.currency}{' '}
                      {Math.round(row.payrollCost).toLocaleString()}
                    </td>
                    <td style={cellStyle}>
                      {currentScenario.currency}{' '}
                      {Math.round(row.nonHeadcountCost).toLocaleString()}
                    </td>
                    <td style={cellStyle}>
                      {currentScenario.currency}{' '}
                      {Math.round(row.totalCost).toLocaleString()}
                    </td>
                    <td style={cellStyle}>
                      {currentScenario.currency}{' '}
                      {Math.round(row.closingCash).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div ref={chartRef}>
          <CashRunwayChart
            monthly={burnResult.monthly}
            currency={currentScenario.currency}
            startingCash={currentScenario.startingCash}
          />
        </div>
        <div ref={rolePieChartRef}>
          <RoleSpendingPieChart
            scenario={currentScenario}
            burnResult={burnResult}
            currency={currentScenario.currency}
          />
        </div>
        <div ref={categoryPieChartRef}>
          <SpendingCategoryPieChart
            scenario={currentScenario}
            burnResult={burnResult}
            currency={currentScenario.currency}
          />
        </div>
        <OptionPoolSuggestion />
          </>
        )}
      </main>
    </div>
  )
}

export default App
