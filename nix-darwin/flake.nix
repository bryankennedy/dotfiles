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
        pkgs.vim
        pkgs.bun
        pkgs.nodePackages."@google/clasp"
      ];

      # --- HOMEBREW CONFIGURATION START ---
      # This part installs/manages Homebrew itself
      nix-homebrew = {
        enable = true;
        # User owning the Homebrew prefix
        user = "bk"; # TODO: Change this to your macOS username!

        # Automatically migrate existing Homebrew installations
        autoMigrate = true;
      };

      # This part manages the apps installed via Homebrew
      homebrew = {
        enable = true;
        onActivation.cleanup = "zap"; # Uninstalls anything not listed here
        taps = [
          "nikitabobko/tap"
        ];
        brews = [
          "antidote"
          "duckdb"
          "eza"
          "htop"
          # JSON data utility
          "jq"
          "ripgrep"
          # Simple terminal
          "starship"
          # Link items in this repo into the home dir
          "stow"
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
          "kitlangton-hex"
          "nikitabobko/tap/aerospace"
          "obsidian"
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
      };

      # Accessibility: hold Control and scroll to zoom.
      # Spotlight: Cmd+Space → Option+Space (see scripts/spotlight-option-space-hotkey.sh).
      system.activationScripts.postActivation.text = ''
        /usr/bin/defaults write com.apple.universalaccess closeViewScrollWheelToggle -bool true
        /usr/bin/defaults write com.apple.universalaccess closeViewScrollWheelModifiersInt -int 262144
        ${pkgs.bash}/bin/bash ${./scripts/spotlight-option-space-hotkey.sh}
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
