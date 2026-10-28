// PDF output: accreditation badges and the marketing photo book.
// jsPDF is loaded on demand from cdnjs so the main app stays small.
import logoUrl from './logo-horizontal.svg'
import { urlToDataUrl } from './photos.jsx'

const NAVY = [18, 18, 54]
const MUTED = [74, 79, 110]
const LINE = [228, 230, 240]

let jspdfPromise = null
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf)
  jspdfPromise = jspdfPromise || new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    s.onload = () => (window.jspdf?.jsPDF ? res(window.jspdf) : rej(new Error('PDF library did not load')))
    s.onerror = () => { jspdfPromise = null; rej(new Error('PDF library could not be downloaded. Check the internet connection.')) }
    document.head.appendChild(s)
  })
  return jspdfPromise
}

function hex(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }

async function logoPng() {
  try {
    const svg = await (await fetch(logoUrl)).text()
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1]?.split(/[\s,]+/).map(Number)
    const ratio = vb && vb[2] && vb[3] ? vb[2] / vb[3] : 3.2
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = logoUrl })
    const c = document.createElement('canvas')
    c.width = 1200; c.height = Math.round(1200 / ratio)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return { data: c.toDataURL('image/png'), ratio }
  } catch { return null }
}

function imgSize(dataUrl) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = dataUrl })
}

// Fit an image inside a box, centred.
function fit(doc, data, fmt, x, y, w, h, size) {
  if (!data || !size) return
  const s = Math.min(w / size.w, h / size.h)
  const dw = size.w * s, dh = size.h * s
  doc.addImage(data, fmt, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, undefined, 'FAST')
}

