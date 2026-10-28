import { useEffect, useRef, useState } from 'react'
import { CameraIcon, CloseIcon } from './icons'
import { confirmDialog } from './ConfirmDialog'

/** Skapar en object-URL för en blob och städar bort den igen vid unmount/bytt blob. Skapandet
 * sker INUTI effekten (inte via useMemo) – annars hinner StrictMode i dev-läge (som avsiktligt
 * kör en effekts cleanup en extra gång direkt efter montering, för att fånga den här typen av
 * buggar) återkalla url:en innan bilden hunnit visas, vilket gjorde den trasig redan vid första
 * visningen. */
function useObjectUrl(blob: Blob): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url
}

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
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return
    void onAdd(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (photo: T) => {
    if (!(await confirmDialog('Ta bort bilden?', { danger: true }))) return
    await onDelete(photo)
    setOpenPhotoId((id) => (id === photo.id ? null : id))
  }

  const openPhoto = photos?.find((p) => p.id === openPhotoId)

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
            <PhotoThumb
              key={photo.id}
              blob={photo.blob}
              onOpen={() => setOpenPhotoId(photo.id)}
              onDelete={() => void handleDelete(photo)}
            />
          ))}
        </div>
      )}
      {openPhoto && <PhotoLightbox blob={openPhoto.blob} onClose={() => setOpenPhotoId(null)} />}
    </div>
  )
}

function PhotoThumb({ blob, onOpen, onDelete }: { blob: Blob; onOpen: () => void; onDelete: () => void }) {
  const url = useObjectUrl(blob)
  return (
    <div className="photo-thumb">
      <button type="button" className="photo-thumb-open" onClick={onOpen} aria-label="Visa bilden i storformat">
        {url && <img src={url} alt="" />}
      </button>
      <button type="button" className="material-entry-remove photo-thumb-remove" onClick={onDelete} aria-label="Ta bort bild">
        ✕
      </button>
    </div>
  )
}

/** Visar fotot i storformat ovanpå allt annat – stängs genom att trycka utanför bilden eller på
 * X-knappen. */
function PhotoLightbox({ blob, onClose }: { blob: Blob; onClose: () => void }) {
  const url = useObjectUrl(blob)
  return (
    <div className="photo-lightbox-backdrop" onClick={onClose}>
      <button type="button" className="photo-lightbox-close" onClick={onClose} aria-label="Stäng">
        <CloseIcon width={22} height={22} />
      </button>
      {url && <img src={url} alt="" className="photo-lightbox-img" onClick={(e) => e.stopPropagation()} />}
    </div>
  )
}
