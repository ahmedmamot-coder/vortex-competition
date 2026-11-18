// PDF output: accreditation badges and the marketing photo book.
// jsPDF is loaded on demand from cdnjs so the main app stays small.
import logoUrl from './logo-competition.png'
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
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = logoUrl })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return { data: c.toDataURL('image/png'), ratio: img.naturalWidth / img.naturalHeight }
  } catch { return null }
}

// The built-in PDF fonts only cover basic Latin; swap the punctuation the meet name uses.
const pdfText = (t) => String(t || '').replace(/\s*·\s*/g, ' - ').replace(/[–—]/g, '-')

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

// ---- Swimmer bag tag (marketing design "Swimmer Bag Tags | International 26") ----
// Measured from the artwork on a 105 x 148.5 mm card: the white photo circle, and the
// gap between the circle and the thin line above "SWIMMER. Obviously."
const TAG = { cx: 52.55, cy: 48.57, r: 23.45, textX: 9.0, textW: 87, textTop: 73.2, textH: 9.9 }
const TAG_BLUE = '#057EE9', TAG_INK = '#0A0A14'
const PX = 12 // canvas pixels per mm (≈ 300 dpi)

let fontReady
function loadTagFont() {
  // Closest free match to the design's grotesk lettering (the PDF has it as outlines).
  return (fontReady = fontReady || (async () => {
    try {
      if (!document.querySelector('link[data-tag-font]')) {
        const l = document.createElement('link')
        l.rel = 'stylesheet'; l.dataset.tagFont = '1'
        l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
        document.head.appendChild(l)
        await new Promise((ok) => { l.onload = ok; l.onerror = ok; setTimeout(ok, 4000) })
      }
      await Promise.all(['500', '600'].map((w) => document.fonts.load(`${w} 48px Inter`)))
    } catch { /* falls back to the system sans-serif */ }
  })())
}
const FONT = "Inter, 'Helvetica Neue', Arial, sans-serif"
const displayName = (n) => (n && n.includes(',') ? `${n.split(',').slice(1).join(',').trim()} ${n.split(',')[0].trim()}` : String(n || '')).replace(/\s+/g, ' ').trim()

function loadImage(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src })
}

// Round photo (or initials) that fills the design's white circle.
async function tagCircle(photo, name) {
  const d = Math.round(TAG.r * 2 * PX)
  const c = document.createElement('canvas'); c.width = d; c.height = d
  const ctx = c.getContext('2d')
  ctx.beginPath(); ctx.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
  const img = photo ? await loadImage(photo) : null
  if (img) {
    // Show the whole head with all the hair: zoom out a little and start just above
    // the top of the photo, so nothing on top is cut by the circle.
    const iw = img.naturalWidth, ih = img.naturalHeight
    const side = Math.min(iw, ih)
    const sx = (iw - side) / 2, sy = -side * 0.08
    const k = d / side
    // The small strip above the photo is filled with the photo's own background colour.
    const t = document.createElement('canvas'); t.width = iw; t.height = 1
    const tc = t.getContext('2d'); tc.drawImage(img, 0, 0, iw, 1, 0, 0, iw, 1)
    const row = tc.getImageData(0, 0, iw, 1).data
    let rr = 0, gg = 0, bb = 0
    for (let i = 0; i < row.length; i += 4) { rr += row[i]; gg += row[i + 1]; bb += row[i + 2] }
    const n = row.length / 4
    ctx.fillStyle = `rgb(${Math.round(rr / n)},${Math.round(gg / n)},${Math.round(bb / n)})`; ctx.fillRect(0, 0, d, d)
    ctx.drawImage(img, -sx * k, -sy * k, iw * k, ih * k)
  } else {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, d, d)
    ctx.fillStyle = TAG_BLUE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `600 ${Math.round(d * 0.3)}px ${FONT}`
    ctx.fillText(initials(displayName(name)) || '?', d / 2, d / 2 + d * 0.02)
  }
  return c.toDataURL('image/png')
}

// Name (white) and club (ink) set left-aligned like "SWIMMER. Obviously.".
function tagText(name, club) {
  const w = Math.round(TAG.textW * PX), h = Math.round(TAG.textH * PX)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  let size = 7.4 * PX
  const nm = displayName(name)
  do { ctx.font = `500 ${size}px ${FONT}`; size -= 0.2 * PX } while (ctx.measureText(nm).width > w && size > 3.6 * PX)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(nm, 0, 6.0 * PX)
  if (club) {
    const cl = String(club).toUpperCase()
    let cs = 2.5 * PX
    try { ctx.letterSpacing = `${0.12 * PX}px` } catch { /* older browsers */ }
    do { ctx.font = `600 ${cs}px ${FONT}`; cs -= 0.1 * PX } while (ctx.measureText(cl).width > w && cs > 1.6 * PX)
    ctx.fillStyle = TAG_INK
    ctx.fillText(cl, 0, 9.2 * PX)
  }
  return c.toDataURL('image/png')
}

