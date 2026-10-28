import { useEffect, useMemo, useRef } from 'react'
import { CameraIcon } from './icons'
import { confirmDialog } from './ConfirmDialog'

/**
 * Delat galleri för foton tagna med kameran (eller valda ur bildrullen) – används både för foton
 * knutna till ett rum (RoomPhoto) och foton knutna till en materialtagg (TagPhoto). Varje
 * användningsplats ansvarar själv för att hämta sina foton och spara/ta bort dem i rätt Dexie-
 * tabell; den här komponenten äger bara själva galleri-UI:t.
 */
export function PhotoGallery<T extends { id: string; blob: Blob }>({
  photos,
  onAdd,
  onDelete,
}: {
  photos: T[] | undefined
  onAdd: (files: FileList) => unknown
  onDelete: (photo: T) => unknown
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return
    void onAdd(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (photo: T) => {
    if (!(await confirmDialog('Ta bort bilden?', { danger: true }))) return
    await onDelete(photo)
  }

  return (
    <div className="photo-gallery">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <button type="button" className="btn btn-secondary photo-add-btn" onClick={() => fileInputRef.current?.click()}>
        <CameraIcon width={18} height={18} /> Ta bild
      </button>
      {photos === undefined ? null : photos.length === 0 ? (
        <p className="field-hint category-empty">Inga bilder ännu.</p>
      ) : (
        <div className="photo-grid">
          {photos.map((photo) => (
            <PhotoThumb key={photo.id} blob={photo.blob} onDelete={() => void handleDelete(photo)} />
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoThumb({ blob, onDelete }: { blob: Blob; onDelete: () => void }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <div className="photo-thumb">
      <img src={url} alt="" />
      <button type="button" className="material-entry-remove photo-thumb-remove" onClick={onDelete} aria-label="Ta bort bild">
        ✕
      </button>
    </div>
  )
}
