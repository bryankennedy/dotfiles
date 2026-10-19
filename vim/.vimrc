" Minimal Vim Config

" Basics
set nocompatible              " Use Vim defaults instead of Vi
set encoding=utf-8
set mouse=a                   " Enable mouse support

" Clipboard — a yank reaches the Mac's clipboard, even from a VM over SSH
"
" A VM has no pasteboard of its own, so the only way out is OSC 52: print the
" yanked text to the terminal as an escape sequence and let the terminal put it
" on the clipboard. Ghostty allows that out of the box (clipboard-write =
" allow), and herdr, which sits between Ghostty and every pane, forwards it.
"
" Only yanks travel, and only to the unnamed, + and * registers — a delete or a
" yank into "a leaves the Mac's clipboard alone. Pasting back is deliberately
" not wired up: it needs an OSC 52 *read*, which Ghostty prompts for
" (clipboard-read = ask) and which blocks the editor until the terminal answers.
" Cmd-V still pastes, because it arrives as keystrokes.
"
" Local Vim is left alone: it talks to the pasteboard directly (+clipboard).
if !empty($SSH_TTY) || !empty($SSH_CONNECTION)
  function! s:Osc52Yank() abort
    if get(v:event, 'operator', '') !=# 'y'
      return
    endif
    let l:reg = get(v:event, 'regname', '')
    if l:reg !=# '' && l:reg !=# '+' && l:reg !=# '*'
      return
    endif
    " base64 over a pipe: Vim 8 has no encoder of its own, and `tr` is here to
    " strip the wrapping that base64 adds on long input.
    let l:encoded = system('base64 | tr -d "\n"',
          \ join(get(v:event, 'regcontents', []), "\n"))
    let l:sequence = "\e]52;c;" . substitute(l:encoded, '[\r\n]', '', 'g') . "\a"
    if exists('*echoraw')
      call echoraw(l:sequence)
    elseif has('nvim')
      call chansend(v:stderr, l:sequence)
    endif
  endfunction

  augroup Osc52Yank
    autocmd!
    autocmd TextYankPost * call s:Osc52Yank()
  augroup END
endif

" Color Theme (matches 'crispy' Ghostty terminal palette — Tomorrow Night)
set background=dark
colorscheme Tomorrow-Night

" UI Config
syntax on                     " Enable syntax highlighting
set number                    " Show line numbers
set ruler                     " Show line and column numbers
set cursorline                " Highlight current line
set showmatch                 " Highlight matching bracket
set nowrap                    " Do not wrap long lines

" Indentation (Standard 2 spaces)
set tabstop=2
set shiftwidth=2
set expandtab
set smartindent
set autoindent

" Search
set hlsearch                  " Highlight search results
set incsearch                 " Jump to matches while typing
set ignorecase                " Case insensitive search
set smartcase                 " ...unless uppercase is used

" Backups (Disable them for cleaner dirs)
set nobackup
set nowritebackup
set noswapfile

" Git Commit Wrapping
autocmd FileType gitcommit setlocal textwidth=72 colorcolumn=73
