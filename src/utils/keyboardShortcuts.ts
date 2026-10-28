import type { KeyboardEvent } from 'react'

/** Enter bekräftar/sparar, Escape avbryter/ignorerar – för formulär med tydliga bekräfta/avbryt-knappar. */
export function confirmOnEnterEscape(onConfirm: () => void, onCancel: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }
}

/** Enter/Escape avslutar redigeringen (döljer tangentbordet) för fält som autosparar fortlöpande
 * och därför inte har någon separat bekräfta/avbryt-knapp att koppla till. */
export function blurOnEnterEscape(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.currentTarget.blur()
  }
}

/** Samma som blurOnEnterEscape, fast bara Escape – för flerradiga textfält (textarea) där Enter
 * ska skriva en ny rad istället för att avsluta redigeringen. */
export function blurOnEscape(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Escape') {
    e.currentTarget.blur()
  }
}
