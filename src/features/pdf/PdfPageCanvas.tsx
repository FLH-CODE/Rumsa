import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import type { Room } from '../../db'
import type { ElementSize } from '../../hooks/useElementSize'

/** Hur mycket extra upplösning (utöver skärmens pixeltäthet) som renderas utöver fit-to-screen,
 * så att man kan zooma in en bit innan bilden börjar bli suddig/pixelerad. */
const BASE_SHARPNESS = 2.5
/** Skyddar mot canvas-storleksgränser på vissa mobila webbläsare (t.ex. iOS Safari). */
const MAX_BACKING_DIMENSION = 4096

/** Hur långt man kan zooma in bortom fit-to-screen (scale 1) innan skärpan tar slut. Matchar BASE_SHARPNESS. */
export const PDF_MAX_ZOOM = BASE_SHARPNESS

export function PdfPageCanvas({
  doc,
  pageIndex,
  containerSize,
  zoomScale = 1,
  rooms = [],
  onRoomTap,
  addMode = false,
  onCanvasTap,
}: {
  doc: PDFDocumentProxy
  pageIndex: number
  /** Tillgängligt utrymme att fylla vid zoom-skala 1 (fit-to-screen). */
  containerSize: ElementSize | null
  /** Aktuell zoom-skala från TransformWrapper, används för att hålla rumstaggarnas storlek konstant på skärmen. */
  zoomScale?: number
  rooms?: Room[]
  onRoomTap?: (room: Room) => void
  /** När true: ett klick på ritningen (utanför en befintlig tagg) placerar ett nytt rum där. */
  addMode?: boolean
  onCanvasTap?: (pdfX: number, pdfY: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Taggad med pageIndex så en viewport från en tidigare sida aldrig används för hotspot-positioner
  // när props hunnit ändras innan renderingen var klar. displayViewport matchar canvasens CSS-storlek
  // (fit-to-screen-skala), inte dess högupplösta backing store.
  const [rendered, setRendered] = useState<{ pageIndex: number; displayViewport: PageViewport } | null>(null)

  useEffect(() => {
    let renderTask: RenderTask | null = null
    let cancelled = false

    doc.getPage(pageIndex + 1).then((page) => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return

      const natural = page.getViewport({ scale: 1 })
      const fitScale = containerSize
        ? Math.min(containerSize.width / natural.width, containerSize.height / natural.height)
        : 1
      const dpr = window.devicePixelRatio || 1
      let renderScale = fitScale * dpr * BASE_SHARPNESS

      const maxBackingDim = Math.max(natural.width, natural.height) * renderScale
      if (maxBackingDim > MAX_BACKING_DIMENSION) {
        renderScale *= MAX_BACKING_DIMENSION / maxBackingDim
      }

      const renderViewport = page.getViewport({ scale: renderScale })
      const displayViewport = page.getViewport({ scale: fitScale })

      canvas.width = Math.ceil(renderViewport.width)
      canvas.height = Math.ceil(renderViewport.height)
      canvas.style.width = `${displayViewport.width}px`
      canvas.style.height = `${displayViewport.height}px`

      const canvasContext = canvas.getContext('2d')!
      renderTask = page.render({ canvasContext, viewport: renderViewport, canvas })
      renderTask.promise
        .then(() => {
          if (!cancelled) setRendered({ pageIndex, displayViewport })
        })
        .catch(() => {
          /* avbruten rendering vid snabb sidbyte – inget fel att visa */
        })
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
    // Jämför bredd/höjd, inte objektreferensen, som annars triggar om på varje ResizeObserver-tick
    // även när storleken inte faktiskt ändrats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageIndex, containerSize?.width, containerSize?.height])

  const viewport = rendered?.pageIndex === pageIndex ? rendered.displayViewport : null
  const hotspotScale = 1 / zoomScale

  const handleStageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!addMode || !viewport || !onCanvasTap) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cssX = e.clientX - rect.left
    const cssY = e.clientY - rect.top
    const [pdfX, pdfY] = viewport.convertToPdfPoint(cssX, cssY) as [number, number]
    onCanvasTap(pdfX, pdfY)
  }

  return (
    <div className={`pdf-page-stage${addMode ? ' add-mode' : ''}`} onClick={handleStageClick}>
      <canvas ref={canvasRef} />
      {viewport &&
        rooms.map((room) => {
          const [x, y] = viewport.convertToViewportPoint(room.tagX, room.tagY)
          return (
            <button
              key={room.id}
              className="room-hotspot"
              style={{ left: x, top: y, transform: `scale(${hotspotScale})` }}
              onClick={(e) => {
                e.stopPropagation()
                onRoomTap?.(room)
              }}
              aria-label={`${room.roomName} ${room.roomNumber}`}
            />
          )
        })}
    </div>
  )
}
