import type { KeyboardEvent } from 'react'
import type { RoomCategory } from '../../db'
import { CATEGORY_LABEL } from './categories'

const STROKE = '#b8c2c7'
const HIGHLIGHT = 'rgba(22, 78, 99, 0.38)'
/** Samma hörnradie som appens övriga behållare (--radius-md), så ytorna känns som en del av
 * samma formspråk istället för en egen, spretig grafik. */
const RADIUS = 10

/**
 * Tre fristående ytor (vägg/tak/golv) med mellanrum emellan, istället för en sammanhängande
 * perspektivteckning – golvet/taket "fjädrar ut" från väggen ungefär som i principskissen. Varje
 * yta är själv den klickbara knappen (inga separata ikoner ovanpå); den aktiva ytan får en
 * highlight-fyllning istället för att en ikon markeras någon annanstans.
 */
export function RoomPerspectiveNav({
  active,
  onSelect,
}: {
  active: RoomCategory | null
  onSelect: (category: RoomCategory) => void
}) {
  const handleKeyDown = (category: RoomCategory) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(category)
    }
  }

  const fill = (category: RoomCategory) => (active === category ? HIGHLIGHT : 'transparent')

  const faceProps = (category: RoomCategory) => ({
    className: 'room-perspective-face',
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': CATEGORY_LABEL[category],
    'aria-pressed': active === category,
    onClick: () => onSelect(category),
    onKeyDown: handleKeyDown(category),
  })

  return (
    <svg viewBox="0 0 170 160" className="room-perspective-nav">
      <title>Välj yta</title>
      <g {...faceProps('tak')}>
        <rect x="52" y="14" width="100" height="46" rx={RADIUS} fill={fill('tak')} stroke={STROKE} strokeWidth="1.5" transform="rotate(-16 52 37)" />
      </g>
      <g {...faceProps('golv')}>
        <rect x="52" y="100" width="100" height="46" rx={RADIUS} fill={fill('golv')} stroke={STROKE} strokeWidth="1.5" transform="rotate(16 52 123)" />
      </g>
      <g {...faceProps('vagg')}>
        <rect x="10" y="54" width="24" height="52" rx={RADIUS} fill={fill('vagg')} stroke={STROKE} strokeWidth="1.5" />
      </g>
    </svg>
  )
}
