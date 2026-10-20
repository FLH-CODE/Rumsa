import { importDrawingFile } from './features/pdf/importDrawing'

declare global {
  interface Window {
    __rumsaImportDrawingFile?: typeof importDrawingFile
  }
}

// Testkrok för manuell/automatiserad verifiering utan riktig fil-dialog. Byggs bort i produktion.
if (import.meta.env.DEV) {
  window.__rumsaImportDrawingFile = importDrawingFile
}
