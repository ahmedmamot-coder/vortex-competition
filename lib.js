export const STAGES = ['Not called', '1st call', '2nd call', 'Final call', 'Released to blocks']

export const SESSIONS = [
  { id: 'd1am', name: 'Session 1', time: 'Day 1 · Morning' },
  { id: 'd1pm', name: 'Session 2', time: 'Day 1 · Evening' },
  { id: 'd2am', name: 'Session 3', time: 'Day 2 · Morning' },
  { id: 'd2pm', name: 'Session 4', time: 'Day 2 · Evening' }
]

export const BANKS = ['QNB', 'Commercial Bank', 'Doha Bank', 'QIB', 'QIIB', 'Masraf Al Rayan', 'Dukhan Bank', 'Ahli Bank', 'Qatar Development Bank', 'HSBC Qatar', 'Standard Chartered', 'Other']

export const IBAN_RE = /^QA\d{2}[A-Z]{4}[A-Z0-9]{21}$/
export const cleanIban = (v) => (v || '').replace(/\s+/g, '').toUpperCase()
export const maskQid = (q) => (q ? q.slice(0, 3) + '•••••' + q.slice(-3) : '')
export const maskIban = (i) => (i ? i.slice(0, 4) + ' •••• •••• ' + i.slice(-4) : '')
export const fmtIban = (i) => (i || '').replace(/(.{4})/g, '$1 ').trim()

export function heatCode(h) {
  return `E${h.event_no} · H${h.heat_no}`
}

export function statusFor(idx, runIdx, stage) {
  if (runIdx >= 0 && idx < runIdx) return { label: 'Done', cls: 'grey' }
  if (idx === runIdx) return { label: 'Racing', cls: 'dark' }
  if (stage === 4) return { label: 'At blocks', cls: 'blue' }
  if (stage === 3) return { label: 'Final call', cls: 'warn' }
  if (stage === 2) return { label: '2nd call', cls: 'info' }
  if (stage === 1) return { label: '1st call', cls: 'info' }
  return { label: 'Upcoming', cls: 'grey' }
}

export function announceText(h, stage) {
  if (!h) return ''
  const p = `Event ${h.event_no}, ${h.event_name}, heat ${h.heat_no} of ${h.heat_total}`
  return [
    `${p} — not called yet. Next: first call to the call room.`,
    `First call — ${p}. Please report to the call room.`,
    `Second call — ${p}. Report to the call room now.`,
    `Final call — ${p}. Swimmers not present will be scratched.`,
    `${p} — released. Marshals, take the heat behind the blocks.`
  ][stage]
}

export function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}

export function parseCsv(text) {
  const rows = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (c === '"') q = false
        else cur += c
      } else if (c === '"') q = true
      else if (c === ',' || c === '\t' || c === ';') { out.push(cur.trim()); cur = '' }
      else cur += c
    }
    out.push(cur.trim())
    rows.push(out)
  }
  return rows
}

export function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---- Spoken announcements (spectator TV voice-over) ----

// "Girls 12-70 400 LC Meter IM" -> "Girls 12 and over, 400 metre individual medley"
export function spokenEventName(name = '') {
  return name
    .replace(/(\d+)\s*-\s*(\d+)/g, (_, a, b) => (+b >= 60 ? `${a} and over` : `${a} to ${b}`))
    .replace(/(\d+)\s*&\s*(Over|Under)/gi, (_, a, w) => `${a} and ${w.toLowerCase()}`)
    .replace(/\b(LC|SC)\s+Meters?\b/gi, 'metre')
    .replace(/\b(LC|SC)\s+Yards?\b/gi, 'yard')
    .replace(/\bMeters?\b/gi, 'metre')
    .replace(/(\d+)m\b/g, '$1 metre')
    .replace(/\bIM\b/g, 'individual medley')
    .replace(/(\d+)\s+(metre|yard)/gi, '$1 $2')
    .replace(/(Girls|Boys|Women|Men|Mixed)\s+([\w\s]+?)\s+((\d+\s*[×x]\s*)?\d+ (metre|yard))/i, '$1 $2, $3')
    .replace(/&/g, 'and')
    .replace(/(\d+)\s*[×x]\s*(\d+)/g, '$1 by $2')
    .replace(/\s+/g, ' ')
    .trim()
}

const STAGE_EN = { 1: 'First call', 2: 'Second call', 3: 'Final call' }
const STAGE_AR = { 1: 'النداء الأول', 2: 'النداء الثاني', 3: 'النداء الأخير' }

export function speechForHeat(h, stage) {
  if (!h || !STAGE_EN[stage]) return null
  const ev = spokenEventName(h.event_name)
  const en = stage === 3
    ? `${STAGE_EN[stage]}. Event ${h.event_no}, ${ev}, heat ${h.heat_no}. Swimmers, report to the call room now.`
    : `${STAGE_EN[stage]}. Event ${h.event_no}, ${ev}, heat ${h.heat_no}. Swimmers, please go to the call room.`
  const ar = stage === 3
    ? `${STAGE_AR[stage]}. السباق رقم ${h.event_no}، التصفية ${h.heat_no}. على السباحين التوجه إلى غرفة النداء الآن.`
    : `${STAGE_AR[stage]}. السباق رقم ${h.event_no}، التصفية ${h.heat_no}. يرجى من السباحين التوجه إلى غرفة النداء.`
  return { en, ar, label: STAGE_EN[stage] }
}

export const isArabic = (t) => /[؀-ۿ]/.test(t || '')
