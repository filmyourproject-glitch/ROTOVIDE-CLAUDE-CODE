import * as blazeface from '@tensorflow-models/blazeface'
import * as tf from '@tensorflow/tfjs'

let model: blazeface.BlazeFaceModel | null = null

export async function loadFaceModel(): Promise<void> {
  if (model) return
  await tf.ready()
  model = await blazeface.load({
    maxFaces: 1,
    inputWidth: 128,
    inputHeight: 128,
    iouThreshold: 0.3,
    scoreThreshold: 0.75,
  })
}

export interface FaceCrop {
  centerX: number
  centerY: number
  confidence: number
  detected: boolean
}

export async function detectFaceInFrame(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<FaceCrop> {
  if (!model) await loadFaceModel()

  try {
    const predictions = await model!.estimateFaces(source, false)

    if (!predictions || predictions.length === 0) {
      return { centerX: 0.5, centerY: 0.4, confidence: 0, detected: false }
    }

    const face = predictions[0]
    const topLeft = face.topLeft as [number, number]
    const bottomRight = face.bottomRight as [number, number]

    const width = 'naturalWidth' in source
      ? source.naturalWidth
      : (source as HTMLVideoElement).videoWidth || source.width
    const height = 'naturalHeight' in source
      ? source.naturalHeight
      : (source as HTMLVideoElement).videoHeight || source.height

    const faceCenterX = (topLeft[0] + bottomRight[0]) / 2 / width
    const faceCenterY = (topLeft[1] + bottomRight[1]) / 2 / height

    return {
      centerX: Math.max(0.1, Math.min(0.9, faceCenterX)),
      centerY: Math.max(0.1, Math.min(0.9, faceCenterY)),
      confidence: Number((face.probability as any)?.[0] ?? face.probability ?? 0),
      detected: true,
    }
  } catch (err) {
    console.warn('Face detection failed, using center crop:', err)
    return { centerX: 0.5, centerY: 0.4, confidence: 0, detected: false }
  }
}

export async function detectFaceFromUrl(imageUrl: string): Promise<FaceCrop> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = async () => {
      const result = await detectFaceInFrame(img)
      resolve(result)
    }
    img.onerror = () => {
      resolve({ centerX: 0.5, centerY: 0.4, confidence: 0, detected: false })
    }
    img.src = imageUrl
  })
}

export function getSmartCropPosition(faceCrop: FaceCrop | undefined, format?: string): string {
  if (!faceCrop || !faceCrop.detected) {
    return 'center 30%'
  }
  const xPercent = Math.round(faceCrop.centerX * 100)
  const yPercent = Math.round(faceCrop.centerY * 100)

  // For 9:16 vertical format on a 16:9 source, compute correct object-position
  // using the container/video aspect ratio to map face position to CSS percentage
  if (format === '9:16') {
    const r = (9 / 16) / (16 / 9); // ≈ 0.316
    const objectX = Math.max(0, Math.min(100,
      ((faceCrop.centerX - r / 2) / (1 - r)) * 100
    ));
    return `${Math.round(objectX)}% ${yPercent}%`;
  }

  return `${xPercent}% ${yPercent}%`
}

/**
 * Extract a preview frame from a video file at a given seek percentage.
 * Defaults to 15% into the video to avoid dark/blurry first frames.
 */
export async function extractPreviewFrame(
  file: File,
  seekPercent: number = 0.15
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const url = URL.createObjectURL(file)
    video.src = url

    video.onloadedmetadata = () => {
      const seekTime = video.duration * Math.max(0, Math.min(1, seekPercent))
      video.currentTime = seekTime
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas context failed'))
        return
      }
      ctx.drawImage(video, 0, 0)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (blob) resolve(blob)
          else reject(new Error('toBlob returned null'))
        },
        'image/jpeg',
        0.85
      )
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Video load failed'))
    }
  })
}

/**
 * Try multiple seek positions and return the best face crop result.
 * Stops early if confidence > 0.85.
 */
export async function detectBestFaceFromFile(
  file: File
): Promise<{ frame: Blob; crop: FaceCrop }> {
  const candidates = [0.15, 0.30, 0.50]
  let bestFrame: Blob | null = null
  let bestCrop: FaceCrop = { centerX: 0.5, centerY: 0.4, confidence: 0, detected: false }

  await loadFaceModel()

  for (const pct of candidates) {
    try {
      const frameBlob = await extractPreviewFrame(file, pct)
      const img = await blobToImage(frameBlob)
      const crop = await detectFaceInFrame(img)

      if (crop.detected && crop.confidence > bestCrop.confidence) {
        bestCrop = crop
        bestFrame = frameBlob
      }

      if (bestCrop.confidence > 0.85) break
    } catch {
      // skip failed frame
    }
  }

  if (!bestFrame) {
    bestFrame = await extractPreviewFrame(file, 0.15).catch(() => new Blob())
  }

  return { frame: bestFrame, crop: bestCrop }
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image load failed'))
    }
    img.src = url
  })
}
