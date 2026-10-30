# Myr'rodin System — an Owlbear Rodeo extension

Character sheets for the Myr'rodin homebrew, saved right on each token.

- **Right-click a character token → Create / Open Myr'rodin Sheet**
- Stats, the five proficiency tiers (Inept → Master), the 30 Myr'rodin skills, HP, AC, mana, psi, spells, psionics, weapons with graze, inventory and story notes
- The **Super Awesome Fast Combat Helper**: your turn order as a checklist, with a "New turn" reset
- Click any number to roll it. Everyone in the room sees the roll (tick **Private rolls** to show only you and the GM)
- **Cast** rolls d20 + casting modifier + proficiency against the spell's DC to Cast and takes the mana for you
- The **Myr'rodin** button in the top-left toolbar shows the whole party's HP, mana and psi, a quick dice box and the roll log. The GM gets Damage/Heal buttons for every character.

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

What syncs: name, class, level, XP, ability scores, saves, skill tiers (totals match the Google Sheet exactly), AC, speed, max HP, mana, mana regen, Initiative, Will Check, Spell Save DC, combat helper, features, feats, weapons, spells, psionics, inventory and money.

What stays in Owlbear: current HP, spent mana and psi during play, and combat-helper ticks. If the Google Sheet's own **Current HP** or **Mana Used** changes, that wins.

While the GM has the room open, linked sheets re-sync about once a minute. Anyone who can edit a sheet can also click **Sync now**. The Sheet tab lists anything it couldn't find on the Google Sheet (usually a renamed label).

---

## Combat & initiative

1. GM: open the **Myr'rodin** panel and click **⚔ Start combat**.
2. An **Initiative** window pops up on the right for everyone.
   - Monsters, NPCs, and any sheet without an owner roll their initiative automatically.
   - Each player sees **"Combat is starting! Would you like to join?"** with **Join & roll** for their own character. The roll shows as celestial dice for the whole table.
   - If a player is away, the GM can click **Roll for them**.
3. The order sorts itself: highest first, ties go to the higher Dexterity score.
4. GM clicks **Begin round 1**, then **Done — next** at the end of each turn. The round counter goes up when it wraps. **◀** steps back if you skip someone by mistake.
5. Everyone gets a notification when the turn changes, and the active player sees **"It's your turn"**.

GM extras: click an initiative number to change it, **✕** removes someone, **+ Add new tokens** pulls in sheets placed after combat started, and **End combat** (click twice) closes it for everyone. Players see HP bars for player characters only; the GM sees everyone's.

For a sheet to count as a player's, set its **Owner** on the Sheet tab. Anyone can hide the window with ✕ and bring it back with **Show initiative** in the Myr'rodin panel.

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
tracker.html         the initiative window
js/tracker.js        draws the initiative window
js/combat.js         turn order, joining and rolling
css/tracker.css      the initiative window's look
vendor/obr-sdk.js    Owlbear's official SDK (v3.1.0), bundled
vendor/fflate.js     small unzip library (reads Google's .xlsx download)
characters/          example character (Lyrith Taewen)
```
