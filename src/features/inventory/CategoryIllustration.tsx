import type { RoomCategory } from '../../db'

const STROKE = '#b8c2c7'

/**
 * Liten, dekorativ linjeteckning av ett rumshörn i grov perspektiv – bara till för att visuellt
 * förankra vilken yta (golv/vägg/tak) man redigerar, som i den handritade principskissen. Inget
 * försök att visa rummets faktiska geometri eller placera materialtaggarna rumsligt.
 */
export function CategoryIllustration({ category }: { category: RoomCategory }) {
  if (category === 'golv') {
    return (
      <svg className="category-illustration" viewBox="0 0 200 80" fill="none">
        <polygon points="30,8 170,8 198,72 2,72" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M30 8 2 72M170 8l28 64M60 8l-18 64M140 8l18 64M100 8v64" stroke={STROKE} strokeWidth="1" />
      </svg>
    )
  }
  if (category === 'tak') {
    return (
      <svg className="category-illustration" viewBox="0 0 200 80" fill="none">
        <polygon points="2,8 198,8 170,72 30,72" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="100" cy="38" r="7" stroke={STROKE} strokeWidth="1.5" />
        <path d="M100 45v27" stroke={STROKE} strokeWidth="1" />
      </svg>
    )
  }
  return (
    <svg className="category-illustration" viewBox="0 0 200 80" fill="none">
      <rect x="10" y="8" width="180" height="64" rx="1" stroke={STROKE} strokeWidth="1.5" />
      <path d="M10 60h180" stroke={STROKE} strokeWidth="1" />
    </svg>
  )
}
