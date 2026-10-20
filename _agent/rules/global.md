---
description: Global coding standards and practices
alwaysApply: true
---

# Global Agent Rules

## 1. Scripting & Automation Hierarchy
**Strictly adhere** to the following language priority for all task execution, script generation, and automation:

1.  **Node.js (Primary):** The default choice for all logic and tools. Use modern ESM syntax (`import/export`) unless the environment strictly requires CommonJS.
2.  **Python (Secondary):** Use only if a required specialized library (e.g., NumPy, Pandas, Scikit-learn) is unavailable in Node, or if the target environment specifically expects Python.
3.  **Shell/Bash (Fallback):** Use only for trivial one-liners or system-level tasks where a full script is overkill.

**Negative Constraint:** Do not default to Python for general-purpose utility scripts if Node.js is capable of achieving the result.

---

## 2. Git Architecture & Maintenance
* **Centralization:** Maintain exactly **one** `.gitignore` file at the repository root.
* **Folder Hygiene:** Do not create nested `.gitignore` files in subdirectories or package folders unless a unique environment conflict exists.
* **Documentation Requirement:** Every entry in the `.gitignore` must be preceded by a `#` comment explaining the rationale (e.g., `# Ignore local environment secrets`).
* **Repo Visibility:** All ignore logic must be transparent and visible from a single root-level view to maintain repository health.

---

## 3. Security & Secret Management
**Absolute Zero-Leak Policy:** Never commit secrets, API keys, passwords, or PII (Personally Identifiable Information) to version control.

* **Environment-Based Configuration:** All sensitive data must be pulled from environment variables. Code must be written to use `process.env` (Node) or `os.environ` (Python).
* **Proactive Protection:** When initializing a project, update the root `.gitignore` *immediately* to include `.env`, `.env.local`, and `.env.*.local` before any code is written.
* **Placeholder Safety:** Do not suggest code containing "mock" keys (e.g., `const KEY = "12345"`). Use generic variables and prompt the user to update their local environment.
* **Template Provisioning:** Always provide or update a `.env.example` file containing the necessary keys (with empty/dummy values) to ensure the project remains portable without exposing credentials.

---

## 4. Mermaid Diagram Standards
When creating Mermaid diagrams, use these following standard colors:

*   **Primary Blue:** `#06A7E0` (RGB: 6,167,224)
*   **Secondary Colors:**
    *   Orange: `#F08B23`
    *   Yellow: `#F2C42E`
    *   Red/Tomato: `#ED6245`
    *   Slate Blue: `#546EB4`
    *   Lavender: `#BA94C4`
    *   Pink/Fuscia: `#D4569F`

**Design Guidelines:**
*   **Backgrounds:** Use 10-20% lighter shades of the above colors for element backgrounds to ensure black text remains highly readable.
*   **Readability:** Always prioritize high contrast and readability.

---

## 5. Package Management & Runtime Standards
* **Package Manager:** Always prefer **Bun** (`bun`) over `npm` (and `bunx` over `npx`) for installing dependencies, running scripts, and managing packages in both local and remote cloud environments.
* **Node.js Version:** Always prefer the current **LTS (Long Term Support)** version of Node.js for both local development and remote cloud environments.

---

## 6. Project Initialization
* **Agent Directory:** Upon entering a new project or workspace that lacks an `.agent` directory, **always propose** initializing it.
* **Standard Structure:** The default recommended structure for the `.agent` directory is:
    * `.agent/workflows/` - For reusable workflow definitions.
    * `.agent/memory/` - For project-specific context and decisions (e.g., `.agent/memory/decisions.md`).
    * `.agent/scratchpad.md` - For ephemeral notes or current task tracking.

---

## 7. GCloud Deployment Standards
* **Scripting Preference:** Always prefer **Node.js** (via `bun`) over shell scripts for developing `gcloud` deployment and automation scripts.
* **Secret Management:**
    * **Loading:** All deployment secrets must be loaded using `dotenv` from a `.env` file.
    * **No Plaintext:** Secrets must **never** be included as plaintext in any script or command.
    * **GCP Integration:** Secrets should be added to Google Cloud resources (Cloud Run, Cloud Functions, etc.) only by referencing them from **Google Secret Manager**.

---

## 8. Writing Style: Simplified Technical English
Write prose in **ASD-STE100 Simplified Technical English (STE)**. This applies to every channel: replies in an interactive session, pull request titles and bodies, commit message bodies, code review comments, notes and actions in the Progress tracker, and repository documentation. The fleet policy, with the per-channel table, is section 11 of infrastructure's [`docs/house-standards.md`](https://git.bck.dev/bkennedy/infrastructure/src/branch/main/docs/house-standards.md).

**The rules.**

1. One idea in one sentence. An instruction is 20 words or fewer. A descriptive sentence is 25 words or fewer.
2. A paragraph holds 6 sentences or fewer. Its first sentence gives its topic.
3. Use the active voice. Name the thing that does the work: "the runner pulls the image", not "the image is pulled".
4. Write an instruction as a command, and write one instruction in one sentence. Two actions need two sentences.
5. Use the simple tenses: simple present, simple past, simple future.
6. Do not use an `-ing` word as a noun or as a verb tense. Write "to start the service", not "starting the service". An `-ing` word that is part of a technical name is correct ("load balancing", "static typing").
7. Keep the articles. Write "remove the token", not "remove token".
8. Use three words or fewer in a noun cluster. Break up "forge Actions secret rotation policy".
9. Use one word for one thing, every time. Do not change the word to vary the prose.
10. Put a condition or a warning before the action it governs: "Before you push, run the tests."
11. Use plain words. Prefer: use (not utilize, leverage); before (not prior to); after (not subsequent to); to (not in order to); help (not assist); start (not initiate, commence); stop (not terminate); must (not shall); show (not surface); about (not approximately); so (not thereby, thus).
12. Cut the filler: "it is important to note", "in terms of", "robust", "seamless", "comprehensive", "delve", and any opener that restates the question.
13. Use no slang, no idiom and no metaphor.
14. Write an abbreviation out in full the first time you use it in a document.
15. Use a vertical list or a table when the text carries more than three steps, conditions or cases.
16. Do not hide a second thought in an em dash or in parentheses. Write a second sentence.

**Technical names are not restricted.** Any term that names the subject is correct, even when the STE dictionary does not hold it: "load balancer", "Cloudflare Tunnel", "static typing", "tailnet", "Durable Object", "idempotent". STE licenses these as technical names and technical verbs. Never write around a precise term to reach a simpler one. A vague word is not an improvement.

**The dictionary is a preference, not a gate.** STE Part 2 approves about 900 general words, each with one part of speech and one meaning. It is copyrighted, so no copy of it is in these repositories, and the one-meaning rule is not enforced. Rule 11 carries the part of it that changes how the prose reads.

**Do not apply STE to:**

* **Code and quoted text.** Identifiers, file paths, commands, configuration, and quoted log or error text are copied exactly. Never rewrite one to make it plainer.
* **Prose written for other people.** Marketing copy, website text, email, and anything written to persuade or to please are written in the register the request asks for.
* **Design and creative work.** A colour, a feeling, an aesthetic and a joke need words STE does not hold. Keep the short sentences and the active voice; use any word the work needs.
* **Material quoted from somewhere else**, and any text that must be reproduced faithfully.

A rule that fights the work loses. The goal is a reader who understands the text in one pass, not a score.
