# Vortex Competition

Meet operations web app for Vortex Aquatics: call room, officials & positions, staff registration and a live call-room display screen.

- `/` — organizer console (sign-in required; email must be on the organizer list)
- `/register` — public staff registration form (QID, bank, IBAN, position)
- `/board` — full-screen call room display (live)

Stack: Vite + React, Supabase (Postgres, Auth, Realtime, RLS), Vercel.

## Local
```
cp .env.example .env.local   # add Supabase URL + publishable key
npm install && npm run dev
```

## Database
Tables are prefixed `vc_` (vc_meet, vc_events, vc_heats, vc_entries, vc_positions, vc_applications, vc_admins).
Row Level Security: the public can only read the active meet + positions and insert an application; everything else requires a signed-in email listed in `vc_admins`.

## Heat sheet CSV
`event_no,event_name,heat_no,lane,swimmer_name,club,seed_time`
