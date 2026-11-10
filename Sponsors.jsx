import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// Sponsors managed one logo at a time. The list is kept in vc_meet.sponsors and
// combined into vc_meet.sponsor_banner (one strip image) for every page that
// already shows the banner: registration, call room screen, TV, console, badges.

const uid = () => Math.random().toString(36).slice(2, 10)

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open the image')); i.src = src })
}

// Cuts an existing logo strip into separate logos at the white gaps between them.
export async function splitBanner(src) {
  const img = await loadImg(src)
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
  const ink = new Array(width).fill(0)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const k = (y * width + x) * 4
      if (data[k] < 230 || data[k + 1] < 230 || data[k + 2] < 230) ink[x]++
    }
  }
  const minGap = Math.max(12, Math.round(width * 0.03))
  const runs = []
  let start = -1, gap = 0
  for (let x = 0; x < width; x++) {
    if (ink[x] > Math.max(2, height * 0.04)) { if (start < 0) start = x; gap = 0 } else if (start >= 0) {
      gap++
      if (gap >= minGap) { runs.push([start, x - gap]); start = -1; gap = 0 }
    }
  }
  if (start >= 0) runs.push([start, width - 1])
  return runs.filter(([a, b]) => b - a > 10).map(([a, b]) => {
    const o = document.createElement('canvas')
    o.width = b - a + 1; o.height = height
    const octx = o.getContext('2d')
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, o.width, o.height)
    octx.drawImage(c, a, 0, o.width, height, 0, 0, o.width, height)
    return o.toDataURL('image/png')
  })
}

// Lays the logos out in one row on white, all the same height.
export async function composeBanner(list) {
  if (!list.length) return null
  const H = 160, GAP = 90, MAXW = 380, PAD = 20
  const imgs = await Promise.all(list.map((s) => loadImg(s.logo)))
  const sizes = imgs.map((i) => { let h = H, w = (i.naturalWidth / i.naturalHeight) * h; if (w > MAXW) { w = MAXW; h = (i.naturalHeight / i.naturalWidth) * w } return { w, h } })
  const c = document.createElement('canvas')
  c.width = Math.round(sizes.reduce((s, z) => s + z.w, 0) + GAP * (imgs.length - 1) + PAD * 2)
  c.height = H + PAD * 2
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  let x = PAD
  imgs.forEach((img, i) => { const { w, h } = sizes[i]; ctx.drawImage(img, x, PAD + (H - h) / 2, w, h); x += w + GAP })
  return c.toDataURL('image/png')
}

export default function Sponsors({ meet, reload, say }) {
  const [list, setList] = useState(() => (Array.isArray(meet?.sponsors) ? meet.sponsors : null))
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const fileRef = useRef(null)
  const tried = useRef(false)

  useEffect(() => { if (Array.isArray(meet?.sponsors)) setList(meet.sponsors) }, [meet?.sponsors])

  // First time: turn the existing banner into separate logos so each can be removed.
  useEffect(() => {
    if (tried.current || !meet || Array.isArray(meet.sponsors) || !meet.sponsor_banner) return
    tried.current = true
    splitBanner(meet.sponsor_banner).then((logos) => {
      const l = logos.map((logo, i) => ({ id: uid(), name: `Sponsor ${i + 1}`, logo }))
      setList(l)
      supabase.from('vc_meet').update({ sponsors: l }).eq('id', meet.id).then(() => {})
    }).catch(() => setList([]))
  }, [meet])

  async function save(next, message) {
    setBusy(true)
    const banner = await composeBanner(next)
    const { error } = await supabase.from('vc_meet').update({ sponsors: next, sponsor_banner: banner }).eq('id', meet.id)
    setBusy(false)
    if (error) { say('error', error.message); return }
    setList(next); say('ok', message); reload()
  }

  async function add(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const { imageFileToDataUrl } = await import('./heatsheet.js')
      const logo = await imageFileToDataUrl(f)
      const label = name.trim() || f.name.replace(/\.[a-z0-9]+$/i, '')
      await save([...(list || []), { id: uid(), name: label, logo }], `${label} added.`)
      setName('')
    } catch (err) { say('error', `Could not read the image: ${err.message}`) }
  }
  function remove(s) {
    if (!window.confirm(`Remove ${s.name}?`)) return
    save(list.filter((x) => x.id !== s.id), `${s.name} removed.`)
  }
  function move(i, d) {
    const next = [...list]; const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next, 'Order updated.')
  }
  async function rename(s, v) {
    const t = v.trim()
    if (!t || t === s.name) return
    const next = list.map((x) => (x.id === s.id ? { ...x, name: t } : x))
    const { error } = await supabase.from('vc_meet').update({ sponsors: next }).eq('id', meet.id)
    if (!error) setList(next)
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <h2 style={{ fontSize: 18 }}>Sponsors</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ width: 200, minHeight: 36 }} placeholder="Sponsor name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Sponsor name" />
          <button className="btn sm primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Saving…' : 'Add sponsor logo'}</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={add} style={{ display: 'none' }} />
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Add or remove sponsors one at a time and set their order. They appear in this order on the staff registration form, the call room screen, the spectator TV and the console.</p>

      {list === null ? <div className="small muted">Loading sponsors…</div> : !list.length ? <div className="small muted">No sponsors yet. Add the first logo.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {list.map((s, i) => (
            <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fff' }}>
              <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={s.logo} alt={s.name} style={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain' }} />
              </div>
              <input className="input" defaultValue={s.name} onBlur={(e) => rename(s, e.target.value)} aria-label={`Name of sponsor ${i + 1}`} style={{ minHeight: 32, fontSize: 13 }} />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.name} left`}>←</button>
                  <button className="btn sm" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.name} right`}>→</button>
                </div>
                <button className="btn sm danger" disabled={busy} onClick={() => remove(s)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
