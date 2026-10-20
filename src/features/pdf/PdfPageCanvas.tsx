import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import type { Room } from '../../db'

export function PdfPageCanvas({
  doc,
  pageIndex,
  scale = 2,
  rooms = [],
  onRoomTap,
}: {
  doc: PDFDocumentProxy
  pageIndex: number
  scale?: number
  rooms?: Room[]
  onRoomTap?: (room: Room) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Taggad med pageIndex/scale så en viewport från en tidigare sida aldrig används för hotspot-positioner
  // när props hunnit ändras innan renderingen var klar.
  const [rendered, setRendered] = useState<{ pageIndex: number; scale: number; viewport: PageViewport } | null>(
    null,
  )

  useEffect(() => {
    let renderTask: RenderTask | null = null
    let cancelled = false

    doc.getPage(pageIndex + 1).then((page) => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const pageViewport = page.getViewport({ scale })
      canvas.width = pageViewport.width
      canvas.height = pageViewport.height
      const canvasContext = canvas.getContext('2d')!
      renderTask = page.render({ canvasContext, viewport: pageViewport, canvas })
      renderTask.promise
        .then(() => {
          if (!cancelled) setRendered({ pageIndex, scale, viewport: pageViewport })
        })
        .catch(() => {
          /* avbruten rendering vid snabb sidbyte – inget fel att visa */
        })
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [doc, pageIndex, scale])

  const viewport = rendered?.pageIndex === pageIndex && rendered.scale === scale ? rendered.viewport : null

  return (
    <div className="pdf-page-stage">
      <canvas ref={canvasRef} />
      {viewport &&
        rooms.map((room) => {
          const [x, y] = viewport.convertToViewportPoint(room.tagX, room.tagY)
          return (
            <button
              key={room.id}
              className="room-hotspot"
              style={{ left: x, top: y }}
              onClick={() => onRoomTap?.(room)}
              aria-label={`${room.roomName} ${room.roomNumber}`}
            />
          )
        })}
    </div>
  )
}
