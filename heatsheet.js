// Parses a HY-TEK Meet Manager "Meet Program" / heat sheet PDF into rows.
// Pure logic (no PDF library) so it can be tested on its own: give it the
// text items of each page and it returns the meet title, dates and entries.
//
// pages: [{ width, height, items: [{ x, y, str }] }]   (PDF coordinates, y grows upward)
// returns { title, dates, rows: [[event_no, event_name, heat_no, lane, name, club, seed]], events, heats, unmatched }

const SEED = String.raw`(NT|NS|SCR|DQ|X?\d{1,2}:\d{2}\.\d{2}|X?\d{1,2}\.\d{2})`
const TEAM = String.raw`([A-Z0-9][A-Za-z0-9&'.\-]*(?: \d{1,2})?)`
const RE_EVENT = /^#(\d+)\s+(.+)$/
const RE_HEAT = /^Heat\s+(\d+)\s+of\s+(\d+)\b/i
const RE_HEAT_CONT = /^Heat\s+(\d+)\s*\(#(\d+)\s+(.+?)\)\s*$/i
const RE_RELAY = new RegExp(String.raw`^(\d{1,2})\s+${TEAM}\s+([A-Z]{1,2}\d{1,3}\s+[A-Z])\s+${SEED}$`)
const RE_INDIV = new RegExp(String.raw`^(\d{1,2})\s+(.+?)\s+(\d{1,3})\s+${TEAM}\s+${SEED}$`)
const RE_NAME_ONLY = /^(\d{1,2})\s+([^\d].*,.*)$/
const RE_AGE_TEAM_SEED = new RegExp(String.raw`^(\d{1,3})\s+${TEAM}\s+${SEED}$`)
const RE_MEMBER = /([A-Z][^,\d]*?,\s*[^\d]+?)\s+(\d{1,2})(?=\s|$|[A-Z])/g
const RE_SKIP = /^(Lane\s+(Name|Team)|Meet Program|HY-TEK|Qatar Swimming|Page \d+)/i

function linesOf(items, tol = 2.5) {
  const sorted = [...items].filter((i) => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }
  return lines.map((l) => ({
    y: l.y,
    x: Math.min(...l.items.map((i) => i.x)),
    text: l.items.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim()
  }))
}

// Column starts = x positions where "Heat", "#n" or "Lane" headers begin.
function columnBounds(items, width) {
  const starts = items
    .filter((i) => /^(Heat|#\d+|Lane)\b/.test(i.str.trim()))
    .map((i) => Math.round(i.x))
    .sort((a, b) => a - b)
  const clusters = []
  for (const x of starts) {
    const c = clusters[clusters.length - 1]
    if (c && x - c.max < 25) { c.max = x; c.n++ } else clusters.push({ min: x, max: x, n: 1 })
  }
  const cols = clusters.filter((c) => c.n >= 2).map((c) => c.min)
  if (cols.length >= 2) return cols.slice(1).map((x) => x - 6)
  return [width / 3, (2 * width) / 3]
}

export function parseHeatSheet(pages) {
  let title = ''
  let dates = ''
  const rows = []
  const unmatched = []
  let ev = null // { no, name }
  let heat = null
  let pending = null // wrapped individual name
  let lastRelay = null

  pages.forEach((page, pi) => {
    // Header: everything above the "Meet Program" line spans the full width.
    const all = linesOf(page.items)
    const mp = all.find((l) => /^Meet Program$/i.test(l.text))
    const headerY = mp ? mp.y - 1 : page.height * 0.9
    if (pi === 0) {
      const head = all.filter((l) => l.y > headerY + 1 && !/HY-TEK|Site License/i.test(l.text))
      const t = head[head.length - 1]?.text || ''
      const m = t.match(/^(.*?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{4}.*)$/)
      if (m) { title = m[1].trim(); dates = m[2].trim() } else title = t
    }
    const body = page.items.filter((i) => i.y < headerY)
    const bounds = columnBounds(body, page.width)
    const cols = [[], [], []]
    body.forEach((i) => {
      const c = i.x < bounds[0] ? 0 : i.x < (bounds[1] ?? Infinity) ? 1 : 2
      cols[c].push(i)
    })

    for (const col of cols) {
      for (const { text } of linesOf(col)) {
        if (RE_SKIP.test(text)) continue
        let m
        if ((m = text.match(RE_HEAT_CONT))) {
          ev = { no: +m[2], name: m[3].trim() }; heat = +m[1]; pending = null; lastRelay = null; continue
        }
        if ((m = text.match(RE_EVENT))) { ev = { no: +m[1], name: m[2].trim() }; heat = null; pending = null; lastRelay = null; continue }
        if ((m = text.match(RE_HEAT))) { heat = +m[1]; pending = null; lastRelay = null; continue }
        if (!ev || !heat) continue
        if ((m = text.match(RE_RELAY))) {
          const row = [ev.no, ev.name, heat, +m[1], `${m[2]} ${m[3].replace(/\s+/, ' ')}`, m[2], m[4]]
          rows.push(row); lastRelay = { row, team: m[2], members: [] }; pending = null; continue
        }
        if ((m = text.match(RE_INDIV))) {
          rows.push([ev.no, ev.name, heat, +m[1], m[2].trim(), m[4], m[5]]); pending = null; lastRelay = null; continue
        }
        if (pending && (m = text.match(RE_AGE_TEAM_SEED))) {
          rows.push([ev.no, ev.name, heat, pending.lane, pending.name, m[2], m[3]]); pending = null; continue
        }
        if (!lastRelay && (m = text.match(RE_NAME_ONLY))) { pending = { lane: +m[1], name: m[2].trim() }; continue }
        if (lastRelay) {
          const names = [...text.matchAll(RE_MEMBER)].map((x) => x[1].trim())
          if (names.length) {
            lastRelay.members.push(...names)
            lastRelay.row[5] = `${lastRelay.team} · ${lastRelay.members.join(' / ')}`
            continue
          }
        }
        unmatched.push(text)
      }
    }
  })

  const events = new Set(rows.map((r) => r[0])).size
  const heats = new Set(rows.map((r) => `${r[0]}-${r[2]}`)).size
  return { title, dates, rows, events, heats, unmatched }
}

// Browser helpers (pdf.js is loaded on demand so the main app stays small).
async function loadPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const data = new Uint8Array(await file.arrayBuffer())
  return pdfjs.getDocument({ data }).promise
}

export async function readHeatSheetPdf(file) {
  const pdf = await loadPdf(file)
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    pages.push({
      width: vp.width,
      height: vp.height,
      items: tc.items.filter((i) => i.str).map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))
    })
  }
  const result = parseHeatSheet(pages)
  result.sponsor = await cropSponsorStrip(pdf).catch(() => null)
  return result
}

