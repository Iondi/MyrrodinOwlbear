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
js/dice.js           the dice roller
js/bridge.js         talks to Owlbear
css/style.css        colours and layout (colours are at the top)
vendor/obr-sdk.js    Owlbear's official SDK (v3.1.0), bundled
vendor/fflate.js     small unzip library (reads Google's .xlsx download)
characters/          example character (Lyrith Taewen)
```
