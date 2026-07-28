# Training somewhere that isn't your computer

Good news: this is about as easy as offloading a job gets. The trainer is plain
Node with **no dependencies, no GPU, no database** — one folder and a Node
install. It is pure CPU work that scales almost linearly with cores, and it
checkpoints every generation, which makes it a perfect fit for the cheapest
computers you can rent.

Measured facts, so you can size things honestly:

| | |
|---|---|
| memory per worker | **~77 MB** (plus ~60 MB for the parent) |
| memory for a 16-core box | **~1.3 GB** — any instance size will do |
| whole project to upload | **under 1 MB** |
| a finished run folder | **~750 KB** |
| what you actually need | **cores.** Nothing else is the bottleneck |

So: rent cores, not RAM. A "compute optimised" instance is exactly right and the
cheap end of the market is fine.

---

## The free option: GitHub Actions

**On a public repository GitHub Actions is free and unmetered.** For a hobby
project this is genuinely the best answer, and it costs nothing.

1. Push this folder to a public GitHub repo.
2. Actions → **Train Lanebreaker AI** → Run workflow.
3. Pick recipes, population, trials and hours. Press go. Close the tab.

The workflow is already written, at `.github/workflows/train-ai.yml`.

What makes it worth using:

- **Every recipe gets its own runner.** Ask for `balanced,brawler,farmer,sieger`
  and four machines train in parallel for the price and wall-clock time of one.
  This is the single cheapest way to run a bakeoff.
- **It resumes.** Progress is cached per recipe, so pressing Run workflow again
  continues from the last generation instead of starting over.
- **It reports.** A table of generations vs win rate appears on the run's page
  when it finishes.
- **You get the brains back** as a downloadable artifact, kept 90 days. Tick
  *commit results* if you'd rather they were committed to the repo permanently.

Limits worth knowing: a job is killed at 6 hours, so the workflow stops itself
cleanly at 5.5 and saves. Run it again to continue. Runners are modest (a few
cores), so this is "leave it running overnight" rather than "results in ten
minutes". Private repos get 2,000 free minutes a month instead of unlimited.

---

## The fast option: rent a machine by the hour

Because the trainer **saves every generation and resumes**, an interruptible
"spot" or "preemptible" instance is nearly ideal — if the provider takes the
machine back you lose at most one generation. Spot is usually 60–70% cheaper
than on-demand, and this is exactly the kind of job it was designed for.

Roughly, as of July 2026:

| what | cores | ~cost/hour | notes |
|---|---|---|---|
| AWS `c7i.4xlarge` **spot** | 16 | **~$0.28** | best value; may be reclaimed, which is fine here |
| AWS `c7i.4xlarge` on-demand | 16 | ~$0.71 | if you'd rather not be interrupted |
| Hetzner CCX (dedicated vCPU) | 16–48 | ~€0.45–1.37 | cheap historically, though prices rose sharply in June 2026 |
| DigitalOcean / Vultr CPU-optimised | 8 | ~$0.22–0.23 | simplest to click through |

**Put that in context.** A serious run — 800 generations at pop 40, trials 12 —
is about 384,000 matches. On 16 cores that is roughly **2–3 hours**, so on spot
it costs **well under a dollar**. Renting 48 cores finishes the same run in about
an hour. This is not an expensive hobby.

### Doing it

```bash
# 1. copy the project up (under a megabyte)
scp -r ai lanebreaker-ai.html root@YOUR.SERVER.IP:~/lanebreaker/

# 2. on the server: install Node, verify everything works
ssh root@YOUR.SERVER.IP
cd lanebreaker && bash ai/remote/setup.sh

# 3. start training, detached — it survives you logging out
bash ai/remote/run.sh start --recipe balanced --pop 40 --trials 12 --gens 100000
```

`setup.sh` installs Node if needed, runs a one-generation smoke test, and tells
you how many workers this machine should use.

Then, whenever you like:

```bash
bash ai/remote/run.sh status    # generations done, fitness, win rate per run
bash ai/remote/run.sh log       # follow the live output
bash ai/remote/run.sh stop      # stop cleanly
bash ai/remote/run.sh pack      # tar up the brains to copy home
```

Bring the results back and use them:

```bash
scp root@YOUR.SERVER.IP:~/lanebreaker-brains-*.tar.gz .
tar -xzf lanebreaker-brains-*.tar.gz -C ai/
node ai/bake.js                 # ladder and champions into the game
```

### Driving it from your own browser

The control panel deliberately listens only on localhost — there is no password
on it, so it should never face the internet. Tunnel to it instead:

```bash
# on the server
bash ai/remote/run.sh panel

# on YOUR machine
ssh -N -L 8787:127.0.0.1:8787 root@YOUR.SERVER.IP
```

Now `http://127.0.0.1:8787` in your browser is the panel — running on the rented
machine, with its cores, showing its runs. Everything works exactly as it does
locally: start runs, edit recipes, watch the log.

---

## Settings for a bigger machine

More cores should mostly buy you **better evidence**, not just more generations.
The failure mode of this trainer is ranking bots on too few matches, so:

1. **Raise `--trials` first.** 12 is a reasonable floor; 20 on a big box.
   This is what stops evolution breeding lucky bots.
2. **Then `--pop`.** 40–80. Bigger populations explore more strategies.
3. `--workers` defaults to cores − 1, which is right. Leave it alone.

```bash
# a 16-core box
bash ai/remote/run.sh start --recipe balanced --pop 40 --trials 12 --gens 100000

# a 48-core box
bash ai/remote/run.sh start --recipe balanced --pop 80 --trials 20 --gens 100000
```

A rough sanity check while it runs: if the per-generation win rate against the
hand-coded bot swings by more than about 20 points between neighbouring
generations, trials are still too low.

---

## One thing to expect

Node's optimiser occasionally crashes on its own under sustained load — I hit it
repeatedly while building this. It is a V8 bug, not a problem with your machine
or the trainer.

That is why `run.sh` starts training through `supervise.js`: it notices the
trainer dying and restarts it from the last saved generation. Over a long
unattended run you may see a few restart messages in the log. Nothing is lost
when that happens, and no action is needed.

---

Sources for the pricing above: [AWS EC2 c7i spot
pricing](https://www.doit.com/compute/spot/us-east-1/c7i.4xlarge), [AWS EC2
on-demand](https://aws.amazon.com/ec2/pricing/on-demand/), [Hetzner 2026 price
changes](https://northflank.com/blog/hetzner-cloud-server-price-increases),
[DigitalOcean droplet
pricing](https://www.digitalocean.com/pricing/droplets), [GitHub Actions free
tier](https://cicdcalculator.com/github-actions-free-tier). Prices move —
check before you spend.
