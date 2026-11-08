import { useEffect, useState } from 'react'

/** Skapar en object-URL för en blob och städar bort den igen vid unmount/bytt blob. Skapandet
 * sker INUTI effekten (inte via useMemo) – annars hinner StrictMode i dev-läge (som avsiktligt
 * kör en effekts cleanup en extra gång direkt efter montering, för att fånga den här typen av
 * buggar) återkalla url:en innan bilden hunnit visas, vilket gjorde den trasig redan vid första
 * visningen. */
export function useObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return url
}
