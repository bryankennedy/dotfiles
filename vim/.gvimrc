" MacVim / GVim settings

" Match Ghostty terminal font
set guifont=Monaco:h18

" Clean up the GUI chrome
set guioptions-=T             " No toolbar
set guioptions-=r             " No right scrollbar
set guioptions-=L             " No left scrollbar
set guioptions-=m             " No menu bar

" Yank/delete/put use the macOS clipboard (GUI only; terminal vim keeps its registers)
set clipboard=unnamed

" Window size
set lines=50
set columns=160
