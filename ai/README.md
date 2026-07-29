# A self-learning AI for Lanebreaker

You said you don't know anything about neural networks. You don't need to. This
document assumes exactly that, and by the end of it you'll have trained one.

---

## Start here — the control panel

Double-click **`Open AI panel.cmd`** (or run `node ai/panel.js`).

It opens a page at `http://127.0.0.1:8787` where you can do everything without
remembering a single flag:

- **Train** — pick a recipe, set population/trials/budget with the estimated
  match count updating as you type, press Start.
- **Experiments** — set up a bakeoff, a sweep or a ladder from dropdowns.
- **Recipes** — every fitness weight as a labelled slider, with a one-line
  explanation of what each one does. Save, duplicate, delete.
- **Runs & results** — every trained run with its generation count, win rate
  against your bot and a sparkline of its progress. Continue one, fight two
  against each other, or bake the champions into the game.
- A live console at the bottom with a progress bar, an ETA and a Stop button.

Every panel shows you the exact command it is about to run, so you can copy it
into a terminal whenever you'd rather. The panel is only a front end — it starts
the same scripts, and runs started either way are interchangeable.

It binds to `127.0.0.1` only, and nothing typed into the page reaches a shell:
each command is assembled from a fixed list of flags with every value checked
against a known list or coerced to a number first.

### Or from a terminal

```bash
# From the repo root (so dist-sim is available):
npm run build:sim

cd ai
node train.js            # bots play thousands of matches; the winners breed
node versus.js           # see whether the trained bot beats your old one
node lab.js bakeoff      # train every recipe, then make them fight
cd ..
npm run bake:brains      # refresh the browser game's baked.json
```

Then run `npm run dev` at the repo root, pick an opponent from the dropdown next to
**Practice 1v1**, and play against something that taught itself the game. There's
also a **Train AI** button on the game's menu that runs a smaller version of the
same evolution in the browser with a live graph, if you'd rather watch than read.

---

## What "learning" actually means here

Your old bot is about 120 lines of rules you wrote:

```js
if (hpPct < .38) retreat();
if (aggressive && Math.random() < .35) castSomething();
```

Every number in there is a decision *you* made. The bot can never be better than
your guesses, and it can never surprise you.

The new bot replaces those rules with a **neural network**, which is a much less
mysterious thing than the name suggests. It's a pile of about a thousand numbers
("weights") and a fixed recipe for using them:

```
44 numbers describing the situation      (my HP, enemy HP, where the wave is,
   ↓                                      is a last hit available, is my ult up,
multiply by weights, squash, repeat       who is currently attacking me, …)
   ↓
12 numbers describing what to do          (8 "moods" + should I press Q/W/E/R)
```

The highest of the first 8 outputs wins and becomes the bot's current mood:

| Mood | What it does |
|---|---|
| `FARM` | hold the creep line and take last hits |
| `PUSH` | attack-move up the lane |
| `HARASS` | poke the enemy hero while holding your own attack range |
| `ALL_IN` | commit to the kill |
| `RETREAT` | get out |
| `DENY` | kill your own creeps to starve them of gold and XP |
| `SIEGE` | hit the tower |
| `REPOSITION` | tuck in behind your wave |

**Nobody writes those thousand weights.** That's the whole point. `train.js`
makes 20–60 bots with completely random weights, has them all play the same
matches, keeps the ones that scored best, breeds slightly-mutated copies of the
survivors, and repeats. Generation by generation, the random noise turns into
something that plays.

That's a **genetic algorithm**. There is no calculus in it, no backpropagation,
no training data. Just "did you do well — yes or no", a few hundred thousand
times. It works here because a match simulates about 700× faster than real time,
so "a few hundred thousand times" is an afternoon rather than a career.

### What the network is deliberately *not* allowed to decide

Some things stay as ordinary code, on purpose:

- **the mechanics of landing a last hit** — timing a swing is execution, not
  judgement, and making the net rediscover it wastes generations
- **where an ability is aimed** — the net decides *whether* to cast, code decides
  *where* (including leading a moving target, and pointing escape blinks
  backwards rather than into the enemy)
- **walking**

This split is why this trains in minutes instead of weeks. The network spends
all of its capacity on the interesting question — *what should I be doing right
now?* — instead of relearning arithmetic.

