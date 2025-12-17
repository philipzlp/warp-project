import { useEffect, useState, useRef } from 'react'

function AirplaneAnimation({ 
  runwayMonths, 
  hasRunwayEnd, 
  prediction, 
  onAnimationComplete,
  companyName = 'Your Company',
  autoAnimate = true
}) {
  const [showAnimation, setShowAnimation] = useState(false)
  const [animationPhase, setAnimationPhase] = useState('idle') // idle, moving, result
  const hasAnimatedRef = useRef(false) // Track if we've already animated for current prediction
  const predictionIdRef = useRef(null) // Track which prediction we've animated for

  // Calculate plane position based on runway (0 = start, 100 = crash wall)
  const getPlanePosition = () => {
    if (!hasRunwayEnd) return 0 // Infinite runway = plane stays at start
    const maxMonths = 24 // Assume 24 months is "full runway"
    const progress = Math.min((maxMonths - runwayMonths) / maxMonths, 1)
    return progress * 85 // 85% of runway (leave some space before wall)
  }

  const planePosition = getPlanePosition()

  // When prediction arrives, start the animation sequence (only once per prediction)
  useEffect(() => {
    if (prediction) {
      // Create a stable ID for this prediction based on its content
      const currentPredictionId = `${prediction.prediction}-${prediction.confidence}`
      const isTakeOff = prediction.prediction === 'TAKE OFF'
      
      // Only animate if this is a new prediction (different content) AND autoAnimate is true
      if (predictionIdRef.current !== currentPredictionId && autoAnimate) {
        predictionIdRef.current = currentPredictionId
        hasAnimatedRef.current = true
        
        // Small delay to let user see the prediction is coming
        const moveTimer = setTimeout(() => {
          setShowAnimation(true)
          setAnimationPhase('moving')
          
          // For take-off, start the result animation earlier (1 second) so it takes off before reaching wall
          // For crash, wait longer (2 seconds) so it reaches the wall first
          const resultDelay = isTakeOff ? 1000 : 2000
          
          const resultTimer = setTimeout(() => {
            setAnimationPhase('result')
          }, resultDelay)
          
          // Cleanup function for result timer
          return () => clearTimeout(resultTimer)
        }, 500)
        
        return () => clearTimeout(moveTimer)
      } else if (predictionIdRef.current !== currentPredictionId && !autoAnimate) {
        // Update the prediction ID but don't animate
        predictionIdRef.current = currentPredictionId
        hasAnimatedRef.current = false
        // Show result immediately without animation (use setTimeout to avoid sync setState warning)
        setTimeout(() => {
          setShowAnimation(true)
          setAnimationPhase('result')
        }, 0)
      }
    } else {
      // Reset when prediction is cleared
      hasAnimatedRef.current = false
      predictionIdRef.current = null
      setShowAnimation(false)
      setAnimationPhase('idle')
    }
  }, [prediction?.prediction, prediction?.confidence, autoAnimate]) // Only depend on prediction content, not object reference

  // Notify parent when animation completes (after 5 seconds)
  useEffect(() => {
    if (animationPhase === 'result') {
      const timer = setTimeout(() => {
        setShowAnimation(false)
        setAnimationPhase('idle')
        if (onAnimationComplete) {
          onAnimationComplete()
        }
      }, 5000) // 5 seconds total animation time
      return () => clearTimeout(timer)
    }
  }, [animationPhase, onAnimationComplete])

  // Full screen black overlay with animation
  if (showAnimation && animationPhase !== 'idle') {
    const isTakeOff = prediction?.prediction === 'TAKE OFF'
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* Runway */}
        <div style={{
          position: 'absolute',
          bottom: '20%',
          left: '5%',
          right: '5%',
          height: '8px',
          backgroundColor: '#4a5568',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(255,255,255,0.1)',
        }}>
          {/* Runway lines */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '2px',
            background: 'repeating-linear-gradient(to right, #fff 0, #fff 20px, transparent 20px, transparent 40px)',
            transform: 'translateY(-50%)',
          }} />
        </div>

        {/* Crash Wall */}
        <div style={{
          position: 'absolute',
          right: '5%',
          bottom: '20%',
          width: '120px',
          height: '200px',
          backgroundColor: '#dc2626',
          border: '4px solid #991b1b',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(220, 38, 38, 0.5)',
        }}>
          <div style={{
            fontSize: '2rem',
            fontWeight: 900,
            color: '#fff',
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
          }}>
            CRASH
          </div>
        </div>

        {/* Company Name and Rocket */}
        <div style={{
          position: 'absolute',
          bottom: '20%',
          left: animationPhase === 'moving' 
            ? (isTakeOff ? 'calc(95% - 120px - 100px)' : 'calc(95% - 120px - 10px)') // For take-off, start earlier (further from wall); for crash, approach wall
            : animationPhase === 'result' && !isTakeOff
            ? 'calc(95% - 120px)' // Position at crash wall (hits it)
            : animationPhase === 'result' && isTakeOff
            ? 'calc(95% - 120px - 50px - 15px)' // Start take-off from well before the wall, 15px to the left
            : `${5 + planePosition}%`,
          transform: animationPhase === 'result' && isTakeOff 
            ? 'translateX(250px) translateY(-800px) rotate(-15deg) scale(1.2)' // Diagonal take-off: moves right and up, clearing entire wall from left side
            : animationPhase === 'result' && !isTakeOff
            ? 'translateX(10px) translateY(20px) rotate(45deg) scale(0.8)'
            : 'translateY(0)',
          transition: animationPhase === 'moving'
            ? (isTakeOff ? 'left 1s ease-in' : 'left 2s ease-in') // Faster approach for take-off
            : animationPhase === 'result' 
            ? (isTakeOff ? 'all 3s linear' : 'all 1.5s ease-in') // Linear diagonal take-off
            : 'none',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          {/* Company name text - above rocket */}
          <div style={{
            color: '#000000',
            fontSize: '1rem',
            fontWeight: 700,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            marginBottom: '8px',
            textShadow: '2px 2px 4px rgba(255,255,255,0.8)',
          }}>
            {companyName}
          </div>
          
          {/* Rocket emoji - horizontally oriented, pointing left */}
          <div style={{
            fontSize: '4.5rem',
            transform: 'rotate(50deg)',
            lineHeight: 1,
          }}>
            🚀
          </div>
        </div>

        {/* Smoke trail for crash - appears when plane hits wall */}
        {animationPhase === 'result' && !isTakeOff && (
          <div style={{
            position: 'absolute',
            bottom: '20%',
            right: 'calc(5% + 120px)', // Position at crash wall
            width: '100px',
            height: '80px',
            opacity: 0.9,
            animation: 'smoke 2s ease-out forwards',
          }}>
            <div style={{
              width: '30px',
              height: '30px',
              backgroundColor: '#6b7280',
              borderRadius: '50%',
              position: 'absolute',
              animation: 'smokePuff 0.6s ease-out infinite',
            }} />
            <div style={{
              width: '25px',
              height: '25px',
              backgroundColor: '#9ca3af',
              borderRadius: '50%',
              position: 'absolute',
              left: '20px',
              top: '10px',
              animation: 'smokePuff 0.6s ease-out 0.2s infinite',
            }} />
            <div style={{
              width: '20px',
              height: '20px',
              backgroundColor: '#d1d5db',
              borderRadius: '50%',
              position: 'absolute',
              left: '40px',
              top: '20px',
              animation: 'smokePuff 0.6s ease-out 0.4s infinite',
            }} />
            <div style={{
              width: '18px',
              height: '18px',
              backgroundColor: '#e5e7eb',
              borderRadius: '50%',
              position: 'absolute',
              left: '60px',
              top: '35px',
              animation: 'smokePuff 0.6s ease-out 0.6s infinite',
            }} />
            <div style={{
              width: '15px',
              height: '15px',
              backgroundColor: '#f3f4f6',
              borderRadius: '50%',
              position: 'absolute',
              left: '75px',
              top: '50px',
              animation: 'smokePuff 0.6s ease-out 0.8s infinite',
            }} />
          </div>
        )}

        {/* Success stars for take off - distributed all around the page */}
        {animationPhase === 'result' && isTakeOff && (
          <>
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${(i * 13.37) % 100}%`, // Distribute across full width
                  top: `${(i * 19.73) % 100}%`, // Distribute across full height
                  animation: `starPop 0.5s ease-out ${i * 0.05}s forwards`,
                  opacity: 0,
                }}
              >
                <div style={{
                  fontSize: '2rem',
                  animation: `spinStar 2s linear infinite ${0.5 + i * 0.05}s`,
                }}>
                  ⭐
                </div>
              </div>
            ))}
          </>
        )}

        {/* Red sirens for crash - distributed all around the page */}
        {animationPhase === 'result' && !isTakeOff && (
          <>
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${(i * 13.37) % 100}%`, // Distribute across full width
                  top: `${(i * 19.73) % 100}%`, // Distribute across full height
                  animation: `starPop 0.5s ease-out ${i * 0.05}s forwards`,
                  opacity: 0,
                }}
              >
                <div style={{
                  fontSize: '2rem',
                  animation: `spinStar 2s linear infinite ${0.5 + i * 0.05}s`,
                }}>
                  🚨
                </div>
              </div>
            ))}
          </>
        )}

        {/* Text overlay */}
        {animationPhase === 'result' && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '4rem',
            fontWeight: 900,
            color: isTakeOff ? '#10b981' : '#ef4444',
            textShadow: '0 4px 20px rgba(0,0,0,0.8)',
            animation: 'fadeInScale 0.5s ease-out forwards',
            opacity: 0,
            zIndex: 100,
          }}>
            {isTakeOff ? '🚀 TAKEOFF!' : '💥 CRASH!'}
          </div>
        )}

        <style>{`
          @keyframes spin {
            from { transform: translateY(-50%) rotate(0deg); }
            to { transform: translateY(-50%) rotate(360deg); }
          }
          
          @keyframes smoke {
            0% {
              opacity: 0.9;
              transform: translateX(0) translateY(0) scale(1);
            }
            50% {
              opacity: 0.7;
              transform: translateX(-30px) translateY(-20px) scale(1.3);
            }
            100% {
              opacity: 0;
              transform: translateX(-60px) translateY(-40px) scale(1.5);
            }
          }
          
          @keyframes smokePuff {
            0%, 100% {
              transform: scale(1);
              opacity: 0.8;
            }
            50% {
              transform: scale(1.5);
              opacity: 0.4;
            }
          }
          
          @keyframes starPop {
            0% {
              opacity: 0;
              transform: scale(0);
            }
            50% {
              opacity: 1;
              transform: scale(1.5);
            }
            100% {
              opacity: 0.8;
              transform: scale(1);
            }
          }
          
          @keyframes spinStar {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          
          @keyframes fadeInScale {
            from {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.5);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }
        `}</style>
      </div>
    )
  }

  // Normal view - show plane position on runway
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '150px',
      marginBottom: '2rem',
      backgroundColor: '#f3f4f6',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Runway */}
      <div style={{
        position: 'absolute',
        bottom: '30px',
        left: '20px',
        right: '140px',
        height: '12px',
        backgroundColor: '#4a5568',
        borderRadius: '6px',
      }}>
        {/* Runway lines */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '3px',
          background: 'repeating-linear-gradient(to right, #fff 0, #fff 30px, transparent 30px, transparent 60px)',
          transform: 'translateY(-50%)',
        }} />
      </div>

      {/* Crash Wall */}
      <div style={{
        position: 'absolute',
        right: '20px',
        bottom: '20px',
        width: '100px',
        height: '120px',
        backgroundColor: '#dc2626',
        border: '3px solid #991b1b',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
      }}>
        <div style={{
          fontSize: '1.2rem',
          fontWeight: 900,
          color: '#fff',
          textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
        }}>
          CRASH
        </div>
      </div>

      {/* Company Name and Rocket */}
      <div style={{
        position: 'absolute',
        bottom: '30px',
        left: `${20 + planePosition * 0.8}px`,
        transform: 'translateY(0)',
        transition: 'left 0.5s ease-out',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Company name text - above rocket */}
        <div style={{
          color: '#1f2937',
          fontSize: '0.85rem',
          fontWeight: 700,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          marginBottom: '6px',
        }}>
          {companyName}
        </div>
        
        {/* Rocket emoji - horizontally oriented, pointing left */}
        <div style={{
          fontSize: '3rem',
          transform: 'rotate(50deg)',
          lineHeight: 1,
        }}>
          🚀
        </div>
      </div>

      {/* Cash indicator */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '20px',
        fontSize: '0.9rem',
        fontWeight: 600,
        color: hasRunwayEnd && runwayMonths < 6 ? '#ef4444' : '#1f2937',
      }}>
        {hasRunwayEnd 
          ? `${runwayMonths} months until crash` 
          : 'Your Runway ✈️'}
      </div>
    </div>
  )
}

export default AirplaneAnimation