async function loadPhotos(people, onProgress) {
  const out = new Array(people.length)
  let n = 0
  const queue = people.map((p, i) => [p, i])
  async function worker() {
    while (queue.length) {
      const [p, i] = queue.shift()
      out[i] = await urlToDataUrl(p.photoUrl, 480)
      onProgress?.(++n, people.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return out
}

function initials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((t) => t[0].toUpperCase()).join('')
}

function photoOrPlaceholder(doc, photo, name, x, y, w, h) {
  if (photo) { doc.addImage(photo, 'JPEG', x, y, w, h, undefined, 'FAST'); return }
  doc.setFillColor(238, 240, 255); doc.rect(x, y, w, h, 'F')
  doc.setTextColor(31, 35, 201); doc.setFont('helvetica', 'bold'); doc.setFontSize(w * 0.9)
  doc.text(initials(name) || '?', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' })
}

// people: [{ name, photoUrl, role, sub, color, id }]
export async function badgesPdf({ people, meet, onProgress }) {
  const { jsPDF } = await loadJsPDF()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const logo = await logoPng()
  const sponsor = meet?.sponsor_banner || null
  const sponsorSize = sponsor ? await imgSize(sponsor) : null
  const photos = await loadPhotos(people, onProgress)
  const W = 105, H = 148.5

  people.forEach((p, i) => {
    const slot = i % 4
    if (i && slot === 0) doc.addPage()
    const x = (slot % 2) * W, y = Math.floor(slot / 2) * H
    const color = hex(p.color || '#1F23C9')

    // Cut guides
    if (slot === 0) {
      doc.setDrawColor(200, 200, 210); doc.setLineWidth(0.15); doc.setLineDashPattern([1.5, 1.5], 0)
      doc.line(W, 0, W, 297); doc.line(0, H, 210, H); doc.setLineDashPattern([], 0)
    }
    // Lanyard slot
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.roundedRect(x + W / 2 - 7, y + 4, 14, 3, 1.5, 1.5)
    // Logo
    if (logo) { const lw = 46, lh = lw / logo.ratio; doc.addImage(logo.data, 'PNG', x + (W - lw) / 2, y + 10, lw, lh, undefined, 'FAST') }
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    doc.text(doc.splitTextToSize((meet?.name || 'Vortex Competition').toUpperCase(), W - 16).slice(0, 2), x + W / 2, y + 30, { align: 'center' })
    // Photo
    const pw = 40, ph = 53.3, px = x + (W - pw) / 2, py = y + 37
    photoOrPlaceholder(doc, photos[i], p.name, px, py, pw, ph)
    doc.setDrawColor(...color); doc.setLineWidth(0.8); doc.rect(px, py, pw, ph)
    // Name
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold')
    let size = 16
    doc.setFontSize(size)
    let lines = doc.splitTextToSize(p.name, W - 14)
    while (lines.length > 2 && size > 11) { size -= 1; doc.setFontSize(size); lines = doc.splitTextToSize(p.name, W - 14) }
    doc.text(lines.slice(0, 2), x + W / 2, y + 99, { align: 'center' })
    // Role band
    doc.setFillColor(...color); doc.rect(x, y + 109, W, 13, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(12)
    doc.text(doc.splitTextToSize(String(p.role || '').toUpperCase(), W - 10)[0] || '', x + W / 2, y + 115.5, { align: 'center', baseline: 'middle' })
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    if (p.sub) doc.text(doc.splitTextToSize(p.sub, W - 14)[0], x + W / 2, y + 127, { align: 'center' })
    // Sponsors + id
    if (sponsor) fit(doc, sponsor, 'PNG', x + 6, y + 130, W - 12, 12, sponsorSize)
    doc.setFontSize(6); doc.setTextColor(150, 152, 170)
    if (p.id) doc.text(`ID ${String(p.id).slice(0, 8).toUpperCase()}`, x + W - 5, y + H - 3, { align: 'right' })
  })
  return doc
}

// Marketing photo book: cover header, then a 4-column grid per section.
export async function photoBookPdf({ sections, meet, onProgress }) {
  const { jsPDF } = await loadJsPDF()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const logo = await logoPng()
  const all = sections.flatMap((s) => s.people)
  const photos = await loadPhotos(all, onProgress)
  const M = 14, COLS = 5, GAP = 5
  const cw = (210 - 2 * M - GAP * (COLS - 1)) / COLS
  const phH = cw * 4 / 3
  const cardH = phH + 15
  let y = 0, k = 0, page = 1

  function header(first) {
    if (logo) { const lw = first ? 52 : 34; doc.addImage(logo.data, 'PNG', M, 10, lw, lw / logo.ratio, undefined, 'FAST') }
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(`${meet?.name || 'Vortex Competition'}${meet?.meet_date ? ' · ' + meet.meet_date : ''}`, 210 - M, 14, { align: 'right' })
    if (first) {
      doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(22)
      doc.text('People & photos', M, 38)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED)
      const counts = sections.map((s) => `${s.people.length} ${s.title.toLowerCase()}`).join(' · ')
      doc.text(`${counts} · Only people who agreed to marketing use are included · Exported ${new Date().toLocaleDateString('en-GB')}`, M, 45)
      y = 54
    } else y = 26
  }
  function footer() {
    doc.setFontSize(7.5); doc.setTextColor(150, 152, 170)
    doc.text(`Vortex Competition · page ${page}`, 105, 290, { align: 'center' })
  }

  header(true)
  sections.forEach((s) => {
    if (!s.people.length) return
    if (y + 10 + cardH > 282) { footer(); doc.addPage(); page++; header(false) }
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(`${s.title} (${s.people.length})`, M, y + 4)
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, y + 6.5, 210 - M, y + 6.5)
    y += 11
    s.people.forEach((p, i) => {
      const col = i % COLS
      if (col === 0 && i > 0) y += cardH + GAP
      if (col === 0 && y + cardH > 282) { footer(); doc.addPage(); page++; header(false) }
      const x = M + col * (cw + GAP)
      photoOrPlaceholder(doc, photos[k++], p.name, x, y, cw, phH)
      doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
      doc.text(doc.splitTextToSize(p.name, cw)[0], x, y + phH + 4.5)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
      if (p.role) doc.text(doc.splitTextToSize(p.role, cw)[0], x, y + phH + 8.5)
      if (p.sub) doc.text(doc.splitTextToSize(p.sub, cw)[0], x, y + phH + 12)
    })
    y += cardH + GAP + 4
  })
  footer()
  return doc
}
