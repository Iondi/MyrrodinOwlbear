# Myr'rodin System — an Owlbear Rodeo extension

Character sheets for the Myr'rodin homebrew, saved right on each token.

- **Right-click a character token → Create / Open Myr'rodin Sheet**
- Stats, the proficiency tiers (Inept → Master), the 30 Myr'rodin skills, HP, AC, mana, **Melee** and **Magic**, weapons with graze, inventory and story notes
- The **Super Awesome Fast Combat Helper**: your turn order as a checklist, with a "New turn" reset
- Click any number to roll it. Everyone in the room sees the roll (tick **Private rolls** to show only you and the GM)
- **Cast** rolls d20 + casting modifier + proficiency against the spell's DC to Cast and takes the mana for you
- The **Myr'rodin** button in the top-left toolbar shows the whole party's HP and mana, a quick dice box and the roll log. The GM gets Damage/Heal buttons for every character.

---

## Part 1 — Put it online (one time, about 10 minutes)

Owlbear loads extensions from a web address, so the files need a free home. GitHub Pages works well.

1. Go to **github.com** and make a free account (or sign in).
2. Click the **+** in the top-right → **New repository**.
   - Name: `myrrodin-system`
   - Set it to **Public**
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Unzip `myrrodin-system.zip` on your computer. Open the folder, select **everything inside it** (the `css`, `js`, `vendor`, `characters` folders and all the files), and drag it all onto the GitHub page.
   - Make sure `manifest.json` ends up at the top level, not inside another folder.
5. Click **Commit changes**.
6. Go to **Settings** (tab at the top of the repository) → **Pages** (left sidebar).
   - Under **Branch**, pick `main` and `/ (root)`, then **Save**.
7. Wait a minute or two, then refresh. GitHub shows your site address, like
   `https://YOUR-NAME.github.io/myrrodin-system/`

Your install link is that address with `manifest.json` on the end:

```
https://YOUR-NAME.github.io/myrrodin-system/manifest.json
```

Open it in a browser. If you see the text starting with `{ "name": "Myr'rodin System"`, it's working.

## Part 2 — Add it to Owlbear

1. On **owlbear.rodeo**, open your **Profile**.
2. Under **Extensions**, click **Add Extension** and paste the install link from Part 1.
3. Open your room (or make a new one) and turn on **Myr'rodin System** in the room's extensions.
4. You'll see the Myr'rodin button in the top-left. Players don't install anything: it turns on for everyone in the room.

## Part 3 — Give each player a sheet

1. Put each player's token on the map (on the Character layer).
2. Right-click the token → **Create Myr'rodin Sheet**. Pick **Start a blank sheet**, **Load a character**, or **Use the example (Lyrith)**.
3. Go to the **Sheet** tab and set the **Owner** to that player. Now only they and you (the GM) can edit it. Everyone else can still view it and roll from it.
4. Players fill in their own numbers from their Google Sheet.

For NPCs and monsters, tick **Hide this sheet from players** on the Sheet tab.

> **If a player's changes say "Not saved":** in Owlbear, open the room's player permissions and make sure players are allowed to update characters.

---

## Linking a Google Sheet

Each character can stay in their Google Sheet and update Owlbear automatically.

1. In Google Sheets, click **Share** and set **General access** to **Anyone with the link** (Viewer).
2. Copy the sheet's link from the address bar.
3. In Owlbear, right-click the token → **Create Myr'rodin Sheet → Link a Google Sheet**, and paste the link. For a sheet that already exists, paste it on the **Sheet** tab instead.

What syncs: name, class, level, XP, ability scores, saves, skill tiers (totals match the Google Sheet exactly), AC, speed, max HP, mana, mana regen, Initiative, Will Check, Spell Save DC, combat helper, features, feats, weapons (or the Combat Helper's "Attack +X / Damage" lines when there's no weapon table), spells, inventory and money.

**Spell notes:** a spell named like `Resistance - Wisdom` or `Mending (Wisdom)` comes across as the spell **Resistance** with the note **Wisdom**, shown under the spell's level. If the note is an ability (Wisdom, WIS, Charisma…), the **Cast** button rolls with that ability instead of the sheet's usual casting ability. You can also type notes on any spell by hand.

What stays in Owlbear: current HP, spent mana during play, and combat-helper ticks. If the Google Sheet's own **Current HP** or **Mana Used** changes, that wins.

While the GM has the room open, linked sheets re-sync about once a minute. Anyone who can edit a sheet can also click **Sync now**. The Sheet tab lists anything it couldn't find on the Google Sheet (usually a renamed label).


