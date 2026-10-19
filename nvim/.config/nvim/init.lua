-- Neovide GUI settings
if vim.g.neovide then
  -- Disable cursor animation
  vim.g.neovide_cursor_animation_length = 0
  vim.g.neovide_cursor_trail_size = 0
  vim.g.neovide_scroll_animation_length = 0
  vim.g.neovide_position_animation_length = 0
end

-- Clipboard — a yank reaches the Mac's clipboard, even from a VM over SSH
--
-- `vi` and `vim` on the VMs are both Neovim (Ubuntu's alternatives point there),
-- so this file, not ~/.vimrc, is what runs when editing over SSH. A VM has no
-- pasteboard of its own, so the only way out is OSC 52: print the yanked text to
-- the terminal as an escape sequence and let the terminal put it on the
-- clipboard. Ghostty allows that out of the box (clipboard-write = allow), and
-- herdr, which sits between Ghostty and every pane, forwards it.
--
-- Neovim has had an OSC 52 clipboard provider since 0.10, but it only serves the
-- + and * registers, and the VMs are on 0.9.5 (Ubuntu 24.04) where there is no
-- provider at all — hence mirroring the yank by hand, which also keeps a plain
-- `y` working without `clipboard=unnamedplus` dragging every delete along.
--
-- Pasting back is deliberately not wired up: it needs an OSC 52 *read*, which
-- Ghostty prompts for (clipboard-read = ask) and which blocks the editor until
-- the terminal answers. Cmd-V still pastes, because it arrives as keystrokes.
--
-- Local Neovim is left alone: it talks to the pasteboard directly through pbcopy.
if vim.env.SSH_TTY or vim.env.SSH_CONNECTION then
  local function encode(text)
    if vim.base64 then -- 0.10+
      return vim.base64.encode(text)
    end
    -- `tr` strips the wrapping base64 adds on long input.
    return (vim.fn.system('base64 | tr -d "\\n"', text):gsub('[\r\n]', ''))
  end

  local function to_terminal(sequence)
    if vim.api.nvim_ui_send then -- 0.10+; ordered against Neovim's own writes
      vim.api.nvim_ui_send(sequence)
    else
      io.stdout:write(sequence)
      io.stdout:flush()
    end
  end

  vim.api.nvim_create_autocmd('TextYankPost', {
    group = vim.api.nvim_create_augroup('Osc52Yank', { clear = true }),
    desc = 'Send a yank to the terminal clipboard over OSC 52',
    callback = function()
      local event = vim.v.event
      if event.operator ~= 'y' then
        return
      end
      -- A yank into "a leaves the Mac's clipboard alone.
      if event.regname ~= '' and event.regname ~= '+' and event.regname ~= '*' then
        return
      end
      local text = table.concat(event.regcontents, '\n')
      to_terminal('\27]52;c;' .. encode(text) .. '\7')
    end,
  })
end
