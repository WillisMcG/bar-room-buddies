# Bar Room Buddies

A pool scorekeeping and statistics tracker for bars and pool halls. Track matches, player stats, head-to-head records, and leaderboards.

## Features

- Real-time match scorekeeping
- Player profiles and statistics
- Leaderboards with win percentage
- Head-to-head match history
- Support for multiple game types (8-Ball, 9-Ball, 10-Ball, Straight Pool, custom)
- Offline-first architecture with local storage
- Cloud sync via Supabase
- Dark/Light theme support
- Venue branding customization

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL) + Dexie (IndexedDB)
- **State**: React Context + Local Storage
- **Authentication**: Supabase Auth
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase CLI (for local development)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/WillisMcG/bar-room-buddies.git
cd bar-room-buddies
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. For local Supabase development:
```bash
npm run supabase:start
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
/src
  /app              - Next.js app pages
  /components       - React components
    /layout        - Header, navigation, page wrapper
    /ui            - Reusable UI components
  /contexts         - React context providers
  /hooks            - Custom React hooks
  /lib              - Utility functions and libraries
    /db            - Dexie database setup
    /supabase      - Supabase clients
    /sync          - Sync engine for Supabase
  /types            - TypeScript type definitions
/public             - Static assets
/supabase           - Database migrations and seed data
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run supabase:start` - Start local Supabase
- `npm run supabase:reset` - Reset local database
- `npm run supabase:migrate` - Push migrations to local Supabase

## Features

### Match Tracking
- Create matches between players
- Support for different game formats (Single, Race To, Best Of)
- Real-time score tracking
- Match history and completion status

### Player Statistics
- Win/loss records
- Win percentage
- Current and longest streaks
- Head-to-head matchups
- Statistics filtered by game type and time period

### Game Types
- System game types (8-Ball, 9-Ball, 10-Ball, Straight Pool)
- Custom game type creation
- Configurable match formats and rules

### Leaderboards
- Global rankings
- Filtered by game type
- Time period filtering (All Time, 30 Days, 90 Days)
- Minimum match threshold for ranking

### Offline Support
- Local-first database with IndexedDB
- Automatic sync when online
- Pending changes indicator
- Conflict resolution with server

## License

MIT
