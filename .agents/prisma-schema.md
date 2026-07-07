# Prisma Schema Editing

- When modifying `prisma/schema.prisma`, replace the entire model block rather than inserting/editing partial lines near block boundaries (e.g. adding a field right before the closing `}`). Partial edits at model edges have corrupted the schema in past sessions (stray braces, misplaced fields).
- Prefer reading the full model block first, then doing one `replace_string_in_file` swapping the whole `model X { ... }` block for the updated version.
- After confirming schema changes are correct, run `npx prisma generate` to refresh `src/generated/prisma/` types (imported via `#generated/prisma`). If a model delegate seems missing from the generated client (e.g. `prisma.lottery` not existing) even though the schema has it, that's usually a stale generate - rerun it.
- Do not create migrations yourself - the user handles `prisma migrate dev` once all schema changes for a task are confirmed.