// people: [{ name, photoUrl, role, sub, color, id, pass }]
// designs: { coach: { front, back }, ... } signed URLs of the pass artwork (optional).
// Holders whose pass has artwork are printed on it; others get the plain Vortex badge.
// QR codes are drawn with qrcode-generator, loaded on demand like jsPDF.
let qrLib
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode)
  return (qrLib = qrLib || new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
    s.onload = () => ok(window.qrcode)
    s.onerror = () => { qrLib = null; fail(new Error('Could not load the QR code tool. Check the internet connection.')) }
    document.head.appendChild(s)
  }))
}
function drawQR(doc, qrcode, text, x, y, size) {
  const q = qrcode(0, 'M'); q.addData(text); q.make()
  const n = q.getModuleCount(), pad = 1.5, cell = (size - pad * 2) / n
  doc.setFillColor(255, 255, 255); doc.roundedRect(x, y, size, size, 1.5, 1.5, 'F')
  doc.setFillColor(11, 16, 64)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) doc.rect(x + pad + c * cell, y + pad + r * cell, cell + 0.02, cell + 0.02, 'F')
}

export async function badgesPdf({ people, meet, designs = {}, backs = false, onProgress }) {
  // Officials passes say only "Official" — not the person's position (Referee, Timekeeper…).
  people = people.map((p) => (p.pass === 'officials' ? { ...p, role: 'Official', sub: '' } : p))
  const { jsPDF } = await loadJsPDF()
  const { PASS, PHOTO_SLOT, LAYOUT, photoTemplate } = await import('./passes.js')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const logo = await logoPng()
  const sponsor = meet?.sponsor_banner || null
  const sponsorSize = sponsor ? await imgSize(sponsor) : null
  const W = 105, H = 148.5

  // Artwork for every pass type in this print run (built once, reused by alias).
  const art = {}
  for (const kind of new Set(people.map((p) => p.pass).filter((k) => designs[k]?.front))) {
    const d = designs[kind]
    art[kind] = {
      // The swimmer bag tag is printed exactly as designed (photo goes in its circle).
      front: kind === 'swimmer' ? await urlToDataUrl(d.front, 1400) : PASS[kind]?.photo ? await photoTemplate(d.front) : await urlToDataUrl(d.front, 1240),
      back: d.back ? await urlToDataUrl(d.back, 1240) : null
    }
  }
  const qrcode = people.some((p) => p.qr) ? await loadQR() : null
  if (people.some((p) => p.pass === 'swimmer' && art.swimmer)) await loadTagFont()
  const needPhoto = people.map((p) => !p.pass || !art[p.pass] || PASS[p.pass]?.photo)
  const photos = await loadPhotos(people.map((p, i) => (needPhoto[i] ? p : { ...p, photoUrl: null })), onProgress)

  function guides() {
    doc.setDrawColor(200, 200, 210); doc.setLineWidth(0.15); doc.setLineDashPattern([1.5, 1.5], 0)
    doc.line(W, 0, W, 297); doc.line(0, H, 210, H); doc.setLineDashPattern([], 0)
  }
  function fitText(text, maxW, size, min) {
    doc.setFontSize(size)
    while (size > min && doc.getTextWidth(text) > maxW) { size -= 0.5; doc.setFontSize(size) }
    return size
  }

  function drawPass(p, photo, x, y) {
    const a = art[p.pass], info = PASS[p.pass]
    doc.addImage(a.front, 'JPEG', x, y, W, H, `pass-${p.pass}`, 'FAST')
    const accent = hex(info.accent)
    const name = pdfText(p.name || '')
    const role = pdfText([p.role, p.sub].filter(Boolean).join('  |  ')).toUpperCase()
    if (info.photo) {
      const s = PHOTO_SLOT
      photoOrPlaceholder(doc, photo, p.name, x + s.x, y + s.y, s.w, s.h)
      doc.setDrawColor(...accent); doc.setLineWidth(0.6); doc.rect(x + s.x, y + s.y, s.w, s.h)
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold')
      fitText(name, W - 12, 13, 8)
      doc.text(name, x + W / 2, y + s.nameY, { align: 'center' })
      if (role) { doc.setFont('helvetica', 'normal'); doc.setTextColor(...accent); fitText(role, W - 14, 7.5, 5.5); doc.text(role, x + W / 2, y + s.roleY, { align: 'center' }) }
    } else if (name) {
      const mid = y + H * (LAYOUT.nameGap[0] + LAYOUT.nameGap[1]) / 2
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold')
      fitText(name, W - 14, 14, 8)
      doc.text(name, x + W / 2, mid - (role ? 1 : -1.5), { align: 'center' })
      if (role) { doc.setFont('helvetica', 'normal'); doc.setTextColor(...accent); fitText(role, W - 16, 7.5, 5.5); doc.text(role, x + W / 2, mid + 4.5, { align: 'center' }) }
    }
  }

  async function drawSwimmerTag(p, photo, x, y) {
    doc.addImage(art.swimmer.front, 'JPEG', x, y, W, H, 'pass-swimmer', 'FAST')
    doc.addImage(await tagCircle(photo, p.name), 'PNG', x + TAG.cx - TAG.r, y + TAG.cy - TAG.r, TAG.r * 2, TAG.r * 2, undefined, 'FAST')
    doc.addImage(tagText(p.name, String(p.sub || '').split(' · ')[0]), 'PNG', x + TAG.textX, y + TAG.textTop, TAG.textW, TAG.textH, undefined, 'FAST')
  }

  function drawClassic(p, photo, x, y) {
    const color = hex(p.color || '#1F23C9')
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.roundedRect(x + W / 2 - 7, y + 4, 14, 3, 1.5, 1.5)
    if (logo) { const lw = 38, lh = lw / logo.ratio; doc.addImage(logo.data, 'PNG', x + (W - lw) / 2, y + 9.5, lw, lh, 'vc-logo', 'FAST') }
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    doc.text(doc.splitTextToSize(pdfText(meet?.name || 'Vortex Competition').toUpperCase(), W - 16).slice(0, 2), x + W / 2, y + 31.5, { align: 'center' })
    const pw = 40, ph = 53.3, px = x + (W - pw) / 2, py = y + 37
    photoOrPlaceholder(doc, photo, p.name, px, py, pw, ph)
    doc.setDrawColor(...color); doc.setLineWidth(0.8); doc.rect(px, py, pw, ph)
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold')
    let size = 16
    doc.setFontSize(size)
    let lines = doc.splitTextToSize(p.name, W - 14)
    while (lines.length > 2 && size > 11) { size -= 1; doc.setFontSize(size); lines = doc.splitTextToSize(p.name, W - 14) }
    doc.text(lines.slice(0, 2), x + W / 2, y + 99, { align: 'center' })
    doc.setFillColor(...color); doc.rect(x, y + 109, W, 13, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(12)
    doc.text(doc.splitTextToSize(String(p.role || '').toUpperCase(), W - 10)[0] || '', x + W / 2, y + 115.5, { align: 'center', baseline: 'middle' })
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    if (p.sub) doc.text(doc.splitTextToSize(p.sub, W - 14)[0], x + W / 2, y + 127, { align: 'center' })
    if (sponsor) fit(doc, sponsor, 'PNG', x + 6, y + 130, W - 12, 12, sponsorSize)
    doc.setFontSize(6); doc.setTextColor(150, 152, 170)
    if (p.id) doc.text(`ID ${String(p.id).slice(0, 8).toUpperCase()}`, x + W - 5, y + H - 3, { align: 'right' })
  }

  // With back sides: each row is one pass, front on the left and its back on the
  // right (2 passes per A4 sheet) — cut out the pair and fold on the middle line.
  // Without: 4 fronts per sheet.
  const paired = backs && people.some((p) => art[p.pass]?.back)
  const per = paired ? 2 : 4
  for (let start = 0; start < people.length; start += per) {
    if (start) doc.addPage()
    const group = people.slice(start, start + per)
    for (let k = 0; k < group.length; k++) {
      const p = group[k]
      const x = paired ? 0 : (k % 2) * W
      const y = paired ? k * H : Math.floor(k / 2) * H
      if (p.pass === 'swimmer' && art.swimmer) await drawSwimmerTag(p, photos[start + k], x, y)
      else if (p.pass && art[p.pass]) drawPass(p, photos[start + k], x, y)
      else drawClassic(p, photos[start + k], x, y)
      // Personal QR (swimmers): opens their races, heats, lanes and results.
      if (p.qr && qrcode) {
        drawQR(doc, qrcode, p.qr, x + W - 23, y + 5, 18)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(4.5)
        if (p.pass === 'swimmer' && art.swimmer) doc.setTextColor(255, 255, 255); else doc.setTextColor(120, 124, 150)
        doc.text('MY RACES', x + W - 14, y + 25.2, { align: 'center' })
      }
      const b = paired && art[p.pass]?.back
      if (b) doc.addImage(b, 'JPEG', W, y, W, H, `back-${p.pass}`, 'FAST')
    }
    guides()
  }
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
    doc.text(pdfText(`${meet?.name || 'Vortex Competition'}${meet?.meet_date ? ' · ' + meet.meet_date : ''}`), 210 - M, 14, { align: 'right' })
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
