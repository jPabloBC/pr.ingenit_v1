'use client'

import { useMemo, useRef } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { Box, ButtonBase, Paper, Typography } from '@mui/material'
import type { PaperProps } from '@mui/material'
import { colors } from '@/theme/theme'

export type AppTabItem = {
  disabled?: boolean
  icon?: ReactElement
  label: string | ReactElement
  value: string
}

type AppTabsProps = {
  ariaLabel: string
  items: AppTabItem[]
  minItemWidth?: number
  onChange: (value: string) => void
  paperProps?: PaperProps
  value: string
}

export function AppTabs({ ariaLabel, items, minItemWidth = 112, onChange, paperProps, value }: AppTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const activeIndex = Math.max(0, items.findIndex((item) => item.value === value))
  const activeCenter = useMemo(() => items.length ? ((activeIndex + 0.5) / items.length) * 100 : 50, [activeIndex, items.length])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const enabledItems = items.map((item, itemIndex) => ({ ...item, itemIndex })).filter((item) => !item.disabled)
    if (!enabledItems.length) return
    const enabledIndex = enabledItems.findIndex((item) => item.itemIndex === index)
    const next = event.key === 'Home'
      ? enabledItems[0]
      : event.key === 'End'
        ? enabledItems[enabledItems.length - 1]
        : enabledItems[(enabledIndex + (event.key === 'ArrowRight' ? 1 : -1) + enabledItems.length) % enabledItems.length]
    onChange(next.value)
    window.requestAnimationFrame(() => {
      tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next.itemIndex]?.focus()
    })
  }

  return (
    <Paper
      ref={tabsRef}
      role="tablist"
      aria-label={ariaLabel}
      variant="outlined"
      {...paperProps}
      sx={[
        {
          position: 'relative',
          height: { xs: 82, sm: 90 },
          overflow: 'hidden',
          border: 0,
          borderRadius: 0,
          bgcolor: colors.blue3,
          boxShadow: 'none',
          isolation: 'isolate',
        },
        ...(Array.isArray(paperProps?.sx) ? paperProps.sx : paperProps?.sx ? [paperProps.sx] : []),
      ]}
    >
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          position: 'absolute',
          inset: { xs: '22px 0 0', sm: '25px 0 0' },
          bgcolor: theme.palette.background.paper,
          borderRadius: '14px 14px 0 0',
          zIndex: 0,
        })}
      />
      <Box sx={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}>
      <Box sx={{ position: 'relative', width: '100%', minWidth: `${Math.max(items.length, 1) * minItemWidth}px`, height: '100%' }}>
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: { xs: 21, sm: 24 },
            left: `calc(${activeCenter}% - 64px)`,
            width: 128,
            height: 38,
            color: colors.blue3,
            zIndex: 1,
            transition: 'left 420ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            pointerEvents: 'none',
          }}
        >
          <Box component="svg" viewBox="0 0 128 38" preserveAspectRatio="none" sx={{ display: 'block', width: '100%', height: '100%', fill: 'currentColor' }}>
            <path d="M0 0h19c13 0 15 32 45 32S96 0 109 0h19V0H0z" />
          </Box>
        </Box>
      <Box sx={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(${minItemWidth}px, 1fr))`, height: '100%' }}>
        {items.map((item, index) => {
          const selected = item.value === value
          return (
            <ButtonBase
              key={item.value}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              disableRipple
              sx={(theme) => ({
                position: 'relative',
                minWidth: 0,
                height: '100%',
                color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
                transition: theme.transitions.create(['color', 'background-color'], { duration: 220 }),
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)', color: theme.palette.primary.main },
                '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -3 },
              })}
            >
              {item.icon && (
                <Box
                  className="app-tab-icon"
                  sx={(theme) => ({
                    position: 'absolute',
                    top: selected ? { xs: 3, sm: 4 } : { xs: 29, sm: 33 },
                    left: '50%',
                    width: selected ? { xs: 42, sm: 46 } : 28,
                    height: selected ? { xs: 42, sm: 46 } : 28,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    bgcolor: selected ? theme.palette.background.paper : 'transparent',
                    color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
                    boxShadow: selected ? '0 5px 14px rgba(0, 38, 77, 0.2)' : 'none',
                    transform: `translateX(-50%) scale(${selected ? 1.05 : 0.9})`,
                    transition: 'top 420ms cubic-bezier(0.34, 1.56, 0.64, 1), width 280ms ease, height 280ms ease, transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), color 220ms ease, background-color 220ms ease, box-shadow 220ms ease',
                    '& svg': { fontSize: selected ? { xs: 23, sm: 25 } : 21 },
                  })}
                >
                  {item.icon}
                </Box>
              )}
              <Typography
                component="span"
                sx={{
                  position: 'absolute',
                  left: 8,
                  right: 8,
                  bottom: { xs: 8, sm: 10 },
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: { xs: '0.88rem', sm: '0.95rem' },
                  fontWeight: selected ? 500 : 400,
                  lineHeight: 1.2,
                  transition: 'color 220ms ease, font-weight 220ms ease',
                }}
              >
                {item.label}
              </Typography>
            </ButtonBase>
          )
        })}
      </Box>
      </Box>
      </Box>
    </Paper>
  )
}