// Renders the bottom band of page 1 (where HY-TEK programs carry sponsor logos)
// and trims the white margins. Returns a PNG data URL, or null if the band is empty.
async function cropSponsorStrip(pdf) {
  const page = await pdf.getPage(1)
  const vp = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = vp.width; canvas.height = vp.height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  const y0 = Math.round(vp.height * 0.88)
  const y1 = Math.round(vp.height * 0.975)
  return trimToDataUrl(canvas, 0, y0, canvas.width, y1 - y0)
}

export function trimToDataUrl(src, sx, sy, sw, sh, maxW = 1600) {
  const img = src.getContext('2d').getImageData(sx, sy, sw, sh)
  // Count ink per row/column; thin hairlines (e.g. column rules) are ignored.
  const rowInk = new Array(sh).fill(0)
  const colInk = new Array(sw).fill(0)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const k = (y * sw + x) * 4
      if (img.data[k + 3] > 10 && (img.data[k] < 235 || img.data[k + 1] < 235 || img.data[k + 2] < 235)) { rowInk[y]++; colInk[x]++ }
    }
  }
  const rows = rowInk.map((v, i) => (v > 2 ? i : -1)).filter((i) => i >= 0)
  // Drop short slivers (ends of page rules) above or below the logos.
  const runs = []
  rows.forEach((r) => { const last = runs[runs.length - 1]; if (last && r - last[1] <= 3) last[1] = r; else runs.push([r, r]) })
  while (runs.length > 1 && runs[0][1] - runs[0][0] < 8) runs.shift()
  if (runs.length) { rows.length = 0; rows.push(runs[0][0], runs[runs.length - 1][1]) }
  const cols = colInk.map((v, i) => (v > 3 ? i : -1)).filter((i) => i >= 0)
  let minX = cols.length ? cols[0] : 0, maxX = cols.length ? cols[cols.length - 1] : -1
  let minY = rows.length ? rows[0] : 0, maxY = rows.length ? rows[rows.length - 1] : -1
  if (maxX < 0 || maxX - minX < 40 || maxY - minY < 15) return null
  const pad = 12
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - 2)
  maxX = Math.min(sw - 1, maxX + pad); maxY = Math.min(sh - 1, maxY + pad)
  const w = maxX - minX + 1, h = maxY - minY + 1
  const scale = Math.min(1, maxW / w)
  const out = document.createElement('canvas')
  out.width = Math.round(w * scale); out.height = Math.round(h * scale)
  const octx = out.getContext('2d')
  octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height)
  octx.drawImage(src, sx + minX, sy + minY, w, h, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

// Turns an uploaded sponsor image into a size-capped PNG data URL.
export async function imageFileToDataUrl(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0)
    return trimToDataUrl(c, 0, 0, c.width, c.height) || c.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
