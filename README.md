# MeatHammerMordHeim

Mordheim warband roster manager — a browser-based web app for creating, equipping, and tracking your Mordheim warbands through a campaign.

## Features

- Create rosters for all core Mordheim warbands (Reikland, Middenheim, Marienburg, Witch Hunters, Sisters of Sigmar, Undead, Cult of the Possessed, Skaven)
- Recruit heroes and henchmen with full stat lines
- Equip warriors from the equipment lists (weapons, armour, miscellaneous gear)
- Assign skills from each hero's available skill categories
- Track experience, levels, and advancement
- Record injuries and stat modifications
- Manage treasury (gold crowns and wyrdstone)
- Log battles and campaign notes
- Export/import rosters as JSON files
- All data persisted in browser localStorage

## Data Files

Game data is stored in structured JSON files under `data/` for easy editing:

| File | Contents |
|------|----------|
| `data/warbands.json` | Warband types, hero/henchman templates, stat lines, skill access |
| `data/equipment.json` | Weapons, armour, and miscellaneous equipment with costs and rules |
| `data/skills.json` | Skill categories (Combat, Shooting, Academic, Strength, Speed) |
| `data/injuries.json` | Hero and henchman injury tables |
| `data/advancement.json` | Experience thresholds, advancement rolls, max stat values |

## Running

Serve the project directory with any static HTTP server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Tech Stack

Plain HTML, CSS, and JavaScript — no build tools or dependencies required.
