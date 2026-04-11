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
      environment.systemPackages = [
        pkgs.bun
        pkgs.claude-code
        pkgs.google-cloud-sdk
        pkgs.imagemagick
        pkgs.mermaid-cli
        pkgs.neovim
        pkgs.nodePackages."@google/clasp"
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
          # Git TUI - Makes single like add/commits easy
          "lazygit"
          # JSON data utility
          "jq"
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
          "cursor"
          "ghostty"
          "google-chrome"
          "keycastr"
          "kitlangton-hex"
          "nikitabobko/tap/aerospace"
          "neovide-app"
          "obsidian"
          "claude"
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
      };

      # Accessibility: hold Control and scroll to zoom.
      # Spotlight: Cmd+Space → Option+Space (see scripts/spotlight-option-space-hotkey.sh).
      system.activationScripts.postActivation.text = ''
        ln -sf ${pkgs.neovim}/bin/nvim /usr/local/bin/nvim
        /usr/bin/defaults write com.apple.universalaccess closeViewScrollWheelToggle -bool true
        /usr/bin/defaults write com.apple.universalaccess closeViewScrollWheelModifiersInt -int 262144
        ${pkgs.bash}/bin/bash ${./scripts/spotlight-option-space-hotkey.sh}
        /usr/bin/sudo -Hu bk ${pkgs.bun}/bin/bun -e "
          const { readFileSync, writeFileSync, mkdirSync } = require('fs');
          const dir = process.env.HOME + '/.claude';
          const file = dir + '/settings.json';
          let cfg = {};
          try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch(_) {}
          cfg.preferredNotifChannel = 'terminal_bell';
          mkdirSync(dir, { recursive: true });
          writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
        "
      '';

      # Set Git commit hash for darwin-version.
      system.configurationRevision = self.rev or self.dirtyRev or null;

      # Used for backwards compatibility.
      system.stateVersion = 6;

      # The platform the configuration will be used on.
      nixpkgs.hostPlatform = "aarch64-darwin";
      nixpkgs.config.allowUnfreePredicate = pkg: builtins.elem (pkgs.lib.getName pkg) [
        "claude-code"
      ];
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
