# Dino Runner Multiplayer – Full Architecture

Chrome Offline T-Rex + Firebase Realtime Multiplayer.

## Architecture

```
                    GAME ENGINE
                         │
          ┌──────────────┴──────────────┐
          │                             │
    LOCAL SIMULATION               MULTIPLAYER
          │                             │
    ┌─────┼─────┐                 Firebase RTDB
    │     │     │                       │
 Player  World  Physics            Room State
    │     │     │                       │
    └─────┼─────┘                       │
          │                             │
      Renderer ◄──── Interpolation ◄────┘
          │
       Canvas + Overlay
```

## Implemented Features

### Core Engine
- Classic Chromium offline dino (100% close)
- Deterministic `SeededRandom` (LCG)
- Daily seed generator
- Replay Recorder (input events only)
- Ghost player class ready

### Multiplayer
- Anonymous Auth + Google link support
- Create / Join Room (6-char code, max 8)
- Lobby + Ready + Countdown
- Shared seed per room
- Player state sync (~12 Hz)
- **Remote players + visual interpolation** (smooth)
- Overlay canvas rendering of other dinos
- Presence (online / offline + onDisconnect)
- Name tags + score above remote players

### Competitive
- Global Leaderboard (all-time + daily)
- Score submission + basic client validation
- Daily Challenge mode (shared daily seed)

### Cosmetics
- Skin / Hat / Trail system
- Inventory + Wallet (coins)
- Shop purchase with Firebase transaction
- Current cosmetics sent with player state

### Security
- Full RTDB Security Rules (`firebase/database.rules.json`)
- User can only write own profile / own player node
- Host-only room state writes
- Score range validation

## Project Structure

```
src/
├── engine/
│   └── RNG.js                 # SeededRandom + dailySeed
├── multiplayer/
│   ├── Firebase.js
│   ├── Auth.js
│   ├── RoomManager.js
│   ├── Presence.js
│   ├── Interpolation.js       # RemotePlayer + smoothing
│   └── RemoteRenderer.js      # Draws other players
├── replay/
│   └── Recorder.js            # Record + GhostPlayer
├── cosmetics/
│   └── CosmeticManager.js     # Skins, hats, trails, shop
├── social/
│   └── Leaderboard.js
├── ui/
│   └── Menu.js
└── main.js
```

## How to Run

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open http://localhost:8080

## Controls
- Space / ↑ → Jump
- ↓ → Duck
- Mobile: Tap = Jump

## Firebase
Deploy rules:
```bash
firebase deploy --only database
```

Enable App Check for production.

## Next Steps (still open)
- Fully replace Math.random inside Obstacle generator with SeededRandom when mode === race
- Full Ghost racing UI (load previous best / friend replay)
- Biome / Weather systems
- Power-ups & Coins as deterministic events
- Level Editor + Community Levels + Storage
- Cloud Functions for strong anti-cheat

The foundation is now solid for 2–8 player races with smooth remote players.
