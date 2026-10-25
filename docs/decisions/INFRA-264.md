### INFRA-264 — The Mac's node comes from nodejs_26 until the nixpkgs alias passes 24.22.1

**Decision.** `nix-darwin/flake.nix` installs `pkgs.nodejs_26` instead of the `pkgs.nodejs` alias. The alias follows Node 24. The same PR moves the flake lock to nixpkgs-unstable of 2026-10-24 and the three bun pins to 1.4.4: `bunVersion` in the flake, `BUN_VERSION` in `.forgejo/ci/install-tools.sh` and `BUN_VERSION` in `remote/install.sh`, each with the digest of the release zip hashed by hand against the release's `SHASUMS256.txt`.

**What prompted it.** The eMudhra/emSign CA incident of October 2026. The Node security releases of 2026-10-20 (22.23.4, 24.22.1, 26.12.1) and Bun 1.4.4 remove emSign ECC Root CA - G3 from their built-in root stores. The fleet work is tracked in the private infrastructure repo under INFRA-264 and its arc.

**Why nodejs_26 and not the alias.** At the locked nixpkgs rev the alias still evaluates to 24.21.0. The bump to 24.22.1 merged into nixpkgs `staging` on 2026-10-21 and had not reached `nixpkgs-unstable` by 2026-10-25. The alias would have left the old store on the Mac for weeks. `nodejs_26` evaluates to 26.12.1 at the same rev, so no override and no source build is needed. Node 26 becomes Active LTS on 2026-10-28, so the Mac moves to the line it would move to anyway.

**Why not nodejs_22 or an override.** 22.23.4 is also in the locked rev, but it is the Maintenance line and a step backward. An `overrideAttrs` of nodejs_24 to 24.22.1 would build Node from source on every switch that changes a dependency, and it would need its own audit to be removed later.

**Residual.** `pkgs.mermaid-cli` and `pkgs.google-clasp` carry their own copy of nixpkgs' nodejs (24.21.0). They are not the `node` on `PATH`. They follow the alias and are fixed by the next flake update after the staging merge.

**Reassess** when `pkgs.nodejs` in nixpkgs-unstable points at Node 26. Then put the alias back so the Mac follows nixpkgs' default line again. A flake update alone does not change the attribute, so this needs a hand edit.
