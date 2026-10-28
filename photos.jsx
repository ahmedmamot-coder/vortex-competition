import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'

export const BUCKET = 'vc-photos'

// Reads an image file, centre-crops it to a 3:4 portrait (passport style) and
// returns a compressed JPEG blob (max 600×800) plus a preview URL.
export async function processPhoto(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Choose a photo (JPG or PNG).')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This photo could not be opened. Try a JPG or PNG.')); i.src = url })
    const W = img.naturalWidth, H = img.naturalHeight
    if (W < 200 || H < 200) throw new Error('This photo is too small. Use a clearer photo.')
    let sw = W, sh = (W * 4) / 3
    if (sh > H) { sh = H; sw = (H * 3) / 4 }
    const sx = (W - sw) / 2
    const sy = Math.max(0, (H - sh) * 0.35) // keep a little more of the top, where the face usually is
    const ow = Math.min(600, Math.round(sw)), oh = Math.round((ow * 4) / 3)
    const c = document.createElement('canvas')
    c.width = ow; c.height = oh
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ow, oh)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh)
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85))
    return { blob, preview: c.toDataURL('image/jpeg', 0.7) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export async function uploadPhoto(folder, blob) {
  const path = `${folder}/${uid()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('The photo could not be uploaded. Check your connection and try again.')
  return path
}

// ---- Name matching between registered swimmers and heat-sheet entries ----
// HY-TEK writes "Last, First M"; parents write "First Middle Last". Compare word sets.
export function nameTokens(name = '') {
  return String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z؀-ۿ]+/g, ' ').split(' ').filter((t) => t.length > 1)
}
function sameName(a, b) {
  if (a.length < 2 || b.length < 2) return false
  const [small, big] = a.length <= b.length ? [a, b] : [b, a]
  const set = new Set(big)
  return small.every((t) => set.has(t))
}

// Loads swimmers with photos and signed URLs for every photo (staff + swimmers).
export function usePeople(apps = []) {
  const [swimmers, setSwimmers] = useState([])
  const [urls, setUrls] = useState({})
  const [error, setError] = useState(null)
  const cache = useRef({})

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('vc_swimmers').select('*').order('full_name')
    if (e) { setError(e.message); return }
    setError(null)
    setSwimmers(data || [])
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('vc-people').on('postgres_changes', { event: '*', schema: 'public', table: 'vc_swimmers' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const paths = useMemo(() => [...new Set([...swimmers, ...apps].map((x) => x.photo_path).filter(Boolean))].sort(), [swimmers, apps])

  useEffect(() => {
    const need = paths.filter((p) => !cache.current[p])
    if (!need.length) { setUrls({ ...cache.current }); return }
    let stop = false
    ;(async () => {
      for (let i = 0; i < need.length; i += 100) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), 60 * 60 * 6)
        ;(data || []).forEach((d) => { if (d.signedUrl) cache.current[d.path] = d.signedUrl })
      }
      if (!stop) setUrls({ ...cache.current })
    })()
    return () => { stop = true }
  }, [paths])

  // Index swimmers by word set once; look up entries by name.
  const index = useMemo(() => swimmers.filter((s) => s.photo_path).map((s) => ({ s, t: nameTokens(s.full_name), e: s.entry_name ? s.entry_name.toLowerCase().trim() : null })), [swimmers])
  const swimmerFor = useCallback((entryName) => {
    if (!entryName) return null
    const exact = entryName.toLowerCase().trim()
    const byLink = index.find((x) => x.e === exact)
    if (byLink) return byLink.s
    const t = nameTokens(entryName)
    const hit = index.find((x) => !x.e && sameName(t, x.t))
    return hit ? hit.s : null
  }, [index])
  const photoForEntry = useCallback((entry) => {
    const s = entry && !entry.empty ? swimmerFor(entry.swimmer_name) : null
    return s ? urls[s.photo_path] || null : null
  }, [swimmerFor, urls])

  return { swimmers, setSwimmers, urls, error, reload: load, swimmerFor, photoForEntry }
}

// Turns a (signed) image URL into a JPEG data URL for PDF output.
export async function urlToDataUrl(url, maxW = 600) {
  if (!url) return null
  try {
    const blob = await (await fetch(url)).blob()
    const obj = URL.createObjectURL(blob)
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = obj })
      const scale = Math.min(1, maxW / img.naturalWidth)
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      return c.toDataURL('image/jpeg', 0.85)
    } finally { URL.revokeObjectURL(obj) }
  } catch { return null }
}

export function Avatar({ src, name, size = 36, radius = 8 }) {
  const initials = nameTokens(name).slice(0, 2).map((t) => t[0].toUpperCase()).join('') || '?'
  const box = { width: size, height: Math.round(size * 4 / 3), borderRadius: radius, flex: 'none', objectFit: 'cover', background: '#eef0ff' }
  if (src) return <img src={src} alt={name ? `Photo of ${name}` : ''} style={box} loading="lazy" />
  return <span aria-hidden="true" style={{ ...box, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1f23c9', fontWeight: 800, fontSize: Math.round(size * 0.36) }}>{initials}</span>
}

// Photo field for the public forms: take or choose a photo, see the crop, replace it.
export function PhotoPicker({ value, onChange, err, label = 'Photo', hint }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const inputRef = useRef(null)
  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setMsg('')
    try { onChange(await processPhoto(file)) } catch (x) { setMsg(x.message) }
    setBusy(false)
  }
  const shownErr = msg || err
  return (
    <div className="field" data-err={shownErr ? 'true' : undefined}>
      <span className="label">{label}</span>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <button type="button" onClick={() => inputRef.current?.click()} aria-label={value ? 'Replace photo' : 'Add photo'}
          style={{ width: 96, height: 128, borderRadius: 12, border: `2px dashed ${shownErr ? '#b42318' : '#c9cdf5'}`, background: '#f5f6ff', padding: 0, overflow: 'hidden', cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {value?.preview
            ? <img src={value.preview} alt="Selected photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1f23c9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" /></svg>}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <button type="button" className="btn sm" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? 'Preparing…' : value ? 'Replace photo' : 'Take or upload photo'}</button>
          <span className="small muted">{hint || 'Face the camera, plain background, no sunglasses or cap.'}</span>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      {shownErr && <span className="err-text">{shownErr}</span>}
    </div>
  )
}
