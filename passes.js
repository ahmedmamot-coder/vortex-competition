// Accreditation pass designs: categories, reading the marketing PDFs, storing the
// artwork, and laying out a printable pass for each holder.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { BUCKET } from './photos.jsx'

export const PASS_TYPES = [
  { id: 'vvip', label: 'VVIP', photo: false, accent: '#F2A541' },
  { id: 'vip', label: 'VIP', photo: false, accent: '#F2A541' },
  { id: 'coach', label: 'Coaches', one: 'Coach', photo: true, accent: '#6F8CFF' },
  { id: 'media', label: 'Media', photo: false, accent: '#6F8CFF' },
  { id: 'organizer', label: 'Organizers', one: 'Organizer', photo: false, accent: '#6F8CFF' },
  { id: 'officials', label: 'Officials (judges)', one: 'Official', photo: false, accent: '#6F8CFF' },
  { id: 'swimmer', label: 'Swimmers', one: 'Swimmer', photo: true, accent: '#6F8CFF' }
]
export const PASS = Object.fromEntries(PASS_TYPES.map((p) => [p.id, p]))

// Staff positions get a pass by their group unless an organizer picks another one.
export function passForPosition(pos) {
  if (pos?.pass_type) return pos.pass_type
  return /judge|official|referee/i.test(pos?.group_name || '') ? 'officials' : 'organizer'
}

// Which pass a design page is, from the words printed on it. Pages with no
// text (outlined artwork such as the schedule) are back sides.
export function detectPage(text) {
  const t = String(text || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (!t) return 'back'
  if (t.includes('VVIP')) return 'vvip'
  if (t.includes('VIP')) return 'vip'
  if (t.includes('COACH')) return 'coach'
  if (t.includes('MEDIA') || t.includes('PRESS')) return 'media'
  if (t.includes('ORGANI')) return 'organizer'
  if (t.includes('OFFICIALS') || t.includes('JUDGE')) return 'officials'
  if (t.includes('SWIMMER') || t.includes('ATHLETE')) return 'swimmer'
  if (t.includes('SCHEDULE')) return 'back'
  return null
}

const A6 = { w: 297.64, h: 420.94 } // trim size in PDF points (105 × 148.5 mm)

// Renders every page of a pass-design PDF to a trimmed A6 JPEG.
// Returns [{ page, kind, backFor, blob, preview }] — kind is a pass id, 'back' or null.
export async function readPassPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const tc = await page.getTextContent()
    const text = tc.items.map((i) => i.str).join(' ')
    const vp1 = page.getViewport({ scale: 1 })
    // Print files carry crop marks around the card: keep the centred A6 trim area.
    const trim = vp1.width > A6.w + 6 && vp1.height > A6.h + 6
      ? { x: (vp1.width - A6.w) / 2, y: (vp1.height - A6.h) / 2, w: A6.w, h: A6.h }
      : { x: 0, y: 0, w: vp1.width, h: vp1.height }
    const scale = 1240 / trim.w // ≈ 300 dpi on A6
    const vp = page.getViewport({ scale })
    const full = document.createElement('canvas')
    full.width = Math.ceil(vp.width); full.height = Math.ceil(vp.height)
    const fctx = full.getContext('2d')
    fctx.fillStyle = '#000'; fctx.fillRect(0, 0, full.width, full.height)
    await page.render({ canvasContext: fctx, viewport: vp }).promise
    const out = document.createElement('canvas')
    out.width = Math.round(trim.w * scale); out.height = Math.round(trim.h * scale)
    out.getContext('2d').drawImage(full, trim.x * scale, trim.y * scale, out.width, out.height, 0, 0, out.width, out.height)
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.9))
    pages.push({ page: n, file: file.name, kind: detectPage(text), blob, preview: out.toDataURL('image/jpeg', 0.5) })
  }
  // A back page belongs to the fronts before it (in the same file) that have no back yet.
  let open = []
  pages.forEach((p) => {
    if (p.kind === 'back') { p.backFor = open; open = [] }
    else if (p.kind) open.push(p.kind)
  })
  return pages
}