### What it can see about danger

Four of the 44 inputs are about who is currently trying to kill it. They matter
more than their number suggests, because everything else in the input list
describes the *world* while these describe *the next second of your life*:

| Input | Reads |
|---|---|
| `creepsOnMe` | how many enemy creeps have locked onto me (`o.tid`), ÷4 |
| `towerOnMe` | the enemy tower has picked me as its target |
| `heroSwingingAtMe` | their hero is mid-wind-up on me (`wTid` + `windT`) |
| `incomingDmg` | damage already in flight at me, as a fraction of my current HP |

All of this was already in your engine; it just wasn't being read. Before these
existed the bot could only notice danger *after* its health dropped — a tenth of
a second too late to act on. Creep aggro and tower aggro in particular are what
decide whether stepping up for a last hit is free or fatal, and they were
invisible in every other input.

Sampled across a real match, they fire often enough to be useful and rarely
enough to mean something: creep aggro 15% of the time, tower aggro 6.6%, enemy
mid-swing 4.4%, incoming damage 13.7%.

**Adding senses invalidates old brains.** A brain is only a list of numbers and
has no idea what those numbers were measuring, so feeding an old one new senses
produces confident nonsense rather than an error. Brains are therefore stamped
with a format version; anything older is refused with a clear message instead of
being quietly misused, and `bake.js` skips stale folders rather than failing.

### What else evolves

Besides the network, each bot carries two small sets of preferences:

- `skillPri` — 4 numbers ranking Q/W/E/R, which decides its level-up order
- `itemPri` — one number per item, which decides its shopping list

Nobody tells it that boots are good. It works that out, because bots that bought
boots won more often. These 36 numbers punch well above their weight.

---

## Recipes: deciding what "good" means

This is the most important part of the whole project, and the part worth playing
with. **The bot learns exactly what you pay it for, and nothing else.**

A recipe is a table of wages, in `recipes.json`:

```jsonc
"brawler": {
  "desc": "Wants your blood.",
  "weights": {
    "win": 120, "kill": 45, "death": -8,
    "cs": 0.2,                 // last hits barely count
    "dmgHero": 0.045,          // damage to the enemy hero pays well
    "aggression": 25,          // reward standing far up the lane
    "passivity": -40           // fine it for farming and retreating
  }
}
```

Six recipes ship with this:

| Recipe | What it breeds |
|---|---|
| `balanced` | a well-rounded laner — **start here** |
| `farmer` | greedy economist; out-levels you, avoids fights it doesn't need |
| `brawler` | trades constantly, dives towers, ignores the wave |
| `sieger` | doesn't care about you at all — shoves the wave and takes the tower |
| `survivor` | allergic to dying; punishing to kill, grinds you out |
| `purewin` | paid for winning and nothing else — the purest signal, and the slowest to learn |

Copy a block, rename it, change the numbers, and train it:

```bash
node train.js --recipe myrecipe
```

Each recipe gets its own folder in `brains/`, so schools never overwrite each
other. Then make them fight:

```bash
node versus.js --a brawler --b farmer
node versus.js --all              # round robin, everyone including the old bot
```

This is the fun part and it's genuinely informative — you find out whether the
greedy farmer actually beats the thug, or just looks better on paper.

**A warning worth taking seriously:** fitness functions are wish-granting
monkey's paws. Pay only for last hits and you'll breed a bot that farms serenely
while losing the tower. Pay only for kills and it dives at level 2 forever. If a
trained bot does something absurd, the recipe is usually the culprit, not the
network. That's what `passivity` is doing in most of these recipes — without a
fine for standing around, a surprising number of runs discover that the safest
way to not lose is to never do anything.

---

## Running a real training session

```bash
node train.js --recipe balanced --gens 300 --pop 60 --trials 8
```

| Option | Default | What it does |
|---|---|---|
| `--recipe` | `balanced` | which wages to use |
| `--gens` | 60 | how many generations |
| `--pop` | 60 | bots per generation — bigger explores more, costs more |
| `--trials` | 8 | matches each bot plays per generation. Low = fast but noisy |
| `--workers` | cores−1 | parallel processes |
| `--maxtime` | 420 | give up on a match after this many game-seconds |
| `--hero` | random | e.g. `--hero vex` to train a specialist |
| `--mode` | `1v1` | or `2v2` |
| `--budget` | — | train for N **matches** instead of N generations |
| `--fresh` | — | start over (the old run is archived, never deleted) |
| `--maxseconds` | 0 | stop cleanly after N seconds of wall clock |

