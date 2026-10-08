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
