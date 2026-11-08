const MAX_DIMENSION = 1920
const TARGET_BYTES = 1_000_000
const MIN_QUALITY = 0.4

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/**
 * Skalar ner och komprimerar ett bildfoto (från kameran eller bildrullen) innan det sparas –
 * en rak kameraBild kan annars vara 5–15 MB, vilket snabbt blir ett gäng hundra MB lagrat per
 * rum/tagg med flera bilder, och bidrar till den sortens minnestryck som (se tidigare
 * ändringar) kunde göra att kameran eller hela fliken slutade fungera. 1920px på längsta sidan
 * räcker gott för att granska ett rum/en materialyta i appen. Provar en gradvis lägre JPEG-
 * kvalitet tills resultatet är under ~1 MB (eller kvalitetsgolvet nås) – de allra flesta foton
 * landar redan på första eller andra försöket.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Vissa filformat (eller trasiga filer) går inte att avkoda via createImageBitmap – då är
    // originalfilen bättre än inget foto alls.
    return file
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let blob: Blob | null = null
  for (const quality of [0.82, 0.7, 0.55, MIN_QUALITY]) {
    blob = await canvasToBlob(canvas, quality)
    if (blob && blob.size <= TARGET_BYTES) break
  }
  // Om inte ens lägsta kvaliteten kom under målet (t.ex. en väldigt detaljerad bild) – använd
  // ändå det sista (minsta) försöket istället för att falla tillbaka på originalet, som garanterat
  // är större.
  if (!blob) return file

  const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], newName, { type: 'image/jpeg', lastModified: file.lastModified })
}