### Running the same command twice

**It continues.** Run it again and it picks up from the last completed
generation, because that is almost always what you want:

```
CONTINUING an existing run from generation 63   (use --fresh to start over)
```

To start over, add `--fresh`. Your previous run is *moved* to
`brains/_archive/<recipe>-<timestamp>/`, never overwritten — so you can always
go back and fight an old champion:

```bash
node versus.js --a brains/_archive/balanced-2026-07-28T18-16-18 --b balanced
```

If the run has already passed the generation count you asked for, it says so and
exits rather than doing nothing slowly. Raise `--gens` or `--budget` to continue.

*(This used to start fresh and silently overwrite the previous run's
checkpoints. It doesn't any more.)*

For anything you plan to leave running, use the supervisor — it restarts the
trainer from the last saved generation if it ever dies:

```bash
node supervise.js --recipe balanced --gens 500 --pop 60
```

### Reading the output

```
gen  42 | fit    684 (avg    412) | beats old bot  71% | cs  38 k/d 2.3/1.1 | 9.4s
```

- **fit** — best bot's score this generation. Only comparable *within one
  recipe*; different recipes are different currencies.
- **avg** — the whole population's average. When this closes on the best, the
  population has converged and progress will slow.
- **beats old bot** — the honest number. This is the fraction of matches the best
  bot won against your original hand-coded bot. **This is the one to watch.**
- **cs, k/d** — last hits and kills/deaths per match, so you can see *how* it's
  winning.

Progress is never a smooth line. Fitness moves in staircases, with long flat
stretches while the population is stuck and sudden jumps when something clicks.
Flat for ten generations is normal. Flat for a hundred means your recipe probably
isn't rewarding whatever it needs to learn next.

---

## The lab — experiments you can leave running

`lab.js` is the point of the whole thing: ask "what if I paid for *this*
instead?", go and do something else, come back to a report.

Every command takes `--budget` in **matches**, which is the unit that actually
costs you time, and writes its results to `ai/lab/<name>/`. Re-running the same
`--name` continues rather than restarting.

### bakeoff — train every recipe, then make them fight

```bash
node lab.js bakeoff --budget 10000
```

Trains every recipe in `recipes.json` on 10,000 matches each, then round-robins
the champions against each other *and* against your hand-coded bot. Prints a
leaderboard with each school's playing style and writes `report.md`.

### bakeoff with elimination and cross-breeding

```bash
node lab.js bakeoff --budget 10000 --rounds 3 --keep 4
```

This is the one you described. After each round the bottom schools are dropped,
and — the interesting part — the survivors are **cross-bred**: each surviving
school's next population is seeded with the champions of *every other survivor*,
then mutated. Schools stop evolving in isolation and start stealing each other's
tricks, while each still being paid by its own recipe. A `sieger` that inherited
a `brawler`'s champion is a genuinely different animal.

### sweep — what does one number actually do?

```bash
node lab.js sweep --recipe brawler --weight killDiff --values 10,30,70,150
```

Takes one recipe, varies exactly one weight, trains each variant on the same
budget, and fights them. The most direct way to build intuition about the
weights, and the closest thing here to a controlled experiment. Your
`recipes.json` is never modified — the variants live in a throwaway file inside
the experiment folder.

### ladder — measured strength across a training run

```bash
node lab.js ladder --recipe balanced --rungs 6
```

Takes checkpoints spread across a finished run and makes them all fight each
other. Fitness is a proxy that can drift; this is the honest version of the
learning curve. On the run shipped here it reads:

```
 1. hand-coded bot     93%
 2. balanced/gen0060   77%
 3. balanced/gen0040   43%
 4. balanced/gen0010   40%
 5. balanced/gen0020   40%
 6. balanced/gen0000    7%
```

Later checkpoints beating earlier ones is what "it is learning" looks like when
you measure it instead of trusting the fitness number. If they aren't, training
has stalled — usually too few `--trials`.

**Useful options for all of them:** `--games` (per pairing in the round robin,
default 24), `--pop`, `--trials`, `--workers`, `--recipes a,b,c`, `--mode 2v2`,
`--name`, `--fresh`, `--nobot true` to leave the hand-coded bot out.

---

## Set `--trials` higher than you think

The single most useful setting, and the one I got wrong.

Each generation the trainer's log reported the best bot beating the hand-coded
bot **50–67%** of the time. Measured properly over 40 games, the same brain won
**15%**. Nothing was broken — the trainer was ranking bots on 4 matches each, of
which only 2 were against the hand-coded bot. On that little evidence you are
mostly measuring luck, so evolution promotes lucky bots, and the reported number
is the luck rather than the skill.

Now that a match ends at 2 kills it runs roughly three times shorter than before,
so trials are about three times cheaper. Spend that on `--trials`, not on `--pop`:

```bash
node train.js --recipe balanced --gens 400 --pop 40 --trials 12
```

Rule of thumb: if the per-generation win rate jumps around by more than about 20
points between neighbouring generations, your trials are too low to rank anything
and you are breeding luck.

---

## Where the shipped brains actually stand

The brains in `brains/balanced` are **63 generations** of real training. Measured
over 40 full-length games against the hand-coded bot:

```
hand-coded bot   27W    68%
balanced         13W    33%
```

Not there yet, but the trend across the run is unambiguous:

| generations | mean win% vs the old bot |
|---|---|
| 0–14 | 17% |
| 15–29 | 31% |
| 30–44 | 60% |
| 45–62 | 68% |

(The per-generation figure is measured on a handful of matches and reads high;
the 40-game number above is the honest one. Both are climbing.)

It has also developed a real identity rather than a copy of the old bot: **380
tower damage per match against the hand-coded bot's 47**, and more last hits
(17.9 vs 15.9). It wins by taking the tower. What still loses it games is dying —
1.4 deaths per match against 0.3 — which under a 2-kill win condition is most of
the story. `survivor`, or a `balanced` variant with a heavier `death` penalty, is
the obvious next experiment.

Keep going with the same command; it continues automatically.

---

## Two mistakes I made, in case you make them too

Both cost me real training time and both are the classic ones, so they're worth
knowing about.

**1. I capped matches early to save time, and left the capped ones as draws.**
The `win` reward was then almost never paid, so the bots trained for thousands of
matches with no idea that winning was the point. Fitness still climbed —
beautifully — because it was optimising the leftover terms. A rising fitness
curve tells you the bot is getting better *at the thing you asked for*, which is
not necessarily the thing you wanted. Capped matches are now decided the way the
game decides one that runs out of clock.

**2. I paid for totals instead of differences.** With a short cap, "farm safely
and be ahead on net worth at the whistle" was a genuinely winning strategy, so
evolution found it — the best bot spent 95% of its time in `REPOSITION`, hiding
behind its own creeps. It wasn't broken. It was doing exactly what I paid for.
The recipes now use `csDiff`, `killDiff`, `goldDiff` and friends, which reward
out-farming your opponent rather than farming, and the behaviour went away.

If a trained bot ever does something that looks insane, assume the recipe is
rational before you assume the network is broken. It usually is.

---

## Difficulty levels come free

`train.js` saves a snapshot every few generations. `bake.js` picks four of them
and wires them in as difficulty tiers:

| Tier | Where it comes from |
|---|---|
| Classic | your original hand-coded bot, untouched — still the hardest |
| Rookie | ~10% of the way through training, plus some hesitation |
| Steady | ~40% |
| Sharp | ~75% |
| Brutal | the best brain from the whole run |

These aren't handicapped versions of one bot — they're genuinely what the AI
*was* at that point in its life. Rookie is bad in the specific, interesting ways
a half-trained network is bad. The lower two tiers also get a little hesitation
mixed in, so they feel like a weaker player rather than a broken one.

With the lightly-trained brains that ship here, the ladder tops out below
Classic. Train longer, run `node bake.js` again, and the tiers re-point at your
new checkpoints automatically — the ladder rises with the training.

Every trained school also shows up in the dropdown by name, so `brawler` and
`farmer` become selectable opponents in their own right.

---

## The files

| File | What it is |
|---|---|
| `panel.js` + `panel.html` | **the control panel** — start here |
| `remote/` | [training on a rented machine or on GitHub's, for free](remote/README.md) |
| `brain.js` | **the AI.** Senses, network, action decoding, fitness. Read this one. |
| `train.js` | the evolution loop, parallelised across cores |
| `lab.js` | **the playground** — bakeoffs, sweeps, ladders |
| `supervise.js` | restarts `train.js` if it dies during a long run |
| `arena.js` | plays one headless match and reports the statistics |
| `engine.js` | loads the modular sim from `../dist-sim` (run `npm run build:sim` at repo root first) |
| `compete.js` | fair fixtures and round robins, shared by `versus.js` and `lab.js` |
| `versus.js` | puts two schools in a room and reports who wins |
| `bake.js` | optional: patch an old HTML game file **and** write `src/ai/neural/brains/baked.json` |
| `recipes.json` | the wage tables — **the knob to turn** (also used by the in-browser TRAIN UI) |
| `inject/` | leftover HTML inject snippets for `bake.js` if you still have an HTML game file |
| `brains/` | training output: `best.json`, checkpoints, and resumable state |

### How `engine.js` stays in sync with the game

It loads `dist-sim/index.cjs` — a CommonJS bundle of the same TypeScript sim the
browser uses. There is exactly one ruleset.

```bash
npm run build:sim    # from the repo root, after any src/sim or data change
```

GitHub Actions run that step automatically before training. Locally you must run
it yourself (or training will fail with a clear “build dist-sim” error).

`npm run bake:brains` (repo root) refreshes the Vite game’s baked brains without
touching HTML. `node ai/bake.js` is only needed if you still maintain a
standalone `.html` build alongside this project.

---

## Game rules

The win condition is now **first to 2 kills** in 1v1 (so two deaths and you have
lost) and **4 team kills** in 2v2 — or destroy the enemy tower, which wins
outright at any score. Set in one place:

```js
const KILLS_TO_WIN = 2;        // 1v1
const KILLS_TO_WIN_2V2 = 4;
```

The HUD and end screen read the value off the match, so those follow
automatically; only the two help-text blurbs needed editing.

Side benefit for training: bot-vs-bot matches dropped from ~380s to ~231s and now
always end on kills rather than the clock, so every generation is both cheaper
and more decisive.

---

## A bug your game had

While training, bots kept crashing the simulator with a stack overflow inside
`damage()`. It turned out to be real, and not an AI problem at all:

**Reflected damage could itself reflect.** If two heroes both had a reflecting
shield up at the same time — two Vexes with Riposte, most obviously — damage
bounced between them forever until the call stack blew up and the tab died.

It went unnoticed because it needs both players to hold Riposte simultaneously,
which is rare in a normal game. The trainer found it within minutes because it
deliberately plays mirror matchups, so Vex-vs-Vex with both shields up comes up
constantly.

`bake.js` fixes it: damage that is already a reflection no longer reflects again.
One bounce, as the ability text intends.

This is a nice side effect of the whole exercise. A trainer that plays tens of
thousands of matches is also the most patient QA department you will ever have.

---

## Where to go next

Ideas in rough order of value-for-effort:

1. **Train longer.** The single biggest lever. Hundreds of generations with
   `--pop 80` is a different animal from the defaults.
2. **Write your own recipes.** Cheap, fast, and where the personality lives.
3. **Specialists.** `--hero vex` trains a brain that only ever plays Vex and can
   overfit to it happily. Bake several and let the dropdown pick per hero.
4. **More senses.** Adding an input to `features()` in `brain.js` is easy — enemy
   cooldowns, whether their ult is up, how much gold they're carrying. Bump
   `N_IN` to match and retrain. More senses beats a bigger network almost every
   time.
5. **2v2.** `--mode 2v2` already works, but nothing in the inputs describes your
   ally. Adding two or three features about them would give you coordination.
6. **Then, if you're still curious, deep RL.** Once you're comfortable with all
   of the above, PPO on this same simulator is a reasonable next project — and
   you'll have the headless harness, the reward function and a strong baseline to
   beat already built, which is most of the work.
