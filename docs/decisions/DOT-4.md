### DOT-4 — The AgentsView dashboard binds the Tailscale address, and waits for it

**Decision.** `nix-darwin/scripts/agentsview-serve.sh` starts the dashboard with `--host` set to the Mac's Tailscale IPv4, not `0.0.0.0`, and keeps `--require-auth`. If Tailscale has no address at launch, the script waits up to 30 seconds and then exits non-zero. launchd's `KeepAlive` restarts it until the address exists. It never falls back to `127.0.0.1` or `0.0.0.0`.

**Why.** With `0.0.0.0`, the dashboard listened on every interface. The macOS application firewall is off, so any device on the network the Mac had joined could reach it: the home LAN, or a café's Wi-Fi. The page itself was served to anyone, and the bearer token was the only thing guarding the session data behind it. DOT-9 set the lab's position that what protects a service is who can reach it and how they authenticate. That position needs both halves, and this service had only the second. Binding the tailnet address supplies the first.

**Why no loopback fallback.** The nightly review's suggested fix fell back to `127.0.0.1` when Tailscale was down. Under `KeepAlive`, that process would not exit, so a login that raced Tailscale would leave the dashboard serving only loopback, which nothing uses, until the next crash or login. It would look like a healthy service that nobody could open. Exiting and letting launchd retry means the bind follows Tailscale as soon as it comes up. The cost is that the dashboard is unavailable while Tailscale is down, including on the Mac itself, where the Tailscale URL was already the one to use.

**Why only a dotted IPv4 counts.** The script accepts the `tailscale ip -4` output only if it matches a dotted IPv4 address. Anything else the CLI might print, such as a "stopped" notice, is treated as no address, so it can never become the bind host.

**Checked before the change.** A throwaway instance (empty `HOME`, `--no-sync`, spare port) bound to the Tailscale address listened only on that address. Requests to the Mac's LAN address and to loopback were refused. On the Tailscale address, the page returned 200 and the API returned 401 without the token.

**Not done here.** The macOS application firewall stays off. Turning it on is broader than this service needs, and it would change behaviour for everything else that listens on the Mac.
