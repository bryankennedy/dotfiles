local wezterm = require 'wezterm'
local config = wezterm.config_builder()

-- Shell
config.default_prog = { '/bin/zsh' }

-- Font
config.font = wezterm.font_with_fallback {
  'Monaco',
  'Hack Nerd Font Mono', -- Fallback for symbols not in Monaco
  'Apple Color Emoji',   -- Fallback for standard macOS Emojis
}
config.font_size = 15.0
config.freetype_load_target = "HorizontalLcd"
config.freetype_render_target = "HorizontalLcd"

-- Appearance
config.window_padding = {
  left = 10,
  right = 10,
  top = 10,
  bottom = 10,
}
config.window_background_opacity = 0.96
config.default_cursor_style = 'SteadyBlock'
config.window_decorations = "RESIZE" -- Minimal titlebar

-- "Crispy" Theme Colors
config.colors = {
  foreground = '#c5c8c6',
  background = '#1d1f21',
  cursor_bg = '#ffffff',
  cursor_border = '#ffffff',
  cursor_fg = '#1d1f21',
  selection_bg = '#41454b',
  selection_fg = '#c5c8c6',

  ansi = {
    '#1d1f21', -- 0 Black
    '#cc6666', -- 1 Red
    '#b5bd68', -- 2 Green
    '#f0c674', -- 3 Yellow
    '#81a2be', -- 4 Blue
    '#b294bb', -- 5 Purple
    '#8abeb7', -- 6 Cyan
    '#c5c8c6', -- 7 White
  },
  brights = {
    '#969896', -- 8 Bright Black
    '#cc6666', -- 9 Bright Red
    '#b5bd68', -- 10 Bright Green
    '#f0c674', -- 11 Bright Yellow
    '#81a2be', -- 12 Bright Blue
    '#b294bb', -- 13 Bright Purple
    '#8abeb7', -- 14 Bright Cyan
    '#ffffff', -- 15 Bright White
  },
}

return config
