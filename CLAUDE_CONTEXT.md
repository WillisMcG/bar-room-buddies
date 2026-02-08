# Bar Room Buddies - Project Context

> This file helps Claude (Cowork) get up to speed quickly between sessions.
> Updated: Feb 7, 2026

## Quick Summary

Pool scorekeeping and statistics app. Track games, maintain win/loss records, carry stats anywhere. Built for home use with a path toward commercial bar/league deployment.

**Repo:** https://github.com/WillisMcG/bar-room-buddies.git
**Hosting:** Vercel
**Owner:** Will (GitHub: WillisMcG)

---

## Tech Stack

- **Frontend:** React 18 + Tailwind CSS 3.4
- **Framework:** Next.js 14 (App Router)
- **Backend/DB:** Supabase (Postgres + Auth + Storage + RLS)
- **Local Storage:** Dexie.js v4 (IndexedDB) - offline-first
- **Language:** TypeScript (strict mode)
- **Icons:** lucide-react
- **Deployment:** Vercel

---

## Architecture

### Offline-First Pattern
The app always reads/writes to IndexedDB (Dexie) first, then syncs to Supabase in the background. Sync runs every 30s when online, on reconnect, and can be triggered manually. Conflict resolution uses "last write wins" with timestamps.

### Auth Model
Auth is optional. Supports local anonymous/guest players (no login needed) and Supabase email auth for account-based players whose stats persist across devices. Mixed play allowed (account vs guest).

### Theme
Dark mode by default with light/dark toggle. Venue branding accent color applies in both modes.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Home/dashboard
│   ├── layout.tsx            # Root layout (auth + theme providers)
│   ├── globals.css
│   ├── play/                 # Game mode selector (1v1, doubles, open table)
│   ├── match/new/            # Create new 1v1 match
│   ├── match/[id]/           # Scorekeeping screen
│   ├── session/new/          # Create open table session
│   ├── session/[id]/         # Open table rotation screen
│   ├── players/              # Player list
│   ├── players/[id]/         # Player profile & stats
│   ├── leaderboard/          # Rankings
│   ├── game-types/           # Pool game definitions
│   ├── settings/             # App preferences
│   └── venue/                # Venue branding config
├── components/
│   ├── AppInitializer.tsx    # Seeds system game types on first load
│   ├── layout/               # Header, BottomNav (6 tabs), PageWrapper
│   └── ui/                   # Avatar, Badge, Button, Card, EmptyState, Input, Modal, Select
├── contexts/
│   ├── AuthContext.tsx       # User auth state, profile, sign up/in/out
│   └── ThemeContext.tsx      # Dark/light mode, venue branding
├── hooks/
│   ├── useLocalPlayers.ts    # IndexedDB player CRUD
│   ├── useMatch.ts           # Load match with related data
│   └── useSync.ts            # Online status, sync status, pending changes
├── lib/
│   ├── db/dexie.ts           # IndexedDB schema (v3 - singles, doubles, group)
│   ├── supabase/             # client.ts, server.ts, middleware.ts
│   ├── sync/sync-engine.ts   # Bidirectional sync engine
│   └── utils.ts              # Date/duration formatting, helpers
├── types/index.ts            # 44 TypeScript types (enums, models, forms, state)
└── middleware.ts
```

---

## Supabase Database

### Tables
- **profiles** - Players (local or auth-linked), avatar, device tracking, merge support
- **game_types** - Pool game definitions (8-Ball, 9-Ball, 10-Ball, Straight Pool, custom)
- **matches** - 1v1 matches with scores, format, status
- **games** - Individual games within a match
- **venues** - Venue branding (logo, name, accent color)

### Custom Functions
- `get_player_stats()` - Win/loss, percentage, streaks
- `get_head_to_head()` - H2H record between two players
- `get_leaderboard()` - Ranked player list with filters
- `merge_profiles()` - Merge local guest into account profile

### RLS
All tables have row-level security enabled with appropriate policies.

---

## Game Modes

| Mode | Description |
|------|-------------|
| **1v1 Singles** | Standard head-to-head match |
| **Doubles** | 2v2 team matches |
| **Open Table** | Winner stays on, rotation queue for group play |

### Supported Pool Games
8-Ball, 9-Ball, 10-Ball, Straight Pool (14.1), plus custom game builder.

### Match Formats
Single game, race-to-X, best-of-X.

---

## Features Implemented
- Player management (local guests + account-based)
- All game types with custom game builder
- Match scorekeeping (tap-to-score, undo)
- Open Table sessions (winner stays, rotation)
- Player stats (overall record, head-to-head, streaks, match history)
- Leaderboard with filters (game type, time period)
- Offline support with background sync
- Venue branding (logo, name, accent color)
- Guest-to-account profile merging
- Dark/light theme

---

## Not Yet Built (Future)
- Shot-by-shot tracking (break-and-runs, safeties)
- Handicap/rating systems (Fargo, APA-style)
- Performance charts and trend analytics
- Tournament brackets
- Team/league management
- Social features (friend lists, challenges, chat)
- Push notifications
- Native mobile app (React Native)
- Advanced commercial venue features

---

## Git History

| Hash | Description |
|------|-------------|
| `fccb5b3` | Initial commit: full MVP foundation (48 files) |
| `7d665de` | Fix head-to-head and player stats to include Open Table session games |

---

## Current Work in Progress

_(Update this section at the end of each session)_

**Last session (Feb 7, 2026):**
- Uncommitted changes across 9 modified files and 3 new files
- Added `/play` route (game mode selector)
- Added `/session` routes (open table feature)
- Added `AppInitializer` component
- Modified leaderboard, match, player pages, BottomNav, Dexie schema (v3 with doubles support)
- ~836 insertions, ~165 deletions total

**Known issues:**
- _(none documented yet - add here as they come up)_

**Next steps:**
- _(add planned work here)_
