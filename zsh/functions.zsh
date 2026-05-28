# Re-runs the last shell command and copies its output to the macOS clipboard.
clip-last() {
  fc -e - 2>/dev/null | pbcopy && echo "Copied to clipboard."
}
