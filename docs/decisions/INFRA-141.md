### INFRA-141 — Internal host names are LOW hygiene, not private topology

**Decision.** A host name with no public DNS record is no longer private topology. When one is newly added to a public tree, a commit message or a PR body, it is a **LOW** hygiene finding. A name with a statement of what that host runs is **HIGH** in a public repository, for the reason under "Map count" below. It is not a secret, but public text should still avoid it: write "a nightly job", not the host that runs it. A name already in published history is accepted and not re-reported, and no history is rewritten for one.

**Private topology** stays HIGH. It now means:
- addresses (LAN and tailnet IPs);
- how the network is laid out;
- a map of the fleet, meaning several hosts each paired with what they run;
- which host holds credentials or secrets;
- the private repo's runbooks.

Names that resolve in public DNS stay public identity, as DOT-9 decided. The public DNS answer (`dig +short <name> A @1.1.1.1`) still separates them from the LOW.

**Map count.** The record is everything public across the owner's public repositories: each tree, every commit and merge message on every ref, and pairs already accepted in the baseline. Two or more pairs added in the same change are a map in themselves: HIGH, whatever the record holds. For a single new pair, count the *other* internal hosts the record already pairs with a role. None: LOW. One: MEDIUM, because the new pair starts a map. Two or more: HIGH, because with the new pair the record is a map of three or more hosts, which is private topology whether it arrived in one change or one pair at a time. The public record already pairs three internal hosts with roles, so a new pair in any public repository is HIGH. Accepted pairs stay accepted; they count toward the map, but they are not re-reported. Published history cannot shrink, so the count never falls below three. That is why the rule text says only "a name with its role is HIGH": the ladder is the reasoning, and no review has to recount the record across repositories.

**LOW is conditional.** It holds only while no host is reachable from off the tailnet except through the hosting provider's key-only SSH edge, and no host accepts SSH that asks for a secret. The audit re-verifies both on every run, across every inventory host, including any host added since the last run. If either fails, internal host names and roles are HIGH until it is fixed. A PR review cannot run these checks, so it rates the text as written and leaves the conditions to the audit. A change that itself opens such a path is rated on its own as an open weakness, whatever it names. Examples are a port forward, a Funnel, a service bound off its tailnet address, or password SSH.

This lowers DOT-9's rating for a bare non-public name from HIGH to LOW. A name with its role stays HIGH, so DOT-17 still stands: the flake says what the Mac runs, and the Mac's name there would be a name with its role.

**Why.** The owner decided on 2026-09-25 that the existence of a host is not a secret. The lab is kept safe by who can reach it and how they authenticate, not by nobody knowing its names. Rating a bare name HIGH meant the reviews kept asking for history rewrites that protect nothing. The owner still wants to avoid naming hosts from now on, so detection stays at LOW.

**What prompted it.** A nightly review rated a merge message HIGH, in this repository and in another public one. The message named the host that runs the review kit's nightly drift check. It came from the sync tool's PR-body template. The template is changed in the private repo to say "a nightly drift check", and the two existing messages are accepted.

**History.** The rule was refined over several review rounds; the pull request threads on dotfiles #61 to #66 hold them.

**Authority.** An agent wrote this file, so it authorizes nothing by itself and is not evidence of the owner's decision. The evidence is the owner's own comment or approval on the pull request that adds it, and the merge that CODEOWNERS requires. CODEOWNERS requires that sign-off for everything this change touches.

**Where it is written.** `_agent/skills/security-audit.md` (severity, Pass 1, 1b classification), `CLAUDE.md` ("Flag hard"), and `docs/security-baseline.md`. In the baseline, the "Not covered" line changes, and the two host-name-in-history entries are re-checked: both pair a host with its role, so both stay HIGH and stay accepted. The private repo's nightly review prompt carries the same rule.
