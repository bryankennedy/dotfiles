# Antigravity Global Agent Rules

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
When creating Mermaid diagrams, use these following standard  colors, which reflect my current work brand standards:

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
* **Package Manager:** Always prefer **Bun** (`bun`) over `npm` for installing dependencies, running scripts, and managing packages in both local and remote cloud environments.
* **Node.js Version:** Always prefer the current **LTS (Long Term Support)** version of Node.js for both local development and remote cloud environments.
