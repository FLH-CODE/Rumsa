import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { useObjectUrl } from '../../hooks/useObjectUrl'

/** Liten förhandsvisning av taggens EGNA referensfoto (se TagPhoto/TagEditSheet) – bara det
 * först tillagda, inte hela galleriet, så man känner igen t.ex. "Klinker 2" på en snabb titt i
 * rumskortets taggpalett/applicerade material eller i taggöversikten, utan att behöva öppna
 * taggen för att se dess bilder. Visar ingenting (inte ens en platshållare) om taggen saknar
 * foto, så den inte tar onödig plats för de många taggar som aldrig fått ett.
 */
export function TagThumbnail({ tagId }: { tagId: string }) {
  const photo = useLiveQuery(() => db.tagPhotos.where('tagId').equals(tagId).first(), [tagId])
  const url = useObjectUrl(photo?.blob)
  if (!url) return null
  return <img src={url} alt="" className="tag-thumbnail" />
}
