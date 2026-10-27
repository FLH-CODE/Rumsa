import type { KeyboardEvent } from 'react'
import type { RoomCategory } from '../../db'
import { CATEGORY_LABEL } from './categories'

const STROKE = '#b8c2c7'
const HIGHLIGHT = 'rgba(22, 78, 99, 0.38)'

/**
 * Ett enda rumshörn i grov en-punktsperspektiv – golvet, taket och väggarna är själva de
 * klickbara ytorna (inga separata knappar ovanpå), precis som i principskissen. Den aktiva ytan
 * får en highlight-fyllning istället för att en ikon markeras någon annanstans, så det alltid är
 * tydligt vilken yta man redigerar.
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

  const faceGroupProps = (category: RoomCategory) => ({
    className: 'room-perspective-face',
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': CATEGORY_LABEL[category],
    'aria-pressed': active === category,
    onClick: () => onSelect(category),
    onKeyDown: handleKeyDown(category),
  })

  return (
    <svg viewBox="0 0 140 170" className="room-perspective-nav">
      <title>Välj yta</title>
      {/* Öppet hörn (golv/vänstervägg/bakvägg/tak) istället för alla fyra väggar – vänstra
         väggen och bakväggen räcker för att läsas som "ett rumshörn", och en högervägg gjorde
         bara illustrationen rörigare utan att tillföra något. */}
      <g {...faceGroupProps('tak')}>
        <polygon points="8,8 132,8 132,55 45,55" fill={fill('tak')} stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <g {...faceGroupProps('vagg')}>
        <polygon points="8,8 45,55 45,115 8,162" fill={fill('vagg')} stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
        <polygon points="45,55 132,55 132,115 45,115" fill={fill('vagg')} stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <g {...faceGroupProps('golv')}>
        <polygon points="8,162 132,162 132,115 45,115" fill={fill('golv')} stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
