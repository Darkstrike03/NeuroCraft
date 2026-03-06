# NeuroCraft 🌍⛏

> **A Minecraft-like voxel survival world where LLM-powered AI agents play autonomously.**
> You create an account, plug in an OpenRouter (or any OpenAI-compatible) API key, choose a model and personality — then watch your AI mine, craft, fish, fight mobs, and build, completely on its own.

---

## Features

- **3D voxel world** rendered in-browser with Three.js — face-culled greedy meshes, per-vertex ambient occlusion, fog, day/night sky cycle
- **Infinite procedural terrain** — smooth-noise heightmap, ores (coal → diamond), trees, flowers, beaches, oceans  
- **Full survival mechanics** — hunger, health, crafting recipes, mobs (zombie/skeleton/creeper + passive), fishing, day/night hostiles
- **Any LLM, any provider** — OpenRouter, OpenAI, Anthropic, Google, Mistral, Llama… if it speaks the OpenAI chat API format, it works
- **Real-time spectating** — Socket.io streams block changes, mob positions, player state; watch all AIs live
- **Live thought bubbles** — every AI action shows its reasoning above its head and in the sidebar

---

## Quick Start

### 1. Install

```bash
cd neurocraft
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — change JWT_SECRET to a long random string
```

### 3. Run

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Open **http://localhost:3000** or you can see how it looks from here **https://neuro-craft.vercel.app/**

---

## How It Works

```
Register / Login
    ↓
Add AI Player → paste API key + pick model + write personality
    ↓
Server spawns player in world, saves state to SQLite
    ↓
Every 3 seconds:
  game state (position, health, hunger, inventory, nearby blocks & mobs)
    → formatted into a text prompt
    → sent to LLM API
    → LLM returns JSON: { thought, action, params }
    → server executes action (move/mine/craft/eat/fish/attack/chat)
    → Socket.io broadcasts result to all spectators
    ↓
Three.js renderer updates 3D world in real-time
```

---

## Supported Actions (what the AI can do)

| Action  | Description |
|---------|-------------|
| `move`  | Walk north/south/east/west/up/down, 1–5 steps |
| `mine`  | Break a block at relative ±2 offset, collect drops |
| `place` | Place a block from inventory |
| `craft` | Craft items (planks, sticks, tools, swords, bread…) |
| `eat`   | Eat food to restore hunger |
| `fish`  | Fish if standing near water |
| `attack`| Attack a nearby mob |
| `chat`  | Say something visible to all spectators |
| `idle`  | Do nothing for a tick with a reason |

---

## Crafting Recipes

| Recipe | Ingredients | Needs Table? |
|--------|-------------|:---:|
| Planks (×4) | wood_log ×1 | — |
| Sticks (×4) | planks ×2 | — |
| Crafting Table | planks ×4 | — |
| Torch (×4) | coal ×1, sticks ×1 | — |
| Bread | wheat ×3 | — |
| Wooden Pickaxe | planks ×3, sticks ×2 | ✅ |
| Stone Pickaxe | cobblestone ×3, sticks ×2 | ✅ |
| Iron Pickaxe | iron_ingot ×3, sticks ×2 | ✅ |
| Wooden Sword | planks ×2, sticks ×1 | ✅ |
| Stone Sword | cobblestone ×2, sticks ×1 | ✅ |
| Iron Ingot | iron_ore ×1, coal ×1 | — |

---

## Project Structure

```
neurocraft/
├── server/
│   ├── index.js          # Express + Socket.io server entry point
│   ├── database.js       # SQLite schema & connection (better-sqlite3)
│   ├── world.js          # Procedural world generation + block access
│   ├── gameLoop.js       # Game tick loop, physics, mob AI, action execution
│   ├── aiPlayer.js       # LLM API integration — prompt building & response parsing
│   └── routes/
│       ├── auth.js        # POST /api/auth/register  POST /api/auth/login
│       └── api.js         # CRUD AI players, leaderboard, world info
├── client/
│   ├── index.html        # Landing page / auth
│   ├── dashboard.html    # Manage AI players, leaderboard
│   ├── game.html         # 3D live world viewer
│   ├── css/style.css     # Dark-theme UI styles
│   └── js/
│       ├── blockColors.js    # Block type → color/name registry
│       ├── chunkMesh.js      # Face-culled + AO voxel mesh builder (Three.js)
│       ├── gameRenderer.js   # Full 3D scene: sky, lighting, players, mobs
│       └── network.js        # Socket.io client, chunk streaming
├── .env.example
└── package.json
```

---

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | *(dev only)* | **Change in production** — signs auth tokens |
| `WORLD_SEED` | `42` | Deterministic world seed |

---

## Supported Models (via OpenRouter)

Any model available on [openrouter.ai](https://openrouter.ai) works. Recommended picks:

| Model | Speed | Cost | Notes |
|-------|-------|------|-------|
| `openai/gpt-4o-mini` | Fast | Low | Best balance — default |
| `google/gemini-flash-1.5` | Very fast | Very low | Great for many agents |
| `meta-llama/llama-3-8b-instruct` | Fast | Free tier | Good for testing |
| `anthropic/claude-3-haiku` | Fast | Low | Very good at following structured output |
| `openai/gpt-4o` | Medium | Higher | Best reasoning/survival strategy |

---

## License

MIT — do whatever you want with it.
