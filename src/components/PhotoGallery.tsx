import { useEffect, useRef, useState } from 'react'
import { CameraIcon, CloseIcon } from './icons'
import { confirmDialog } from './ConfirmDialog'
import { compressImage } from '../utils/compressImage'

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
  onAdd: (files: File[]) => unknown
  onDelete: (photo: T) => unknown
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)
  // Frågan (se nedan) ställs bara EN gång per gång galleriet öppnas – kameran kan bara ta en bild
  // åt gången, så att ta flera bilder i rad (ett helt vanligt sätt att dokumentera ett rum) innebär
  // flera separata tagningar efter varandra. Att fråga om ersätt/lägg-till vid VARJE enskild
  // tagning gjorde det i praktiken omöjligt att bygga upp mer än en bild utan att ständigt avbrytas
  // av samma fråga – ett svar (vilketdera) gäller därför resten av den här öppningen.
  const hasAskedReplaceRef = useRef(false)

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    // Kopieras till en egen array DIREKT – input.files är en LEVANDE lista, så att nollställa
    // inputens value (för att kunna välja om samma fil) skulle annars tömma den redan mottagna
    // listan innan onAdd hinner läsa den, och tagningen skulle tyst inte lägga till något alls.
    const rawFiles = Array.from(fileList)
    if (fileInputRef.current) fileInputRef.current.value = ''
    // Skalas ner och komprimeras (se compressImage) INNAN de sparas – en orörd kamerabild kan
    // annars vara flera MB, vilket snabbt blir mycket lagrat data och bidrar till den sortens
    // minnestryck som tidigare kunde göra kameran/hela fliken opålitlig.
    const files = await Promise.all(rawFiles.map((file) => compressImage(file)))
    // Frågar bara om det redan finns bilder OCH frågan inte redan ställts den här gången – annars
    // är det första bilden och det finns inget att ersätta. "Avbryt" (eller Escape/bakgrundsklick,
    // som också svarar nej) betyder "lägg till" (den gamla standarden), inte att hela tagningen
    // avbryts – det är det icke-förstörande valet.
    if (!hasAskedReplaceRef.current && photos && photos.length > 0) {
      hasAskedReplaceRef.current = true
      const replace = await confirmDialog(
        photos.length === 1
          ? 'Det finns redan en bild. Ersätt den befintliga bilden, eller lägg till den nya också?'
          : 'Det finns redan bilder. Ersätt de befintliga bilderna, eller lägg till den nya också?',
        { confirmLabel: 'Ersätt', cancelLabel: 'Lägg till' },
      )
      if (replace) {
        for (const photo of photos) await onDelete(photo)
      }
    }
    void onAdd(files)
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
        onChange={(e) => void handleFilesSelected(e.target.files)}
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
