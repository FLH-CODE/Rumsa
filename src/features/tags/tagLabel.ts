import type { MaterialTag } from '../../db'

/** Taggens kod, eller en läsbar platshållare om den saknas/är tom (t.ex. gammal testdata eller
 * en borttagen tagg) – `tag?.code ?? 'Okänd tagg'` missar en tagg med tom sträng som kod, vilket
 * annars visade upp ett helt namnlöst material utan att det syntes att något var fel. */
export function tagLabel(tag: MaterialTag | undefined | null): string {
  return tag?.code?.trim() || 'Okänd tagg'
}
