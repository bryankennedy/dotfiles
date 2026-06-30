---
name: announce-completion
description: Announce task completion with a humorous audio message using the 'say' command. Use this at the end of a turn when a long-running task has finished.
---

1.  **Generate Message**: Create a short, creative, and humorous sentence to announce that the work is finished.
    *   *Constraint*: **ABSOLUTELY NO EXCLAMATION MARKS (!)** in the message. They cause shell history expansion errors.
    *   *Example*: "I have finished the task and am now awaiting your next command."

2.  **Execute Command**: Pass your generated text to `say` via an environment variable so shell metacharacters (`"`, `` ` ``, `$( )`, `\`) in the message can never be interpreted by the shell. Replace `[MESSAGE]` with your generated text.
    ```bash
    MSG='[MESSAGE]' say -- "$MSG"
    ```
    *   *Constraint*: Use **single quotes** around the message. If the text itself contains a single quote (`'`), write it as `'\''`.