**Custom damage:** every weapon card has a box next to Damage. Type any roll (`2d8+4`, `1d6+3d8`…) and press Enter or **Roll**. Handy for crits, smites and one-off bonuses. The last roll you typed stays in the box.

## Magic: learning spells

**Roll to hit:** under Spellcasting on the Magic tab, **✦ Roll to hit** rolls a spell attack: d20 + casting modifier + proficiency, plus any **Extra to-hit bonus** you type in. Advantage and Disadvantage buttons sit beside it.

Spells follow the Crafting System rules:

- **Cantrips** are known automatically.
- A spell of level N is **learned after N successful casts**. Unlearned spells sit under **Learning** with progress pips and a **Practice cast** button. Each successful cast adds one; when it's full the spell moves to Known spells.
- From the Google Sheet, a spell counts as learned if its **Learn** box is ticked or its **Cast Times** ticks reach its level. Spells with some casts show under Learning.
- Everything else on the sheet's spell list goes into the **Spell library** (collapsed at the bottom of Magic). Click **Start learning** to move one into Learning. The library isn't saved on the token, which keeps sheets small.
- Spell levels go to 13 (mana 30/33/36/40 and DC 40/45/50/55 for 10th–13th). Mana regen goes to Int 40.
- Progress made in Owlbear isn't written back to Google. Tick **Cast Times** on the Google Sheet too; a sync always keeps the higher count, so nothing is lost.

---

## The Myr'rodin menu

Click the **Myr'rodin** button (top left) to open the menu. It has four tabs, and clicking anywhere on the map closes it again, so it never locks the screen.

- **Party**: everyone's HP and mana. The GM gets Damage/Heal buttons and **⚔ Start combat**.
- **Combat**: initiative order, joining, and the GM's turn controls.
- **Inventory**: your character's gear and coins, plus the shared **party stash**. The GM can pick any character to see their inventory.
- **Dice**: quick rolls (one-tap d4 to d100), the roll log and the dice animation switch.

## The party (saved with the room)

Player characters are saved with the **room**, not just on their token, so changing or refreshing a scene doesn't mean setting them up again.

- The GM ticks **Campaign party** at the top of any character sheet to keep it in the party: players, NPC companions, anyone. Untick it to take them out.
- Sheets with an **Owner** start ticked automatically.
- The GM's computer keeps the saved copy up to date as you play: HP, mana, gear, everything.
- On a new scene, drop a token with the **same picture** (or named the same as the character) and the sheet attaches by itself.
- Or open **Party** and click **Place party on map**: everyone who isn't on the map yet appears in the middle of the view, sheets attached.
- The Party tab always lists the whole party, even on a map they're not on.

**Party frames:** everyone's HP, mana and AC, always on screen (top-left by default). Clicks pass straight through them. Each player can turn them off or move them at the bottom of the Party tab.

Owlbear only lets a room store a small amount of data, so saved sheets are compressed, and Google-linked characters save just their link (the sheet reloads from Google). The Party tab shows how much space the party uses.

## Combat & initiative

1. GM: **Party → ⚔ Start combat** (or the Combat tab).
2. Everyone's menu opens on the **Combat** tab.
   - Monsters, NPCs and sheets without an owner roll automatically.
   - Players see **"Combat is starting! Would you like to join?"** with **Join & roll**.
   - The GM can **Roll for them** for anyone who's away.
3. The order sorts itself (highest first, ties to higher Dexterity). The GM clicks **Begin round 1**, then **Done — next** each turn. **◀** steps back.
4. A **turn-order strip** appears on screen during the fight. It's click-through, so it never blocks the map or Owlbear's buttons. Each player can turn it off or move it to any corner from the Combat tab.
5. Everyone gets a notification when the turn changes.
6. **Mana at the start of a turn:** when a character with mana comes up, whoever runs it (the owner, or the GM for NPCs) gets *"Your turn — start by re-rolling your mana"*, and the Combat tab shows a **✦ Re-roll mana** button. It rolls the character's regen, adds it (up to max) and posts the roll to everyone. Once it's done that turn, it shows ✓.

GM extras: click an initiative number to change it, ✕ removes someone, **+ Add new tokens** pulls in sheets placed mid-fight, **End combat** (click twice) ends it.

## Party stash

One loot list for the whole group. It lives with the room, so it follows you between scenes.

