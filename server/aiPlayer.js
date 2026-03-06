'use strict';
const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are an AI playing a Minecraft-like voxel survival game called NeuroCraft.
You have complete freedom — explore, mine, build, fish, fight, craft, and survive.

WORLD RULES:
- Blocks exist on a 3D grid. You are at position (x,y,z). dy=+1 is up, dy=-1 is down.
- Mine blocks to collect resources. Craft tools to mine faster.
- Eat food to restore hunger. Hunger=0 causes health loss.
- Hostile mobs (zombie, skeleton, creeper) appear at night and attack you.
- Passive mobs (cow, pig, sheep) drop food when killed.

KEY CRAFTING (you must know these):
- wood_log → 4 planks        | planks+sticks → wooden tools
- planks×4 → crafting_table  | coal+sticks → 4 torches
- cobblestone+sticks → stone tools/sword
- iron_ore+coal → iron_ingot  → iron tools (fastest mining)
- wheat×3 → bread | fish near water → raw_fish (eat for hunger)

SURVIVAL PRIORITY:
1. Get wood → make planks → crafting_table → wooden_pickaxe
2. Mine stone for stone tools, then find iron ore for iron tools
3. Always watch hunger — eat when below 14
4. Build shelter or go underground before night
5. Diamond ore is deep underground (best tools)

You respond ONLY with a single JSON object (no markdown, no extra text):
{
  "thought": "Brief internal reasoning (1-2 sentences)",
  "action":  "move | mine | place | craft | eat | fish | attack | chat | idle",
  "params":  { ...action parameters }
}

Parameter schemas:
- move:   { "direction": "north|south|east|west|up|down", "steps": 1-5 }
- mine:   { "dx": -2..2, "dy": -2..2, "dz": -2..2 }  ← relative to your position
- place:  { "block": "block_name", "dx": -1..1, "dy": -1..1, "dz": -1..1 }
- craft:  { "recipe": "recipe_name" }
- eat:    { "item": "food_item" }
- fish:   {}
- attack: { "target": "mob_type" }
- chat:   { "message": "what to say" }
- idle:   { "duration": 1-3, "reason": "why" }

Be decisive, strategic, and have a distinct personality!`;

class AIPlayer {
  constructor(config) {
    this.id          = config.id;
    this.name        = config.name;
    this.personality = config.personality || '';
    this.model       = config.model       || 'openai/gpt-4o-mini';
    this.isThinking  = false;
    this.lastCall    = 0;
    this.cooldown    = 2500; // ms — don't call API more often than this
    this.history     = [];   // short message history for context
    this.maxHistory  = 8;    // keep last N exchanges

    this.client = new OpenAI({
      apiKey:   config.api_key,
      baseURL:  config.provider_base_url || 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://neurocraft.game',
        'X-Title':      'NeuroCraft',
      },
    });
  }

  _buildStateText(playerState, worldCtx) {
    const inv     = playerState.inventory.length
      ? playerState.inventory.map(i => `${i.item}×${i.count}`).join(', ')
      : 'empty';
    const blocks  = worldCtx.blocks
      .filter(b => Math.abs(b.dx) + Math.abs(b.dz) + Math.abs(b.dy) <= 6)
      .slice(0, 60)
      .map(b => `${b.type}@[${b.dx},${b.dy},${b.dz}]`)
      .join('; ');
    const mobs    = (playerState.nearbyMobs || [])
      .map(m => `${m.type}(${m.dx},${m.dy},${m.dz})`).join(', ') || 'none';

    return [
      `=== NeuroCraft State ===`,
      `Pos: (${Math.floor(playerState.x)}, ${Math.floor(playerState.y)}, ${Math.floor(playerState.z)})`,
      `Health: ${playerState.health.toFixed(1)}/20  Hunger: ${playerState.hunger.toFixed(1)}/20`,
      `Inventory: ${inv}`,
      `Nearby blocks: ${blocks || 'none'}`,
      `Nearby mobs: ${mobs}`,
      `Last result: ${playerState.lastActionResult || 'n/a'}`,
      `=== What do you do next? ===`,
    ].join('\n');
  }

  async decideAction(playerState, worldCtx) {
    if (this.isThinking) return null;
    if (Date.now() - this.lastCall < this.cooldown) return null;

    this.isThinking = true;
    try {
      const stateText = this._buildStateText(playerState, worldCtx);

      const messages = [
        {
          role:    'system',
          content: `${SYSTEM_PROMPT}\n\nYour name: ${this.name}\nYour personality: ${this.personality}`,
        },
        ...this.history,
        { role: 'user', content: stateText },
      ];

      const resp = await this.client.chat.completions.create({
        model:       this.model,
        messages,
        max_tokens:  220,
        temperature: 0.85,
      });

      const raw = resp.choices[0].message.content.trim();
      let action;

      try {
        // Strip markdown code fences if present
        const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        action = JSON.parse(cleaned);
      } catch {
        // Try to find any JSON object in the response
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          try { action = JSON.parse(match[0]); } catch { /* fall through */ }
        }
        if (!action) {
          action = { thought: 'Parsing error — taking a moment', action: 'idle', params: { duration: 2, reason: 'parse error' } };
        }
      }

      // Persist short history
      this.history.push({ role: 'user',      content: stateText });
      this.history.push({ role: 'assistant', content: JSON.stringify(action) });
      if (this.history.length > this.maxHistory * 2) {
        this.history = this.history.slice(-this.maxHistory * 2);
      }

      this.lastCall = Date.now();
      return action;
    } catch (err) {
      console.error(`[AIPlayer:${this.name}] API error:`, err.message);
      return { thought: 'API error — resting', action: 'idle', params: { duration: 3, reason: 'api error' } };
    } finally {
      this.isThinking = false;
    }
  }
}

module.exports = { AIPlayer };
