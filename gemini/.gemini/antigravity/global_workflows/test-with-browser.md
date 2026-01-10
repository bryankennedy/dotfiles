1. **Check Dev Server Status**
   - Use `read_terminal` or check your active `run_command` processes to see if the development server (e.g., `npm run dev`) is already running.
   - If it is running, identify the local URL (usually `http://localhost:3000`).
   - If it is NOT running, start it using `run_command` (e.g. `npm run dev` in the appropriate directory). Ensure you wait for the server to be ready before proceeding.

2. **Verify Changes**
   - Use the `browser_subagent` to open the local URL.
   - Instruct the subagent to perform specific actions to validate the user's request.
     - *Example:* "Navigate to the object page, click the 'Material' link, and verify that the search page loads with the correct filter applied."
   - The subagent must return concrete evidence (text from the page, confirmation of navigation) that the feature works.

3. **Report Findings**
   - State clearly and definitively what was tested and the result.
   - **DO NOT** use phrases like "this should be working" or "I believe this is fixed."
   - **DO**: "I verified the fix by navigating to [URL], clicking [Element], and observing [Result]."
   - If the verification fails, report the specific failure, debug the issue, and restart the verification process.