- The GM adds loot and coins, and can edit or remove anything.
- Players click **Take** to move an item into their character's gear, or **⇢ Stash** on their own gear to put it back.
- **Split coins among the party** shares the stash's coins evenly between every sheet that has an owner. Leftover coins stay in the stash.
- Items taken from the stash stay on Google-linked sheets through syncs.

---

## Celestial dice

Every roll plays a glowing star-glass dice animation. Rolls from the sheet animate inside the sheet for the person rolling, and over the map for everyone else in the room. Natural 20s burst gold, natural 1s crack red, and advantage shows both d20s with the dropped one dimmed. Private rolls only animate for the roller and the GM.

Each player can turn the animation off for themselves with the **Dice animation** checkbox in the Myr'rodin panel.

---

## Monsters from the 5E bestiary

Right-click any character token → **Create Myr'rodin Sheet → Monster from the 5E bestiary**.

- It guesses the creature from the token's name (or the token picture's name, so Owlbear's "Beast" token suggests a boar, wolf, bear…). Generic words work too: *undead*, *humanoid*, *dragon*, *bandit*.
- **Roll hit points** rolls the creature's hit dice (a skeleton gets 2d8+4) instead of the average.
- **Vary ability scores** nudges each score up or down by 1, so no two goblins are identical.
- **Hide from players** is on by default for monsters.
- 5E skills carry over as Myr'rodin tiers (Proficient or Expert). The Myr'rodin-only skills (Reflex, Endurance, Mana Burn…) use the plain ability modifier. Attacks, multiattack (as the combat helper), traits, resistances and senses all come across, and attack and damage numbers match the printed stat block.

All 334 creatures in the 5E System Reference Document 5.1 are included. SRD 5.1 is © Wizards of the Coast and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The data comes from the [5e-bits/5e-database](https://github.com/5e-bits/5e-database) project.

---

## Backups

Sheets live on the token. **If you delete the token or the scene, the sheet goes with it.** Use **Sheet → Export character** to copy a backup, and **Import character** (or **Load a character** on a new token) to bring it back. This is also how a character moves to a new scene or a new room.

Owlbear keeps the data small, so very long notes can make a sheet too big to save. The Sheet tab shows the size.

## Changing a rule

Every rule lives in `js/rules.js`, near the top under **HOUSE_RULES**:

| Setting | What it does | Now set to |
|---|---|---|
| `tierMultiplier` | How much each tier adds, as a multiple of the proficiency bonus | Prof ×1, Expert ×2, Master ×2 |
| `masterRollsWithAdvantage` | Master tier rolls with advantage | yes |
| `ineptAutoFails` | Inept tier fails automatically | yes |
| `manaSpentOnFailedCast` | Mana is spent even when the cast fails | no |
| `weaponProficiencyAddsBonus` | Proficient weapons add proficiency to hit | yes |

Spell mana costs and DCs by level, the XP table and the skill list are in the same file. Edit the file on GitHub (click it, then the pencil icon), commit, wait a minute, and reload Owlbear.

## Trying it without Owlbear

Open `party.html` or `sheet.html` from your GitHub Pages address in a normal browser tab. It runs in preview mode with Lyrith loaded, saved only in that browser.

## Files

```
manifest.json        what Owlbear reads to install the extension
background.html/js   adds the right-click menu and shows everyone's rolls
party.html/js        the toolbar panel (party, quick dice, roll log)
sheet.html/js        the character sheet
js/rules.js          the Myr'rodin rules — edit this one for house rules
js/gsheet.js         reads a Google Sheet into a character
js/bestiary.js       turns 5E SRD monsters into Myr'rodin sheets
data/bestiary.json   the 334 SRD creatures
js/dice.js           the dice roller
js/bridge.js         talks to Owlbear
css/style.css        colours and layout (colours are at the top)
css/dice.css         the celestial dice look
dice.html            the click-through layer over the map while dice roll
js/diceanim.js       draws and animates the dice
js/dicepage.js       runs the layer over the map
js/tracker.js        the Combat tab
js/inventory.js      the Inventory tab
js/stash.js          the shared party stash
js/roster.js         the party saved with the room
hud.html, js/hud.js  the click-through turn-order strip
js/combat.js         turn order, joining and rolling
css/tracker.css      the Combat tab's look
css/hud.css          the turn-order strip's look
vendor/obr-sdk.js    Owlbear's official SDK (v3.1.0), bundled
vendor/fflate.js     small unzip library (reads Google's .xlsx download)
characters/          example character (Lyrith Taewen)
```
