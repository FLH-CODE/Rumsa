import { useEffect, useState } from 'react'

type ConfirmOptions = {
  confirmLabel?: string
  cancelLabel?: string
  /** Målar bekräfta-knappen i varningsfärg – för destruktiva åtgärder (ta bort). */
  danger?: boolean
}

type ConfirmRequest = {
  message: string
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

let currentListener: ((request: ConfirmRequest) => void) | null = null

/**
 * Ersätter webbläsarens inbyggda `confirm()` – den visar alltid webbläsarens egen, ostyl-bara
 * ruta med sidans adress som rubrik ("flh-code.github.io säger…"), vilket inte går att ta bort
 * eller göra mindre. Den här varianten är en vanlig, liten modal i appens eget bildspråk.
 * `<ConfirmDialogHost />` måste vara monterad en gång, högt upp i trädet (se App.tsx).
 */
export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!currentListener) {
      // Host inte monterad (bör inte hända) – säkraste reservvärdet är att avbryta, inte att
      // av misstag tillåta en destruktiv åtgärd utan att användaren sett frågan.
      resolve(false)
      return
    }
    currentListener({ message, options, resolve })
  })
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    currentListener = setRequest
    return () => {
      currentListener = null
    }
  }, [])

  useEffect(() => {
    if (!request) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') respond(false)
      if (e.key === 'Enter') respond(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  if (!request) return null

  const respond = (value: boolean) => {
    request.resolve(value)
    setRequest(null)
  }

  return (
    <div className="modal-backdrop confirm-dialog-backdrop" onClick={() => respond(false)}>
      <div className="modal-sheet confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-dialog-message">{request.message}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => respond(false)}>
            {request.options.cancelLabel ?? 'Avbryt'}
          </button>
          <button
            className={`btn ${request.options.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => respond(true)}
          >
            {request.options.confirmLabel ?? (request.options.danger ? 'Ta bort' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  )
}
