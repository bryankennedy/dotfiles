" Tomorrow Night - Chris Kempson (http://chriskempson.com)
" Matches the 'crispy' Ghostty terminal theme palette

set background=dark
hi clear
if exists("syntax_on")
  syntax reset
endif
let g:colors_name = "Tomorrow-Night"

if has("gui_running") || &t_Co == 256
  hi Normal          guifg=#c5c8c6 guibg=#1d1f21 ctermfg=251 ctermbg=234
  hi LineNr          guifg=#969896 guibg=#1d1f21 ctermfg=246 ctermbg=234
  hi CursorLine      guibg=#282a2e               ctermbg=235 cterm=none
  hi CursorLineNr    guifg=#c5c8c6 guibg=#282a2e ctermfg=251 ctermbg=235 cterm=none
  hi ColorColumn     guibg=#282a2e               ctermbg=235
  hi SignColumn      guifg=#969896 guibg=#1d1f21 ctermfg=246 ctermbg=234
  hi VertSplit       guifg=#373b41 guibg=#373b41 ctermfg=237 ctermbg=237 cterm=none
  hi StatusLine      guifg=#c5c8c6 guibg=#373b41 ctermfg=251 ctermbg=237 cterm=none
  hi StatusLineNC    guifg=#969896 guibg=#282a2e ctermfg=246 ctermbg=235 cterm=none

  hi Visual          guibg=#41454b               ctermbg=238
  hi Search          guifg=#1d1f21 guibg=#f0c674 ctermfg=234 ctermbg=221
  hi IncSearch       guifg=#1d1f21 guibg=#f0c674 ctermfg=234 ctermbg=221 cterm=none

  hi Pmenu           guifg=#c5c8c6 guibg=#373b41 ctermfg=251 ctermbg=237
  hi PmenuSel        guifg=#1d1f21 guibg=#81a2be ctermfg=234 ctermbg=110
  hi PmenuSbar       guibg=#282a2e               ctermbg=235
  hi PmenuThumb      guibg=#969896               ctermbg=246

  hi Comment         guifg=#969896               ctermfg=246 cterm=none
  hi Constant        guifg=#cc6666               ctermfg=167
  hi String          guifg=#b5bd68               ctermfg=143
  hi Number          guifg=#de935f               ctermfg=173
  hi Float           guifg=#de935f               ctermfg=173
  hi Identifier      guifg=#cc6666               ctermfg=167 cterm=none
  hi Function        guifg=#81a2be               ctermfg=110
  hi Statement       guifg=#b294bb               ctermfg=139 cterm=none
  hi Keyword         guifg=#b294bb               ctermfg=139 cterm=none
  hi Operator        guifg=#8abeb7               ctermfg=109
  hi PreProc         guifg=#f0c674               ctermfg=221
  hi Include         guifg=#81a2be               ctermfg=110
  hi Type            guifg=#f0c674               ctermfg=221 cterm=none
  hi Special         guifg=#8abeb7               ctermfg=109
  hi SpecialChar     guifg=#de935f               ctermfg=173
  hi Delimiter       guifg=#8abeb7               ctermfg=109
  hi Underlined      guifg=#81a2be               ctermfg=110 cterm=underline
  hi Error           guifg=#1d1f21 guibg=#cc6666 ctermfg=234 ctermbg=167
  hi Todo            guifg=#1d1f21 guibg=#f0c674 ctermfg=234 ctermbg=221

  hi MatchParen      guifg=#f0c674 guibg=NONE    ctermfg=221 ctermbg=none cterm=bold
  hi NonText         guifg=#373b41               ctermfg=237
  hi SpecialKey      guifg=#373b41               ctermfg=237

  hi DiffAdd         guifg=#b5bd68 guibg=#282a2e ctermfg=143 ctermbg=235
  hi DiffChange      guifg=#81a2be guibg=#282a2e ctermfg=110 ctermbg=235
  hi DiffDelete      guifg=#cc6666 guibg=#282a2e ctermfg=167 ctermbg=235
  hi DiffText        guifg=#81a2be guibg=#373b41 ctermfg=110 ctermbg=237 cterm=none

  hi SpellBad        guisp=#cc6666               ctermbg=167 cterm=underline
  hi SpellCap        guisp=#81a2be               ctermbg=110 cterm=underline
  hi SpellRare       guisp=#b294bb               ctermbg=139 cterm=underline
  hi SpellLocal      guisp=#8abeb7               ctermbg=109 cterm=underline

  hi Title           guifg=#81a2be               ctermfg=110 cterm=bold
  hi Directory       guifg=#81a2be               ctermfg=110

  hi gitcommitBranch   guifg=#de935f             ctermfg=173 cterm=bold
  hi gitcommitSelectedFile guifg=#b5bd68         ctermfg=143
  hi gitcommitDiscardedFile guifg=#cc6666        ctermfg=167
  hi gitcommitUntrackedFile guifg=#cc6666        ctermfg=167
else
  hi Normal          ctermfg=none ctermbg=none
endif
