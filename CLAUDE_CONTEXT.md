# Bar Room Buddies - Project Context

> This file helps Claude (Cowork) get up to speed quickly between sessions.
> Updated: Feb 8, 2026

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
│   ├── play/                 # Game mode selector (1v1, doubles, open table, tournament)
│   ├── match/new/            # Create new 1v1 match
│   ├── match/[id]/           # Scorekeeping screen
│   ├── session/new/          # Create open table session
│   ├── session/[id]/         # Open table rotation screen
│   ├── tournament/new/       # Create new tournament
│   ├── tournament/[id]/      # Tournament bracket view
│   ├── tournament/[id]/match/[matchId]/  # Tournament match scoring
│   ├── players/              # Player list
│   ├── players/[id]/         # Player profile & stats
│   ├── leaderboard/          # Rankings
│   ├── game-types/           # Pool game definitions
│   ├── settings/             # App preferences
│   └── venue/                # Venue branding config
├── components/
│   ├── AppInitializer.tsx    # Seeds system game types on first load
│   ├── layout/               # Header, BottomNav (6 tabs), PageWrapper
│   ├── tournament/           # BracketMatch component
│   └── ui/                   # Avatar, Badge, Button, Card, EmptyState, Input, Modal, Select
├── contexts/
│   ├── AuthContext.tsx       # User auth state, profile, sign up/in/out
│   └── ThemeContext.tsx      # Dark/light mode, venue branding
├── hooks/
│   ├── useLocalPlayers.ts    # IndexedDB player CRUD
│   ├── useMatch.ts           # Load match with related data
│   └── useSync.ts            # Online status, sync status, pending changes
├── lib/
│   ├── db/dexie.ts           # IndexedDB schema (v4 - includes tournaments)
│   ├── tournaments/          # Tournament logic (bracket-generator, tournament-helpers)
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
| **Tournament** | Single or double elimination brackets |

### Supported Pool Games
8-Ball, 9-Ball, 10-Ball, Straight Pool (14.1), plus custom game builder.

### Match Formats
Single game, race-to-X, best-of-X.

### Tournament Formats
- Single Elimination: Standard single-loss bracket
- Double Elimination: Winners and losers brackets with grand final

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
- **Tournament Brackets** (single & double elimination with auto-advancement)

---

## Not Yet Built (Future)
- Shot-by-shot tracking (break-and-runs, safeties)
- Handicap/rating systems (Fargo, APA-style)
- Performance charts and trend analytics
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
| `5a08e96` | Add doubles, open table sessions, and play mode selector |
| `d9063fd` | Improve doubles team selection with randomize and manual pick |
| _(current)_ | **Add tournament bracket feature with single/double elimination** |

---

## Current Work in Progress

_(Update this section at the end of each session)_

**Latest session (Feb 8, 2026):**
- Implemented full tournament bracket system:
  - Bracket generator for single & double elimination
  - Auto-advancement logic for winners/losers progression
  - Seeding system (random + manual drag-and-drop)
  - Match scoring interface (split-screen tap-to-score)
  - Tournament progress tracking & standings
  - Grand final for double elimination
- Created 6 new tournament-related files:
  - `src/lib/tournaments/bracket-generator.ts` - Bracket structure generation
  - `src/lib/tournaments/tournament-helpers.ts` - Advancement, standings, progress tracking
  - `src/app/tournament/new/page.tsx` - Multi-step tournament creation (format, players, seeding)
  - `src/app/tournament/[id]/page.tsx` - Bracket view with round navigation
  - `src/app/tournament/[id]/match/[matchId]/page.tsx` - Match scoring interface
  - `src/components/tournament/BracketMatch.tsx` - Reusable match card component
- Updated 5 existing files:
  - `src/lib/db/dexie.ts` - Added v4 schema with tournament tables
  - `src/app/play/page.tsx` - Added tournament link to game mode selector
  - `src/components/layout/BottomNav.tsx` - Updated nav to include tournament routes
  - `src/components/ui/Avatar.tsx` - No changes (included in batch)
  - `CLAUDE_CONTEXT.md` - Updated project documentation
- All changes committed and pushed to main via `mcp__github__push_files`

**Known issues:**
- Double elimination undo is complex and deferred (undo only works before navigating)
- Sync engine not yet integrated with tournaments (local-only for now)

**Next steps:**
- Integrate tournament sync to Supabase
- Add replay/archive tournament history
- Create tournament statistics dashboard
- Consider bracket visualization improvements

