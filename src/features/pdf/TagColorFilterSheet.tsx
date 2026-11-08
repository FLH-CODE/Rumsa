import { ROOM_CATEGORIES, type MaterialTag } from '../../db'
import { colorForIndex } from '../tags/colorForValue'
import { CloseIcon } from '../../components/icons'
import { CATEGORY_LABEL } from '../inventory/categories'
import { TagThumbnail } from '../tags/TagThumbnail'

/**
 * Bottensheet för att välja en materialtagg att färglägga rummen efter på ritningen – t.ex. för
 * att snabbt se var all "Klinker 1" sitter utan att öppna varje rum. Rum utan den valda taggen
 * tonas ner istället för att tas bort, så planens form är kvar som referens.
 */
export function TagColorFilterSheet({
  tags,
  selectedTagId,
  onSelect,
  onClose,
}: {
  tags: MaterialTag[]
  selectedTagId: string | null
  onSelect: (tagId: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop tag-filter-backdrop" onClick={onClose}>
      <div className="modal-sheet tag-filter-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn-ghost btn tap-target sheet-close-float" onClick={onClose} aria-label="Stäng">
          <CloseIcon width={18} height={18} />
        </button>
        <h2 style={{ margin: 0 }}>Filter</h2>
        <div className="tag-filter-body">
          {tags.length === 0 ? (
            <p className="field-hint">Inga materialtaggar i projektet ännu.</p>
          ) : (
            <>
              <button
                type="button"
                className={`tag-filter-option${selectedTagId === null ? ' active' : ''}`}
                onClick={() => {
                  onSelect(null)
                  onClose()
                }}
              >
                <span className="material-color-dot" style={{ background: 'transparent', border: '1px solid var(--color-border)' }} />
                Inget filter
              </button>
              {ROOM_CATEGORIES.map((category) => {
                const categoryTags = tags.filter((t) => t.category === category)
                if (categoryTags.length === 0) return null
                return (
                  <section key={category} className="tag-section tag-filter-section">
                    <h3 className="section-heading-text">{CATEGORY_LABEL[category]}</h3>
                    <div className="tag-filter-list">
                      {categoryTags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          className={`tag-filter-option${selectedTagId === tag.id ? ' active' : ''}`}
                          onClick={() => {
                            onSelect(tag.id)
                            onClose()
                          }}
                        >
                          <span className="material-color-dot" style={{ background: colorForIndex(tag.colorIndex) }} />
                          {tag.code}
                          <TagThumbnail tagId={tag.id} />
                        </button>
                      ))}
                    </div>
                  </section>
                )
              })}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Stäng
          </button>
        </div>
      </div>
    </div>
  )
}
