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
    configuration = { pkgs, config, ... }: {
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
      ];

      # --- HOMEBREW CONFIGURATION START ---
      # This part installs/manages Homebrew itself
      nix-homebrew = {
        enable = true;
        # User owning the Homebrew prefix
        user = "bk";

        # Automatically migrate existing Homebrew installations
        autoMigrate = true;
      };

      # This part manages the apps installed via Homebrew
      homebrew = {
        enable = true;
        onActivation.cleanup = "zap"; # Uninstalls anything not listed here
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
          # Images in the terminal - Aliases to imgcat
          "chafa"
          "csvlens"
          "duckdb"
          "eza"
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
          # Run a command across multiple ssh sessions
          "pdsh"
          # Recursive search
          "ripgrep"
          # Simple terminal
          "starship"
          # Link items in this repo into the home dir
          "stow"
          # Puthon to Python
          "thefuck"
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
          "alfred"
          "audacity"
          "claude"
          "cursor"
          "ghostty"
          "google-chrome"
          "keycastr"
          "kitlangton-hex"
          # Finder alternative
          "marta"
          "neovide-app"
          "nikitabobko/tap/aerospace"
          "obsidian"
          "ollama-app"
          "shottr"
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
        # ~/.config. Idempotent: re-stowing existing symlinks is a no-op. `|| true`
        # so a pre-existing real file (a stow conflict) doesn't abort activation.
        /usr/bin/sudo -Hu bk ${pkgs.stow}/bin/stow -v -d /Users/bk/src/dotfiles -t /Users/bk ghostty wezterm karabiner zsh vim git starship aerospace gemini cursor tmux || true
        /usr/bin/sudo -Hu bk ${pkgs.bun}/bin/bun -e "
          const { readFileSync, writeFileSync, mkdirSync } = require('fs');
          const dir = process.env.HOME + '/.claude';
          const file = dir + '/settings.json';
          let cfg = {};
          try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch(_) {}
          cfg.preferredNotifChannel = 'terminal_bell';
          cfg.permissions = cfg.permissions || {};
          cfg.permissions.defaultMode = 'auto';
          mkdirSync(dir, { recursive: true });
          writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
        "
        /usr/bin/sudo -Hu bk ${pkgs.bun}/bin/bun ${./scripts/sync-claude-skills.mjs}
        /usr/bin/sudo -Hu bk env PATH="/Users/bk/.bun/bin:$PATH" ${pkgs.bun}/bin/bun install -g @anthropic-ai/claude-code || true
        # Cloudflare Workers CLI. Like claude-code, installed via bun global
        # (not nix) so we always get the latest npm release — wrangler ships
        # frequent updates and lags in nixpkgs.
        /usr/bin/sudo -Hu bk env PATH="/Users/bk/.bun/bin:$PATH" ${pkgs.bun}/bin/bun install -g wrangler || true
        # Frontend build tool / dev server. bun global (not nix) for the latest
        # npm release.
        /usr/bin/sudo -Hu bk env PATH="/Users/bk/.bun/bin:$PATH" ${pkgs.bun}/bin/bun install -g vite || true
        /usr/bin/sudo -Hu bk sh -c 'test -d /Users/bk/.tmux/plugins/tpm || ${pkgs.git}/bin/git clone https://github.com/tmux-plugins/tpm /Users/bk/.tmux/plugins/tpm' || true
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
