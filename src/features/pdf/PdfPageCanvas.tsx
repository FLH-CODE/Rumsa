import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import type { Room } from '../../db'
import type { ElementSize } from '../../hooks/useElementSize'

/** Hur länge man måste hålla inne en rumstagg innan det räknas som ett långt tryck (för att flytta
 * taggen) istället för ett vanligt klick (som öppnar rumskortet). */
const LONG_PRESS_MS = 500
/** Avbryter ett pågående långt tryck om pekaren flyttar sig mer än så här många pixlar innan
 * tiden gått ut – annars kunde en panorering som råkar börja ovanpå en tagg feltolkas som att man
 * höll in den. */
const LONG_PRESS_MOVE_TOLERANCE = 8

/** Hur mycket extra upplösning (utöver skärmens pixeltäthet) som renderas utöver fit-to-screen,
 * så att man kan zooma in en bit innan bilden börjar bli suddig/pixelerad. */
const BASE_SHARPNESS = 5
/** Skyddar mot canvas-storleksgränser på mobila webbläsare, räknat som total yta (bredd×höjd)
 * snarare än en enda sidas mått – avlånga planritningar (vanligt i liggande format) får då
 * utnyttja hela gränsen, vilket ger märkbart skarpare bild vid djup inzoomning än en enkel
 * maxmått-gräns. Stora (A1/A0) ritningar i hög DPI kunde annars tvingas ner till en upplösning
 * strax över fit-to-screen, vilket gjorde rumstaggar och text pixelerade redan vid måttlig
 * inzoomning – moderna mobila webbläsare klarar betydligt mer än det gamla, konservativa 4096×4096. */
const MAX_BACKING_AREA = 8192 * 8192

/** Hur långt man kan zooma in bortom fit-to-screen (scale 1). Satt högre än BASE_SHARPNESS –
 * bortom den punkten blir bilden gradvis mjukare istället för att tvärstanna, vilket känns mycket
 * mer som en vanlig bild-/karta-app än en hård zoom-vägg. */
export const PDF_MAX_ZOOM = BASE_SHARPNESS * 2

export function PdfPageCanvas({
  doc,
  pageIndex,
  containerSize,
  zoomScale = 1,
  rooms = [],
  completedRoomIds,
  highlightRoomIds,
  highlightColor,
  onRoomTap,
  onRoomLongPress,
  movingRoomId,
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
  /** Rum som redan har inventeringsdata – visas fyllda istället för tomma/ifyllningsbara. */
  completedRoomIds?: Set<string>
  /** När satt (inte undefined/null): färgfilter är aktivt. Rum i mängden lyfts fram i highlightColor,
   * övriga tonas ner. Ersätter då den vanliga klar/ej klar-färgsättningen. */
  highlightRoomIds?: Set<string> | null
  highlightColor?: string
  onRoomTap?: (room: Room) => void
  /** Håller man inne en rumstagg (se LONG_PRESS_MS) istället för att bara trycka på den. */
  onRoomLongPress?: (room: Room) => void
  /** Rummet som just nu håller på att flyttas (via onRoomLongPress) – visas med en egen markering
   * så det är tydligt vilken tagg nästa tryck på ritningen gäller. */
  movingRoomId?: string | null
  /** När true: ett klick på ritningen (utanför en befintlig tagg) placerar ett rum där – antingen
   * ett nytt (vanligt "lägg till rum"-läge) eller flyttar movingRoomId dit, beroende på vad
   * anroparen gör i sin egen onCanvasTap. */
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

      const backingArea = natural.width * natural.height * renderScale * renderScale
      if (backingArea > MAX_BACKING_AREA) {
        renderScale *= Math.sqrt(MAX_BACKING_AREA / backingArea)
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

  // Håller reda på ett pågående långt tryck (för att flytta en taggs placering, se
  // onRoomLongPress) separat från den vanliga klick-hanteringen – `suppressClick` förhindrar att
  // samma tryck ÄVEN öppnar rumskortet (det normala klick-beteendet) när det redan räknats som ett
  // långt tryck.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
  }

  const handleHotspotPointerDown = (room: Room) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onRoomLongPress || addMode) return
    longPressStartRef.current = { x: e.clientX, y: e.clientY }
    longPressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = true
      onRoomLongPress(room)
    }, LONG_PRESS_MS)
  }

  const handleHotspotPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const start = longPressStartRef.current
    if (!start) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_MOVE_TOLERANCE) {
      clearLongPressTimer()
    }
  }

  const handleStageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!addMode || !viewport || !onCanvasTap) return
    const canvas = canvasRef.current
    if (!canvas) return
    // getBoundingClientRect() returns the canvas's on-screen box AFTER the ancestor
    // TransformWrapper's pan/zoom CSS transform is applied, so a click offset measured against it
    // is in zoomed screen pixels – but `viewport` (built at the fit-to-screen scale, before any
    // pan/zoom) expects plain, un-zoomed CSS pixels. Skipping this division placed new rooms
    // wherever the cursor happened to be in the zoomed-out coordinate space instead of under the
    // actual tap, worse the further in the user had zoomed.
    const rect = canvas.getBoundingClientRect()
    const cssX = (e.clientX - rect.left) / zoomScale
    const cssY = (e.clientY - rect.top) / zoomScale
    const [pdfX, pdfY] = viewport.convertToPdfPoint(cssX, cssY) as [number, number]
    onCanvasTap(pdfX, pdfY)
  }

  return (
    <div className={`pdf-page-stage${addMode ? ' add-mode' : ''}`} onClick={handleStageClick}>
      <canvas ref={canvasRef} />
      {viewport &&
        rooms.map((room) => {
          const [x, y] = viewport.convertToViewportPoint(room.tagX, room.tagY)
          const done = completedRoomIds?.has(room.id)
          const filtering = highlightRoomIds != null
          const matches = filtering && highlightRoomIds.has(room.id)
          const moving = movingRoomId === room.id
          const className = [
            'room-hotspot',
            !filtering && done && 'done',
            filtering && (matches ? 'filter-match' : 'filter-dim'),
            moving && 'moving',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={room.id}
              className={className}
              style={{
                left: x,
                top: y,
                transform: `scale(${hotspotScale})`,
                ...(matches && highlightColor ? { background: highlightColor, borderColor: highlightColor } : {}),
              }}
              onPointerDown={handleHotspotPointerDown(room)}
              onPointerMove={handleHotspotPointerMove}
              onPointerUp={clearLongPressTimer}
              onPointerLeave={clearLongPressTimer}
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                if (suppressClickRef.current) {
                  suppressClickRef.current = false
                  return
                }
                onRoomTap?.(room)
              }}
              aria-label={`${room.roomName} ${room.roomNumber}${done ? ' – ifyllt' : ' – ej ifyllt'}`}
            />
          )
        })}
    </div>
  )
}
