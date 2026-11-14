// Reads one club's HY-TEK entries PDF: the club name, each swimmer (name exactly as
// in HY-TEK, gender, age) and their events with entry times. Two report layouts:
//  - Meet Manager "Team Entries - All Events"
//  - Team Manager "Individual Meet Entries Report" (club line "NAME [CODE]")
// Pure parsing is separate from pdf.js so it can be tested.
//
// pages: [{ items: [{ x, y, str }] }]  →  { team, code, meet, swimmers: [{ name, gender, age, events: [{ no, name, seed }] }], total }

const SEED = String.raw`(NT|NS|X?\d{1,2}:\d{2}\.\d{2}|X?\d{1,3}\.\d{2})`
const RE_SWIMMER = /^(\d{1,4})\s+(.+?)\s+-\s+(Female|Male|F|M)\s+-\s+Age:\s*(\d{1,3})(?:\s+-\s+Ind\/Rel.*)?$/i
const RE_EVENT = new RegExp(String.raw`#(\d{1,4})\s+(.+?)\s+${SEED}(?=\s+#|\s*$)`, 'g')
const RE_TEAM_TITLE = /^(.+?)\s+Entries\s+-\s+All Events$/i
const RE_TOTAL = /Total Individual Entries:\s*(\d+)/i

// Team Manager layout
const TM_TEAM = /^(.+?)\s+\[([A-Za-z0-9 .&'-]{1,16})\]$/
const TM_SWIMMER = /^(.+?)\s+\((\d{1,3})\)$/
const TM_EVENT = new RegExp(String.raw`^#\s*(\d{1,4})([A-Z]{0,2})\s+(.+?)\s+(NT|NS|X?\d{1,2}:\d{2}\.\d{2}|X?\d{1,3}\.\d{2})([SLY])?$`)
const TM_TOTAL = /Total IE'?s:\s*(\d+)/i
const TM_ATHLETES = /Total Athletes:\s*(\d+)/i

function parseTeamManager(pages) {
  let team = '', code = '', meet = '', total = null, athletes = null, gender = null, cur = null
  const swimmers = []
  for (const page of pages) {
    for (const text of linesOf(page.items)) {
      let m
      if (/^Licensed To:|HY-TEK|Individual Meet Entries Report|^Location:/i.test(text)) continue
      if ((m = text.match(TM_TOTAL))) { total = +m[1]; continue }
      if ((m = text.match(TM_ATHLETES))) { athletes = +m[1]; continue }
      if (/^(Fe)?male IE'?s:/i.test(text)) continue
      if (!meet && /\bto\b.*\b(SC|LC)\s+Meters\b|\d{2}-[A-Z][a-z]{2}-\d{2}/.test(text)) { meet = text; continue }
      if ((m = text.match(TM_TEAM))) { if (!team) { team = m[1].trim(); code = m[2].trim().toUpperCase() } continue }
      if (/^(GIRLS|WOMEN|FEMALE)$/i.test(text)) { gender = 'F'; continue }
      if (/^(BOYS|MEN|MALE)$/i.test(text)) { gender = 'M'; continue }
      if ((m = text.match(TM_EVENT))) {
        if (cur) cur.events.push({ no: +m[1], code: m[1] + m[2], name: m[3].trim(), seed: m[4] })
        continue
      }
      if ((m = text.match(TM_SWIMMER)) && !text.startsWith('#')) {
        const g = gender || (/^girls|women/i.test(m[1]) ? 'F' : null)
        cur = { name: m[1].trim().replace(/\s+/g, ' '), gender: g, age: +m[2], events: [] }
        swimmers.push(cur)
      }
    }
  }
  swimmers.forEach((s) => {
    if (!s.gender && s.events[0]) s.gender = /^girls|women/i.test(s.events[0].name) ? 'F' : 'M'
    s.events.sort((a, b) => a.no - b.no)
  })
  const count = swimmers.reduce((n, s) => n + s.events.length, 0)
  return { team, code, meet, swimmers, total, athletes, count }
}

function linesOf(items, tol = 2.5) {
  const sorted = [...items].filter((i) => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }
  return lines.map((l) => l.items.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim())
}

export function parseEntries(pages) {
  const head = pages.slice(0, 1).flatMap((p) => linesOf(p.items)).join('\n')
  if (/Individual Meet Entries Report|TEAM MANAGER/i.test(head)) return parseTeamManager(pages)
  let team = '', meet = '', total = null
  const swimmers = []
  let cur = null
  for (const page of pages) {
    for (const text of linesOf(page.items)) {
      let m
      if ((m = text.match(RE_TEAM_TITLE))) { team = team || m[1].trim(); continue }
      if (!meet && /^[A-Z0-9 ]{6,}.*\d{1,2}\/\d{1,2}\/\d{4}/.test(text) && !/HY-TEK/i.test(text)) { meet = text; continue }
      if ((m = text.match(RE_TOTAL))) { total = +m[1]; continue }
      if (/HY-TEK|Site License/i.test(text)) continue
      if ((m = text.match(RE_SWIMMER))) {
        cur = { name: m[2].trim(), gender: /^f/i.test(m[3]) ? 'F' : 'M', age: +m[4], events: [] }
        swimmers.push(cur)
        continue
      }
      if (cur && text.includes('#')) {
        const evs = [...text.matchAll(RE_EVENT)].map((x) => ({ no: +x[1], name: x[2].trim(), seed: x[3] }))
        if (evs.length) { cur.events.push(...evs); continue }
      }
    }
  }
  swimmers.forEach((s) => s.events.sort((a, b) => a.no - b.no))
  const count = swimmers.reduce((n, s) => n + s.events.length, 0)
  return { team, code: '', meet, swimmers, total, count }
}

export async function readEntriesPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    pages.push({ items: tc.items.filter((i) => i.str).map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str })) })
  }
  return parseEntries(pages)
}
