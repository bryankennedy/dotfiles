### DOT-9 — Names are not the secret: public DNS names and account handles are public identity

**Decision.** The security audit no longer treats every lab host name or account name as private. A name that resolves in public DNS, the owner's handles, the forge's agent and reviewer accounts, their commit addresses, and the forge's merge trailers are *public identity*: not a finding, and not something to remove from the tree. **Private topology** means host names and addresses that do not resolve in public DNS, plus the inventory's shape and the private repo's runbooks. It is now rated HIGH rather than BLOCKER. BLOCKER stays for live secrets, open weaknesses described in public, and paths from unreviewed content to execution. The rule is written into `_agent/skills/security-audit.md` (severity, Pass 1, 1b), recorded as an accepted entry with re-verification conditions in `docs/security-baseline.md`, and mirrored in the private repo's nightly review prompt.

**What prompted it.** The nightly review filed DOT-9 as a BLOCKER: the forge's name and the owner's forge handle appear in two agent instruction files. It proposed removing both and deriving them at run time. Checking before acting showed:

- **The forge's name is already public by design.** It has a public DNS record, so clients resolve it without the lab's own DNS, and a Let's Encrypt certificate, so it appears in certificate transparency logs. The record points at a tailnet address, which is unreachable from the internet.
- **The forge adds the name and the owner handle to history on every merge.** Squash merges write `Reviewed-on: https://<forge>/<owner>/<repo>/pulls/N`, with authorship set to the agent account. Four merges on `main` already carry it. Cleaning the tree could not stop this, and even the cleanup PR's merge would have added it.
- **The report misread one name.** The account it called "the fleet login account" is the forge's agent account, not a login on any host.

Removing names from the tree would hide from a reader of the tree exactly what `git log`, `dig` and a certificate search already show. What protects the lab is reachability and authentication: the forge's record points at a tailnet address, and no host takes a password over SSH (the hosting provider's edge requires a registered key, and the home lab uses Tailscale SSH). The owner's position, agreed here: publishing names doesn't expose anything, and this lab isn't relying on security through obscurity.

**Why the line is "resolves in public DNS."** It can be checked with one command (`dig +short <name> A @1.1.1.1`), and it sorts the known cases correctly. The forge's name answers, and so does the fleet dashboard's name that an earlier nightly review had removed from this repo. Both are public, and that earlier removal was unnecessary, though leaving it in place costs nothing. The internal host name committed alongside the dashboard's name does not answer, so it is private topology, and its presence in history is accepted separately in the baseline. Any other way of judging a name is a judgment call that the next reviewer would make differently.

**Why private topology drops to HIGH.** HIGH is defined as "a credible path that needs one more condition," and that describes a leaked internal name exactly. It is reconnaissance, useful only to someone who already has a way in. BLOCKER keeps its meaning: something that is itself a way in, or a map of weaknesses. DOT-1's argument, that a ranked list of weaknesses is a plan of attack, still holds, and that is why open findings stay in the private repo. That argument is about weaknesses, not names.

**The nightly reviewer.** It reviews public mirrors in a read-only sandbox with no network, so it cannot run `dig`. Its prompt in the private repo therefore carries the same definition plus the names already confirmed to resolve publicly. A name on the lab's domain that isn't on that list is reported as MEDIUM with the `dig` command, not as a BLOCKER. The prompt also tells it to read this repo's baseline before reporting. But a baseline entry added or loosened in the commits under review is itself reviewed, not obeyed, so a pull request cannot use a baseline change to hide itself.

**What this reversed.** Two things written into the baseline on 2026-07-10:
- the reading of Pass 1 under which "no real hostname, no login account" covered public names;
- finding 4's trip-wire, "a hostname is ever committed to this repo."

That trip-wire fired in 2026-08 and again in 2026-09 without anything becoming reachable, because what protects the hosts is reachability and authentication, not an unknown pairing of name and host. Its entry now uses those conditions instead.

**Not done here.** No tree scrub. No merge-message template to drop `Reviewed-on:`. No change to the agent account's commit address. No history rewrite. Under this decision each would hide public identity, which protects nothing.