// Ready-made design images named like "coach-front.jpg" or "vip-back.png".
// Preferred over PDFs: some browsers (Safari) cannot draw the PDF's transparent
// effects, so the artwork is best rendered once and uploaded as pictures.
export async function readPassImage(file) {
  const n = file.name.toLowerCase()
  const kind = (n.match(/vvip|vip|coach|media|organi[sz]er|officials?|swimmer/) || [])[0]
  const id = kind && (kind.startsWith('organi') ? 'organizer' : kind.startsWith('official') ? 'officials' : kind)
  const side = /back/.test(n) ? 'back' : 'front'
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImg(url)
    const c = document.createElement('canvas')
    c.width = 1240; c.height = Math.round(1240 * img.naturalHeight / img.naturalWidth)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92))
    return { page: 1, file: file.name, kind: side === 'back' ? 'back' : id || null, backFor: side === 'back' && id ? [id] : undefined, blob, preview: c.toDataURL('image/jpeg', 0.5) }
  } finally { URL.revokeObjectURL(url) }
}

export async function saveDesign(kind, side, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(`passes/${kind}-${side}.jpg`, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' })
  if (error) throw new Error(`Could not save the ${PASS[kind]?.label || kind} ${side}: ${error.message}`)
}
export async function removeDesign(kind) {
  await supabase.storage.from(BUCKET).remove([`passes/${kind}-front.jpg`, `passes/${kind}-back.jpg`])
}

// { coach: { front: url, back: url }, ... } with short-lived signed URLs.
export function usePassDesigns() {
  const [designs, setDesigns] = useState({})
  const [loaded, setLoaded] = useState(false)
  const load = useCallback(async () => {
    const { data: files } = await supabase.storage.from(BUCKET).list('passes', { limit: 100 })
    const names = (files || []).map((f) => f.name).filter((n) => /^[a-z]+-(front|back)\.jpg$/.test(n))
    const out = {}
    if (names.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(names.map((n) => `passes/${n}`), 60 * 60)
      ;(data || []).forEach((d, i) => {
        const [kind, side] = names[i].replace('.jpg', '').split('-')
        if (d.signedUrl) (out[kind] = out[kind] || {})[side] = `${d.signedUrl}&v=${Date.now()}`
      })
    }
    setDesigns(out); setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])
  return { designs, loaded, reload: load }
}

// ---- Layout (fractions of the card height, measured on the VIC26 artwork) ----
export const LAYOUT = {
  header: [0, 0.41], // logo + "SHORT COURSE"
  title: [0.47, 0.665], // "COACH PASS"
  sponsors: [0.76, 0.965], // partner logos
  nameGap: [0.665, 0.765] // empty band between title and sponsors (photo-free passes)
}

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('Pass design could not be loaded')); i.src = src })
}

// Photo passes: keep the header, then make room for the photo and name by moving
// the pass title and sponsor logos down at a smaller size. Positions are in mm
// on a 105 × 148.5 mm card.
export const PHOTO_SLOT = { x: 38.5, y: 61.5, w: 28, h: 37.3, nameY: 104.5, roleY: 109 }
export async function photoTemplate(frontUrl) {
  const img = await loadImg(frontUrl)
  const W = img.naturalWidth, H = img.naturalHeight
  const mm = H / 148.5
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  // Background colour of the lower card (sampled near the bottom corners).
  const px = ctx.getImageData(Math.round(W * 0.03), Math.round(H * 0.985), 1, 1).data
  const bg = `rgb(${px[0]},${px[1]},${px[2]})`
  const y0 = H * LAYOUT.header[1]
  const g = ctx.createLinearGradient(0, y0 - H * 0.02, 0, y0 + H * 0.02)
  g.addColorStop(0, `rgba(${px[0]},${px[1]},${px[2]},0)`); g.addColorStop(1, bg)
  ctx.fillStyle = g; ctx.fillRect(0, y0 - H * 0.02, W, H * 0.04)
  ctx.fillStyle = bg; ctx.fillRect(0, y0 + H * 0.02, W, H - y0)
  const slice = ([a, b], scale, topMm) => {
    const sh = (b - a) * H, dw = W * scale, dh = sh * scale
    ctx.drawImage(img, 0, a * H, W, sh, (W - dw) / 2, topMm * mm, dw, dh)
  }
  slice(LAYOUT.title, 0.5, 112)
  slice(LAYOUT.sponsors, 0.56, 127.5)
  return c.toDataURL('image/jpeg', 0.9)
}
