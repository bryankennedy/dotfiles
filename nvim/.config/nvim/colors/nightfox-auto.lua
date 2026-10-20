-- Dawnfox when 'background' is light, Nightfox when dark. See init.lua.
--
-- Neovim reloads the current colorscheme whenever 'background' changes. Each
-- fox scheme sets 'background' to its own value, so reloading `nightfox` on a
-- switch to light would undo the switch, and Neovim then drops the scheme
-- altogether. This wrapper is what gets reloaded instead, and it picks the fox
-- that agrees with the new value.
--
-- It loads the fox the way the plugin's own colors/dawnfox.vim does, because
-- Neovim ignores a :colorscheme run from inside another colorscheme file.
require('nightfox.config').set_fox(vim.o.background == 'light' and 'dawnfox' or 'nightfox')
require('nightfox').load()
vim.g.colors_name = 'nightfox-auto'
