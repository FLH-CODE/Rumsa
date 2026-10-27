import type { KeyboardEvent } from 'react'
import type { RoomCategory } from '../../db'
import { CATEGORY_LABEL } from './categories'

const STROKE = '#b8c2c7'
const HIGHLIGHT = 'rgba(22, 78, 99, 0.38)'

/**
 * Vägg, tak och golv som tre fristående, kurvade "blad" som fjädrar ut från en gemensam
 * vägg-stam – som i den handritade principskissen – istället för en sammanhängande,
 * rätvinklig perspektivteckning. Varje yta är själv den klickbara knappen (inga separata ikoner
 * ovanpå); den aktiva ytan får en highlight-fyllning istället för att en ikon markeras någon
 * annanstans.
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
    <svg viewBox="0 0 190 150" className="room-perspective-nav">
      <title>Välj yta</title>
      <g {...faceProps('tak')}>
        <path d="M28,70 Q90,8 180,20 Q115,50 28,70 Z" fill={fill('tak')} stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <g {...faceProps('golv')}>
        <path d="M28,80 Q90,142 180,130 Q115,100 28,80 Z" fill={fill('golv')} stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <g {...faceProps('vagg')}>
        <rect x="8" y="50" width="20" height="50" rx="9" fill={fill('vagg')} stroke={STROKE} strokeWidth="1.5" />
      </g>
    </svg>
  )
}
