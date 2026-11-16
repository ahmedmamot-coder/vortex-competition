// Download club logos and swimmer photos as one ZIP (organizers only).
// JSZip is loaded on demand from cdnjs so the main app stays small.
import { supabase } from './supabase.js'

let jszip
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip)
  return (jszip = jszip || new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    s.onload = () => ok(window.JSZip)
    s.onerror = () => { jszip = null; fail(new Error('Could not load the ZIP tool. Check the internet connection.')) }
    document.head.appendChild(s)
  }))
}

const safe = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'unnamed'
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

// clubs: [{ code, name, logo (data URL or null), swimmers: [{ name, gender, age, photo_path, consent }] }]
export async function downloadClubMedia({ title, clubs, onProgress }) {
  const JSZip = await loadJSZip()
  const zip = new JSZip()
  const rows = [['Club', 'Team code', 'Swimmer (as in HY-TEK)', 'Gender', 'Age', 'Photo file', 'Consent'].map(csv).join(',')]
  const jobs = []
  let logos = 0
  for (const c of clubs) {
    const dir = zip.folder(`${safe(c.name)} (${safe(c.code)})`)
    if (c.logo) {
      const blob = await (await fetch(c.logo)).blob()
      dir.file(`${safe(c.code)} logo.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`, await blob.arrayBuffer())
      logos++
    }
    const used = new Set()
    for (const s of c.swimmers) {
      let file = ''
      if (s.photo_path) {
        let base = safe(s.name), n = 2
        while (used.has(base)) base = `${safe(s.name)} (${n++})`
        used.add(base)
        file = `${base}.jpg`
        jobs.push({ dir, file, path: s.photo_path })
      }
      rows.push([c.name, c.code, s.name, s.gender, s.age, file ? `${safe(c.name)} (${safe(c.code)})/${file}` : "", s.consent ? 'yes' : 'no'].map(csv).join(','))
    }
  }
  let done = 0, failed = 0
  const total = jobs.length
  onProgress?.(0, total)
  const worker = async () => {
    while (jobs.length) {
      const j = jobs.shift()
      const { data, error } = await supabase.storage.from('vc-photos').download(j.path)
      if (error || !data) failed++
      else j.dir.file(j.file, await data.arrayBuffer())
      onProgress?.(++done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, total) }, worker))
  zip.file('index.csv', '﻿' + rows.join('\r\n'))
  const blob = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${safe(title)}.zip`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  return { logos, photos: total - failed, failed }
}
