import type { KeyboardEvent } from 'react'
import type { RoomCategory } from '../../db'
import { CATEGORY_LABEL } from './categories'

const STROKE = '#b8c2c7'
const HIGHLIGHT = 'rgba(22, 78, 99, 0.38)'

/** Ett enda blad, hämtat rakt av ur den handritade/vektoriserade principskissen (en spetsig,
 * "ögonformad" kurva) – återanvänds fyra gånger (en per väderstreck) via samma transformer som i
 * originalfilen, bara beskuret till ett tajtare viewBox. */
const PETAL_D =
  'M486.234,909.728L486.234,683.809C486.234,681.537 487.599,679.487 489.696,678.612C491.793,677.737 494.211,678.209 495.826,679.807L581.93,765.03C585.722,768.784 587.856,773.897 587.856,779.233L587.856,814.304C587.856,819.639 585.722,824.753 581.93,828.507L495.826,913.73C494.211,915.328 491.793,915.799 489.696,914.924C487.599,914.05 486.234,912 486.234,909.728Z'

/**
 * Golv/vägg/tak som fyra blad i ett enda "väderkvarns"-mönster – taket pekar uppåt, golvet neråt
 * och väggen är de två sidobladen tillsammans (vänster + höger räknas som samma yta). Formen är
 * tagen direkt från användarens egen skiss/SVG, bara centrerad och beskuren till ett tajtare
 * viewBox. Varje yta är själv den klickbara knappen; den aktiva ytan får en highlight-fyllning.
 */
export function RoomPerspectiveNav({
  active,
  onSelect,
  filled,
}: {
  active: RoomCategory | null
  onSelect: (category: RoomCategory) => void
  /** Vilka ytor som redan har ifylld data – ritas med ett tjockare streck så man ser skillnaden
   * mot en tom yta utan att behöva öppna varje flik för att kolla. */
  filled?: Partial<Record<RoomCategory, boolean>>
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

  const petalProps = (category: RoomCategory) => ({
    d: PETAL_D,
    fill: fill(category),
    stroke: STROKE,
    strokeWidth: filled?.[category] ? 4 : 2,
  })

  return (
    <svg viewBox="460 630 330 330" className="room-perspective-nav">
      <title>Välj yta</title>
      {/* Tak: bladet roterat så det pekar uppåt (bulen vänd nedåt, mot mitten). */}
      <g {...faceGroupProps('tak')}>
        <path {...petalProps('tak')} transform="matrix(0,1,1,-0,-167.342275,168.98984)" />
      </g>
      {/* Golv: samma blad speglat/roterat så det pekar nedåt. */}
      <g {...faceGroupProps('golv')}>
        <path {...petalProps('golv')} transform="matrix(0,-1,1,0,-167.342275,1422.664133)" />
      </g>
      {/* Vägg: de två sidobladen (vänster + höger) räknas som en och samma klickbara yta. */}
      <g {...faceGroupProps('vagg')}>
        <path {...petalProps('vagg')} />
        <path {...petalProps('vagg')} transform="matrix(-1,0,0,1,1257.087106,0)" />
      </g>
    </svg>
  )
}
