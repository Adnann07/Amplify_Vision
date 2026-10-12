import { useEffect, useState } from 'react'

interface NasaMissionImageryProps {
  query: string
}

interface NasaImage {
  imageUrl: string
  title: string
  credit: string
}

interface CachedImage {
  savedAt: number
  image: NasaImage
}

interface NasaSearchItem {
  data?: { title?: unknown; secondary_creator?: unknown; center?: unknown }[]
  links?: { href?: unknown; rel?: unknown; render?: unknown }[]
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'amplify-vision-nasa-image-v1:'

export function NasaMissionImagery({ query }: NasaMissionImageryProps) {
  const [image, setImage] = useState<NasaImage | null>(null)
  const [message, setMessage] = useState('Loading a related NASA image…')

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 8000)
    let active = true

    async function load() {
      const cacheKey = `${CACHE_PREFIX}${encodeURIComponent(query.toLowerCase())}`
      const cached = readCachedImage(cacheKey)
      if (cached) {
        if (active) {
          setImage(cached)
          setMessage('')
        }
        return
      }

      try {
        const searchUrl = new URL('https://images-api.nasa.gov/search')
        searchUrl.searchParams.set('q', query)
        searchUrl.searchParams.set('media_type', 'image')
        searchUrl.searchParams.set('page', '1')
        const response = await fetch(searchUrl, { signal: controller.signal })
        if (!response.ok) throw new Error(`NASA Images API returned HTTP ${response.status}.`)
        const payload: unknown = await response.json()
        const nasaImage = parseNasaImage(payload)
        if (!nasaImage) throw new Error('NASA Images API returned no usable image for this mission.')

        if (!active) return
        setImage(nasaImage)
        setMessage('')
        try {
          const entry: CachedImage = { savedAt: Date.now(), image: nasaImage }
          window.localStorage.setItem(cacheKey, JSON.stringify(entry))
        } catch (error) {
          console.warn('NASA mission imagery could not be cached in this browser.', error)
        }
      } catch (error) {
        if (!active) return
        console.warn('NASA mission imagery is unavailable.', error)
        setImage(null)
        setMessage('NASA imagery is unavailable right now; the mission briefing is still ready.')
      }
    }

    void load()
    return () => {
      active = false
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [query])

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45" aria-label="NASA mission imagery">
      {image ? (
        <>
          <img
            src={image.imageUrl}
            alt={image.title}
            loading="lazy"
            className="max-h-64 w-full object-cover"
            onError={() => {
              removeCachedImage(query)
              setImage(null)
              setMessage('The NASA image could not be displayed; the briefing remains available.')
            }}
          />
          <div className="p-3">
            <p className="text-xs font-medium text-slate-200">{image.title}</p>
            <p className="mt-1 text-[10px] text-slate-400">NASA Images and Video Library · {image.credit}</p>
          </div>
        </>
      ) : (
        <p className="px-4 py-3 text-xs text-slate-400" role="status" aria-live="polite">{message}</p>
      )}
      <p className="border-t border-white/5 px-4 py-2 text-[9px] text-slate-500">
        Optional reference imagery from NASA’s public Images API. It does not affect mission scoring or gameplay.
      </p>
    </section>
  )
}

function parseNasaImage(value: unknown): NasaImage | null {
  if (!value || typeof value !== 'object') return null
  const collection = (value as { collection?: { items?: unknown } }).collection
  if (!collection || !Array.isArray(collection.items)) return null

  for (const item of collection.items as NasaSearchItem[]) {
    if (!item || !Array.isArray(item.data) || !Array.isArray(item.links)) continue
    const metadata = item.data[0]
    const imageLink = item.links.find(
      (link) =>
        link?.rel === 'preview' &&
        link.render === 'image' &&
        typeof link.href === 'string' &&
        isNasaImageUrl(link.href),
    )
    if (!metadata || !imageLink || typeof imageLink.href !== 'string') continue

    return {
      imageUrl: imageLink.href,
      title: typeof metadata.title === 'string' ? metadata.title : 'NASA mission image',
      credit:
        [metadata.secondary_creator, metadata.center].filter((part): part is string => typeof part === 'string').join(' / ') ||
        'NASA',
    }
  }

  return null
}

function isNasaImageUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'images-assets.nasa.gov' &&
      /\.(jpe?g|png|webp)$/i.test(url.pathname)
    )
  } catch {
    return false
  }
}

function readCachedImage(key: string): NasaImage | null {
  try {
    const stored = window.localStorage.getItem(key)
    if (!stored) return null
    const cached: unknown = JSON.parse(stored)
    if (!cached || typeof cached !== 'object') return null
    const entry = cached as Partial<CachedImage>
    if (
      typeof entry.savedAt !== 'number' ||
      Date.now() - entry.savedAt > CACHE_TTL_MS ||
      !entry.image ||
      typeof entry.image !== 'object' ||
      typeof entry.image.imageUrl !== 'string' ||
      !isNasaImageUrl(entry.image.imageUrl) ||
      typeof entry.image.title !== 'string' ||
      typeof entry.image.credit !== 'string'
    ) {
      window.localStorage.removeItem(key)
      return null
    }
    return entry.image
  } catch (error) {
    console.warn('Cached NASA mission imagery could not be read.', error)
    return null
  }
}

function removeCachedImage(query: string) {
  try {
    window.localStorage.removeItem(`${CACHE_PREFIX}${encodeURIComponent(query.toLowerCase())}`)
  } catch (error) {
    console.warn('Unavailable NASA mission imagery could not be removed from browser cache.', error)
  }
}
