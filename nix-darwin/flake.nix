{
  description = "Example nix-darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";

    # Added nix-homebrew input
    nix-homebrew.url = "github:zhaofengli-wip/nix-homebrew";
  };

  outputs = inputs@{ self, nix-darwin, nixpkgs, nix-homebrew }:
  let
    configuration = { pkgs, config, ... }:
    let
      # Single source of truth for the primary user's home directory, used
      # below by launchd.user.agents.heic-watch so its paths stay in sync
      # with system.primaryUser instead of being hardcoded twice.
      homeDir = "/Users/bk";

      # Password strength estimator — the Rust CLI wrapper (u32i64/zxcvbn-cli)
      # around zxcvbn-rs, itself a port of Dropbox's zxcvbn. There is no nixpkgs
      # attribute and no Homebrew formula for it, so it is built here straight
      # from the crates.io release. The binary it installs is named `zxcvbn`,
      # not `zxcvbn-cli`.
      #
      # To bump: change `version`, set both hashes to `pkgs.lib.fakeHash`, and
      # rebuild — nix reports the real values in the hash-mismatch errors (src
      # hash first, then cargoHash).
      zxcvbn-cli = pkgs.rustPlatform.buildRustPackage rec {
        pname = "zxcvbn-cli";
        version = "2.0.3";
        src = pkgs.fetchCrate {
          inherit pname version;
          hash = "sha256-GjQxnHwFL8YMAk3HnuMigD1S42jVqhqcjDIdmU/J6Uw=";
        };
        cargoHash = "sha256-JMRmVMHjpeOGi7DcUxY9n78UdPIY5AQ1/IM1ca20L1E=";
      };
    in {
      nix.enable = false;
      system.primaryUser = "bk";

      # Computer name
      networking.computerName = "Aleph";
      networking.hostName = "aleph";
      networking.localHostName = "aleph";

      # List packages installed in system profile.
      # Note: claude-code is intentionally NOT installed via nix — it's
      # installed globally via `bun install -g @anthropic-ai/claude-code`
      # in the activation script below so we always get the latest release
      # from npm rather than waiting for the nixpkgs version bump.
      environment.systemPackages = [
        pkgs.bun
        pkgs.google-cloud-sdk
        pkgs.imagemagick
        pkgs.mermaid-cli
        pkgs.neovim
        pkgs.nodejs
        pkgs.google-clasp
        pkgs.vim
        zxcvbn-cli
      ];

      # Watches ~/Downloads (e.g. HEIC files dropped in via AirDrop) and
      # converts them to JPG with `sips`. Declared here instead of a raw
      # .plist in ~/Library/LaunchAgents so it's version-controlled and
      # reapplied on every darwin-rebuild switch. See
      # nix-darwin/scripts/convert-heic.sh for the conversion logic.
      launchd.user.agents.heic-watch = {
        serviceConfig = {
          Label = "com.bryan.heicwatch";
          ProgramArguments = [ "${pkgs.bash}/bin/bash" "${./scripts/convert-heic.sh}" "${homeDir}/Downloads" ];
          WatchPaths = [ "${homeDir}/Downloads" ];
          StandardOutPath = "${homeDir}/Library/Logs/heic-watch-stdout.log";
          StandardErrorPath = "${homeDir}/Library/Logs/heic-watch-stderr.log";
          RunAtLoad = true;
        };
      };

      # Runs `agentsview serve` as a persistent background service so the web
      # UI survives logout/reboot without needing a terminal open. Port 58080
      # (not the 8080 default) avoids colliding with common dev-server ports.
      # Bound to 0.0.0.0 + --require-auth so it's also reachable over
      # Tailscale (bearer token lives in ~/.agentsview/config.toml, never
      # committed) — see scripts/agentsview-serve.sh for the port/host/auth
      # setup. --no-update-check skips its self-update ping, and
      # AGENTSVIEW_TELEMETRY_ENABLED=0 disables its PostHog usage-stats ping
      # (see LuLu prompt for agentsview connecting out to posthog/GitHub).
      # KeepAlive restarts it if it crashes; RunAtLoad brings it back on every
      # login, including after a restart.
      launchd.user.agents.agentsview-serve = {
        serviceConfig = {
          Label = "com.bryan.agentsview-serve";
          ProgramArguments = [ "${pkgs.bash}/bin/bash" "${./scripts/agentsview-serve.sh}" ];
          EnvironmentVariables = {
            AGENTSVIEW_TELEMETRY_ENABLED = "0";
          };
          StandardOutPath = "${homeDir}/Library/Logs/agentsview-serve-stdout.log";
          StandardErrorPath = "${homeDir}/Library/Logs/agentsview-serve-stderr.log";
          RunAtLoad = true;
          KeepAlive = true;
        };
      };

      # Second, independent AgentsView job: pushes this Mac's session index
      # into the fleet's shared Postgres (`pg push --watch`), so it
      # shows up alongside every VM's on the fleet dashboard — additive
      # to agentsview-serve above, not a replacement for it. The connection
      # credential is deliberately NOT here (this repo is public); see
      # scripts/agentsview-pg-push.sh for where it comes from and what
      # happens when it is missing. KeepAlive/RunAtLoad match
      # agentsview-serve for the same reason: survive logout/reboot with no
      # terminal open.
      launchd.user.agents.agentsview-pg-push = {
        serviceConfig = {
          Label = "com.bryan.agentsview-pg-push";
          ProgramArguments = [ "${pkgs.bash}/bin/bash" "${./scripts/agentsview-pg-push.sh}" ];
          StandardOutPath = "${homeDir}/Library/Logs/agentsview-pg-push-stdout.log";
          StandardErrorPath = "${homeDir}/Library/Logs/agentsview-pg-push-stderr.log";
          RunAtLoad = true;
          KeepAlive = true;
        };
      };

      # --- HOMEBREW CONFIGURATION START ---
      # This part installs/manages Homebrew itself
      nix-homebrew = {
        enable = true;
        # User owning the Homebrew prefix
        user = "bk";

        # Automatically migrate existing Homebrew installations
        autoMigrate = true;

        # Defaults to true, which writes `eval "$(brew shellenv)"` into
        # /etc/zshrc for every interactive shell. That runs after ~/.zprofile
        # and brew's path_helper moves /opt/homebrew/bin to the front, ahead
        # of ~/.local/bin (the direct herdr install) and ~/.bun/bin (the bun
        # globals). zsh/profile.zsh already sets Homebrew up — with a fallback
        # for the /nix mount race this integration lacks — so one owner, not
        # two.
        enableZshIntegration = false;
      };

      # This part manages the apps installed via Homebrew
      homebrew = {
        enable = true;
        # Uninstalls anything not listed here, so this list is the whole Homebrew
        # surface. "uninstall", not "zap": zap also deletes the cask's user data
        # (preferences, caches, app support), and with autoMigrate = true above
        # anything Homebrew learns about that isn't declared here would lose its
        # data on the next switch — the hand-installed Docker Desktop noted in
        # the casks list is exactly that shape. Undeclared casks still go; their
        # settings survive until someone removes them on purpose.
        onActivation.cleanup = "uninstall";
        taps = [
          "drawthingsai/draw-things"
          "FelixKratz/formulae"
          "nikitabobko/tap"
        ];
        brews = [
          {
            name = "drawthingsai/draw-things/draw-things-cli";
            args = [ "HEAD" ];
          }
          # Manage remote and local VMs
          "ansible"
          # Zsh plugin manager
          "antidote"
          # Window border highlights for active/inactive windows
          "FelixKratz/formulae/borders"
          # Better cat
          "bat"
          # Better top
          "btop"
          # Images in the terminal - Aliases to imgcat
          "chafa"
          "csvlens"
          "duckdb"
          # Disk usage visualization
          "dua-cli"
          "dust"
          # File explorer
          "eza"
          # Terminal file manager
          "fzf"
          # Terminal process manager
          "htop"
          # Go based disk space lookup tool - Fast (installed as `gdu-go` to avoid coreutils conflict)
          "gdu"
          "gh"
          "go"
          # Gmail export utility
          "gyb"
          # Git TUI - Makes single like add/commits easy
          "lazygit"
          # JSON data utility
          "jq"
          # System information
          "fastfetch"
          # Infrastructure as code - open source Terraform fork
          "opentofu"
          # Run a command across multiple ssh sessions
          "pdsh"
          # Sync files to/from cloud storage - used for Google Drive backups
          "rclone"
          # Recursive search
          "ripgrep"
          # Simple terminal
          "starship"
          # Link items in this repo into the home dir
          "stow"
          # Gitea CLI - a formula; the "tea" cask is the unrelated pkgx GUI (ossapp)
          "tea"
          # Puthon to Python
          "thefuck"
          # herdr (agent multiplexer) is deliberately NOT a brew any more. It
          # moved to a direct install in ~/.local/bin (see postActivation
          # below) because herdr's preview update channel is only offered to
          # direct installs — a Homebrew herdr refuses `herdr channel set
          # preview`. Re-adding it here would put a second, stable-only copy
          # on PATH behind ~/.local/bin and confuse `herdr update`.
          # (Tried the herdr-mx fork for its multi-remote single-sidebar view,
          # but its only build predates the upstream cursor-flicker fixes —
          # ogulcancelik/herdr #930/#967 — so reverted to upstream. Re-trial mx
          # once it rebases on >=0.7.3, or when native multi-remote lands: #334.)
          "tmux"
          # Show files in a directory in a tree
          "tree"
          # Download stuff
          "wget"
          # Jump around directories
          "zoxide"
        ];
        casks = [
          "1password"
          "1password-cli"
          "agentsview"
          "alfred"
          "audacity"
          "claude"
          "cursor"
          # Container runtime — NOT managed here. Docker Desktop is installed
          # manually from the official .dmg, so there is no Caskroom entry and
          # brew would install a second copy alongside it. Adding the
          # "docker" cask (now renamed "docker-desktop" upstream) would
          # conflict with the manual install; grab updates from Docker instead.
          # Backup CLI
          "duplicacy-cli"
          "ghostty"
          "google-chrome"
          "keycastr"
          "kitlangton-hex"
          # Open-source firewall (Objective-See)
          "lulu"
          # Finder alternative
          "marta"
          "neovide-app"
          "nikitabobko/tap/aerospace"
          "obsidian"
          "ollama-app"
          "raspberry-pi-imager"
          "shottr"
          "tailscale-app"
          "visual-studio-code"
        ];
      };
      # --- HOMEBREW CONFIGURATION END ---

      # Necessary for using flakes on this system.
      nix.settings.experimental-features = "nix-command flakes";

      # Allow Touch ID for sudo authentication prompts.
      security.pam.services.sudo_local.touchIdAuth = true;

      # macOS system configs
      system.defaults = {
        dock = {
          autohide = true;
          mineffect = "scale";
          persistent-apps = [ ];
        };
        finder.AppleShowAllExtensions = true;
        # Hide all desktop icons so files placed on the Desktop don't clutter it visually.
        finder.CreateDesktop = false;
        NSGlobalDomain.ApplePressAndHoldEnabled = false;

        # Disable the system-wide "Minimize All" shortcut (⌥⌘M). macOS app-menu
        # key equivalents have no "unbind" value, so we reassign the menu item to
        # an unused combo (⌃⌥⇧⌘M) to free up ⌥⌘M. NSUserKeyEquivalents maps the
        # menu item *title* → shortcut, so the key is case-sensitive and must
        # match exactly what macOS shows in the Window menu ("Minimize All" — the
        # alternate item revealed when Option is held). Placed under
        # CustomUserPreferences.NSGlobalDomain so it applies to all applications
        # (System Settings → Keyboard → Keyboard Shortcuts → App Shortcuts, app
        # "All Applications"). Shortcut syntax: @ Cmd, ~ Opt, ^ Ctrl, $ Shift.
        CustomUserPreferences.NSGlobalDomain.NSUserKeyEquivalents = {
          "Minimize All" = "^~$@m";
        };
      };

      # Accessibility: hold Control and scroll to zoom.
      # Spotlight: Cmd+Space → Option+Space (see scripts/spotlight-option-space-hotkey.sh).
      system.activationScripts.postActivation.text = ''
        ln -sf ${pkgs.neovim}/bin/nvim /usr/local/bin/nvim
        /usr/bin/defaults write com.apple.universalaccess closeViewScrollWheelToggle -bool true
        /usr/bin/defaults write com.apple.universalaccess closeViewScrollWheelModifiersInt -int 262144
        ${pkgs.bash}/bin/bash ${./scripts/spotlight-option-space-hotkey.sh}
        # Link this repo's dotfiles into $HOME via GNU Stow. This package list is
        # the canonical source of truth for what gets stowed — docs/STRUCTURE.md
        # describes each package but does NOT re-list the tokens, to avoid drift.
        # All packages are stowed together in one invocation so Stow links into
        # existing ~/.config/<app> paths instead of trying to replace all of
        # ~/.config. `|| echo … >&2` so a pre-existing real file (a stow
        # conflict) doesn't abort activation but does land in the switch log —
        # the earlier `|| true` made a broken stow indistinguishable from a
        # clean one.
        #
        # --no-folding is load-bearing, not a style choice. Without it Stow links
        # a whole directory when the target doesn't exist yet — so ~/.claude/commands,
        # ~/.cursor/skills and ~/.gemini were single symlinks INTO this repo, and
        # every file an app wrote there landed in the working tree of a PUBLIC
        # repo. Only hand-maintained .gitignore rules kept them unpublished, and
        # each new plugin needed a new rule. --no-folding creates real directories
        # and symlinks only leaf files, so an app writing a new file writes it to
        # $HOME, where it belongs. This supersedes the old herdr-only `mkdir -p`
        # guard, which solved the same problem for exactly one package.
        #
        # -R (restow) is required to undo folds that already exist: plain
        # --no-folding leaves an existing directory symlink alone. Restow is
        # idempotent, so it is safe on every activation.
        #
        # bin, nvim and claude were stowed by hand and never declared here, which
        # is how ~/.claude/commands became an unmanaged fold into the repo. The
        # list is only a source of truth if it is complete.
        /usr/bin/sudo -Hu bk ${pkgs.stow}/bin/stow -R --no-folding -v -d /Users/bk/src/dotfiles -t /Users/bk ghostty wezterm karabiner zsh vim git starship aerospace gemini cursor tmux herdr claude nvim bin || echo "postActivation: stow reported a conflict; run it by hand to see which file" >&2
        /usr/bin/sudo -Hu bk ${pkgs.bun}/bin/bun -e "
          const { readFileSync, writeFileSync, mkdirSync } = require('fs');
          const dir = process.env.HOME + '/.claude';
          const file = dir + '/settings.json';
          let cfg = {};
          try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch(_) {}
          cfg.preferredNotifChannel = 'terminal_bell';
          cfg.permissions = cfg.permissions || {};
          // User-level permission mode for Claude Code on this Mac. This is the
          // effective default in every project that does not set its own; this
          // repo's tracked .claude/settings.json pins 'default' for itself
          // because it is the public half of the agent instruction supply
          // chain. Recorded in docs/security-baseline.md (pass 2, accepted).
          // The fleet does not set this — remote/install.sh leaves the mode at
          // Claude Code's own default.
          cfg.permissions.defaultMode = 'auto';
          // Standard plugins enabled on every machine. The official marketplace
          // is registered explicitly (mirrors the cloudflare plugin setup) so a
          // fresh install can resolve the plugin without a prior /plugin install.
          cfg.extraKnownMarketplaces = cfg.extraKnownMarketplaces || {};
          cfg.extraKnownMarketplaces['claude-plugins-official'] = { source: { source: 'github', repo: 'anthropics/claude-plugins-official' } };
          cfg.enabledPlugins = cfg.enabledPlugins || {};
          cfg.enabledPlugins['frontend-design@claude-plugins-official'] = true;
          mkdirSync(dir, { recursive: true });
          writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
        "
        /usr/bin/sudo -Hu bk ${pkgs.bun}/bin/bun ${./scripts/sync-claude-skills.mjs}
        # npm globals via bun, not nix: claude-code, wrangler and vite ship
        # faster than nixpkgs packages them. Each is pinned to an exact version
        # so a rebuild installs code that was chosen, not whatever npm served
        # that minute — the same posture as the bun pin in remote/install.sh.
        # Pinning trades auto-freshness for review, so the pin has to be
        # watched: scripts/audit-pins.mjs reads these lines and reports when
        # one falls behind. Bump here, deliberately. `|| echo … >&2`, not
        # `|| true`, so an offline or failed install shows in the switch log
        # instead of silently leaving the old version in place.
        /usr/bin/sudo -Hu bk env PATH="/Users/bk/.bun/bin:$PATH" ${pkgs.bun}/bin/bun install -g @anthropic-ai/claude-code@2.1.263 || echo "postActivation: claude-code install failed (offline?)" >&2
        /usr/bin/sudo -Hu bk env PATH="/Users/bk/.bun/bin:$PATH" ${pkgs.bun}/bin/bun install -g wrangler@4.129.0 || echo "postActivation: wrangler install failed (offline?)" >&2
        /usr/bin/sudo -Hu bk env PATH="/Users/bk/.bun/bin:$PATH" ${pkgs.bun}/bin/bun install -g vite@8.2.2 || echo "postActivation: vite install failed (offline?)" >&2
        # Impeccable design skills (impeccable.style) for Claude Code, installed
        # into ~/.claude/skills/impeccable — a real directory in $HOME, not this
        # repo, so nothing lands in the public working tree. Goes through a
        # wrapper script (not a bare `bun x impeccable install`) for two
        # reasons: the CLI's own downloader can't follow the redirect chain its
        # bundle URL uses, and — the one that matters — the bundle becomes
        # agent instructions on every switch, so the script pins it to a
        # release tag and verifies the asset's SHA-256 before the CLI unpacks
        # it, and pins the CLI version too. See scripts/impeccable-install.mjs
        # for the pins, the bump procedure and the install flags. Re-running
        # is an update check (no-op when current). audit-pins.mjs watches the
        # skill tag like the npm pins above.
        /usr/bin/sudo -Hu bk env PATH="/Users/bk/.bun/bin:$PATH" ${pkgs.bun}/bin/bun ${./scripts/impeccable-install.mjs} || echo "postActivation: impeccable install failed (offline, or the pinned bundle hash no longer matches)" >&2
        /usr/bin/sudo -Hu bk sh -c 'test -d /Users/bk/.tmux/plugins/tpm || ${pkgs.git}/bin/git clone https://github.com/tmux-plugins/tpm /Users/bk/.tmux/plugins/tpm' || echo "postActivation: tpm clone failed (offline?)" >&2
        # herdr: direct install, bootstrapped once. Homebrew's herdr is
        # stable-only (`herdr channel set preview` refuses it), so the binary
        # lives in ~/.local/bin — ahead of /opt/homebrew/bin on PATH via
        # zsh/profile.zsh — and updates itself from herdr.dev via `herdr
        # update`. Runs only when the binary is absent: a pinned re-download
        # here would fight the self-updater and silently downgrade whatever
        # `herdr update` last installed. The channel itself is config, not
        # install state — herdr/.config/herdr/config.toml carries
        # `[update] channel`. The curl|sh trust decision is recorded in
        # docs/security-baseline.md ("The Mac's herdr bootstrap …").
        /usr/bin/sudo -Hu bk env PATH="/usr/bin:/bin:${pkgs.curl}/bin" sh -c 'test -x /Users/bk/.local/bin/herdr || curl -fsSL https://herdr.dev/install.sh | sh' || echo "postActivation: herdr bootstrap failed (offline?)" >&2
      '';

      # Set Git commit hash for darwin-version.
      system.configurationRevision = self.rev or self.dirtyRev or null;

      # Used for backwards compatibility.
      system.stateVersion = 6;

      # The platform the configuration will be used on.
      nixpkgs.hostPlatform = "aarch64-darwin";
    };
  in
  {
    # Build darwin flake using:
    # $ darwin-rebuild build --flake .#simple
    darwinConfigurations."simple" = nix-darwin.lib.darwinSystem {
      # We must include the nix-homebrew module here
      modules = [
        configuration
        nix-homebrew.darwinModules.nix-homebrew
      ];
    };
  };
}
