'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { DeleteOutline } from '@mui/icons-material'
import { colors } from '@/theme/theme'
import { AppButton } from './AppButton'

type Point = { x: number; y: number }

type SignaturePadProps = {
  disabled?: boolean
  onChange: (dataUrl: string) => void
}

export function SignaturePad({ disabled = false, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Point[][]>([])
  const activeStrokeRef = useRef<Point[] | null>(null)
  const [hasSignature, setHasSignature] = useState(false)

  const drawStrokes = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const ratio = window.devicePixelRatio || 1
    const width = canvas.width / ratio
    const height = canvas.height / ratio
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = colors.white
    context.fillRect(0, 0, width, height)
    context.strokeStyle = colors.blue1
    context.fillStyle = colors.blue1
    context.lineWidth = 2.2
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (const stroke of strokesRef.current) {
      if (stroke.length === 1) {
        context.beginPath()
        context.arc(stroke[0].x * width, stroke[0].y * height, 1.1, 0, Math.PI * 2)
        context.fill()
        continue
      }
      context.beginPath()
      stroke.forEach((point, index) => {
        const x = point.x * width
        const y = point.y * height
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(bounds.width * ratio))
      canvas.height = Math.max(1, Math.round(bounds.height * ratio))
      drawStrokes()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [drawStrokes])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke = [pointFromEvent(event)]
    strokesRef.current.push(stroke)
    activeStrokeRef.current = stroke
    setHasSignature(true)
    drawStrokes()
  }

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !activeStrokeRef.current) return
    event.preventDefault()
    activeStrokeRef.current.push(pointFromEvent(event))
    drawStrokes()
  }

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return
    event.preventDefault()
    activeStrokeRef.current = null
    drawStrokes()
    onChange(canvasRef.current?.toDataURL('image/png') || '')
  }

  const clear = () => {
    strokesRef.current = []
    activeStrokeRef.current = null
    setHasSignature(false)
    drawStrokes()
    onChange('')
  }

  return (
    <Box>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${colors.managementBorder}`,
          borderRadius: 1,
          bgcolor: colors.white,
          '&:focus-within': { outline: `2px solid ${colors.blue600}`, outlineOffset: 1 },
        }}
      >
        <Box
          component="canvas"
          ref={canvasRef}
          role="img"
          aria-label="Área para dibujar la firma"
          tabIndex={0}
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          sx={{ display: 'block', width: '100%', height: { xs: 180, sm: 210 }, cursor: disabled ? 'not-allowed' : 'crosshair', touchAction: 'none' }}
        />
        {!hasSignature && (
          <Typography
            aria-hidden="true"
            sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: colors.gray6, px: 2, textAlign: 'center' }}
          >
            Firma aquí con el dedo, mouse o lápiz
          </Typography>
        )}
        <Box sx={{ position: 'absolute', left: 20, right: 20, bottom: 28, borderBottom: `1px solid ${colors.gray8}`, pointerEvents: 'none' }} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mt: 1 }}>
        <AppButton size="small" variant="outlined" startIcon={<DeleteOutline />} onClick={clear} disabled={disabled || !hasSignature}>
          Limpiar
        </AppButton>
      </Box>
    </Box>
  )
}
