import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// Loads the active meet and everything under it, and keeps it live with Supabase Realtime.
export function useMeet() {
  const [meet, setMeet] = useState(null)
  const [events, setEvents] = useState([])
  const [heats, setHeats] = useState([])
  const [entries, setEntries] = useState([])
  const [positions, setPositions] = useState([])
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const timer = useRef(null)

  const load = useCallback(async () => {
    const { data: meets, error: e1 } = await supabase.from('vc_meet').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
    if (e1) { setError(e1.message); setLoading(false); return }
    const m = meets?.[0] || null
    setMeet(m)
    if (!m) { setLoading(false); return }
    const [ev, ps, ap] = await Promise.all([
      supabase.from('vc_events').select('*').eq('meet_id', m.id).order('event_no'),
      supabase.from('vc_positions').select('*').eq('meet_id', m.id).order('sort'),
      supabase.from('vc_applications').select('*').order('created_at', { ascending: false })
    ])
    const evs = ev.data || []
    const ids = evs.map((e) => e.id)
    let hs = [], en = []
    if (ids.length) {
      const h = await supabase.from('vc_heats').select('*').in('event_id', ids)
      hs = h.data || []
      const hids = hs.map((x) => x.id)
      for (let i = 0; i < hids.length; i += 150) {
        const r = await supabase.from('vc_entries').select('*').in('heat_id', hids.slice(i, i + 150))
        en = en.concat(r.data || [])
      }
    }
    setEvents(evs); setHeats(hs); setEntries(en); setPositions(ps.data || []); setApps(ap.data || [])
    setError(ev.error?.message || ps.error?.message || ap.error?.message || null)
    setLoading(false)
  }, [])

  const reloadSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 250)
  }, [load])

  useEffect(() => {
    load()
    const ch = supabase.channel('vc-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vc_meet' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vc_heats' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vc_entries' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vc_applications' }, reloadSoon)
      .subscribe()
    const onFocus = () => reloadSoon()
    window.addEventListener('focus', onFocus)
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', onFocus); clearTimeout(timer.current) }
  }, [load, reloadSoon])

  // Flat heat order: events by number, heats by number.
  const order = useMemo(() => {
    const byEvent = new Map(events.map((e) => [e.id, e]))
    const totals = {}
    heats.forEach((h) => { totals[h.event_id] = (totals[h.event_id] || 0) + 1 })
    return heats
      .filter((h) => byEvent.has(h.event_id))
      .map((h) => {
        const e = byEvent.get(h.event_id)
        return { ...h, event_no: e.event_no, event_name: e.name, heat_total: totals[h.event_id] }
      })
      .sort((a, b) => a.event_no - b.event_no || a.heat_no - b.heat_no)
  }, [events, heats])

  const runIdx = useMemo(() => (meet?.running_heat_id ? order.findIndex((h) => h.id === meet.running_heat_id) : -1), [order, meet])

  return {
    meet, events, heats, entries, positions, apps, order, runIdx, loading, error, reload: load,
    setHeats, setEntries, setApps, setMeet, setPositions
  }
}
