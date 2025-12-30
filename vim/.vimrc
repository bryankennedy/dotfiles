" Minimal Vim Config

" Basics
set nocompatible              " Use Vim defaults instead of Vi
set encoding=utf-8
set mouse=a                   " Enable mouse support

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
