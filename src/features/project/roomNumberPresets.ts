/** Förinställda mönster för att känna igen rumsnummer i ritningar – delas mellan projektskapande och projektinställningar. */
export const ROOM_NUMBER_PRESETS = [
  { label: 'Enkelt nummer (t.ex. 1003)', value: '^\\d{3,4}$' },
  { label: 'Med suffix (t.ex. 1006B, 102RWC)', value: '^\\d{3,4}[A-ZÅÄÖ]{0,4}$' },
  { label: 'Projektkod (t.ex. P20:F1B401)', value: '^P\\d{1,2}:[A-Z0-9]+$' },
]
