---
name: openai-tool-calling
description: How to add OpenAI Responses API function/tool calling (with structured `text.format` output) in this repo, based on the implementation in src/utils/functions/ai/help-chat.ts. Use when adding or modifying tool calls for any AI chat flow (openai.responses.parse).
---

# OpenAI Responses API tool calling

This repo uses `openai` v6 (`openai.responses.parse`) with zod structured outputs
(`zodTextFormat`) for AI features (see `src/utils/functions/ai/help-chat.ts` and
`src/utils/functions/supportrequest.ts`). Tool calling was added to the **help
command's AI flow** (`help-chat.ts`) so the model can look up commands/items
on demand instead of stuffing everything into the system prompt.

Tool definitions + their executors live under `src/utils/functions/ai/tools/`,
split by category (`commands.ts`, `items.ts`, …), each exporting a
`FunctionTool[]` array and an `execute<Category>Tool(name, args)` function that
returns `null` for tool names it doesn't handle. `tools/index.ts` aggregates
all category arrays into `aiTools` and exposes a single `executeAiTool(name,
rawArguments)` dispatcher (handles JSON-parsing the arguments string and
catching errors) for consumers like `help-chat.ts` to pass straight to
`responses.parse({ tools: aiTools })`. When adding a new tool category, add a
new file under `tools/` following this pattern rather than growing an existing
category file or inlining tools back into the chat flow file.

## Types — import from `openai/resources/responses/responses`, not `openai/resources`

- `FunctionTool` — shape of a tool definition: `{ type: "function", name, description, parameters (JSON schema), strict }`.
- `ResponseInput` — `Array<ResponseInputItem>`, the type for the growing `input` array you pass to `responses.parse`/`responses.create`.
- `ParsedResponseFunctionToolCall` — **use this, not `ResponseFunctionToolCall`**, when narrowing `response.output` items from a `.parse()` call. `.parse()` always augments `function_call` items with a `parsed_arguments` field (even for plain, non-zod-wrapped tools — it's just `null` in that case), so a type predicate typed as the plain `ResponseFunctionToolCall` fails to compile ("predicate not assignable") and silently stops narrowing, causing cascading errors on `.name`/`.arguments`/`.call_id`.

**Never push the raw `ParsedResponseFunctionToolCall` items straight back into `input`.** The API rejects the extra `parsed_arguments` field with `400 Unknown parameter: 'input[N].parsed_arguments'`. Strip it by re-mapping to a plain object before pushing:

```ts
input.push(
  ...toolCalls.map((call) => ({
    type: "function_call" as const,
    call_id: call.call_id,
    name: call.name,
    arguments: call.arguments,
  })),
);
```

## Loop pattern

```ts
const input: ResponseInput = [/* system/user messages */];

let parsed: MyZodType | null = null;
for (let i = 0; i < MAX_TOOL_ROUNDTRIPS; i++) {
  const response = await openai.responses.parse({
    model: MODEL,
    input,
    tools: myTools, // FunctionTool[]
    text: { format: zodTextFormat(myResponseFormat, "my_response") },
  });

  const toolCalls = response.output.filter(
    (item): item is ParsedResponseFunctionToolCall => item.type === "function_call",
  );

  if (toolCalls.length === 0) {
    parsed = response.output_parsed;
    break;
  }

  // see above — strip `parsed_arguments` before echoing tool calls back into the transcript
  input.push(
    ...toolCalls.map((call) => ({
      type: "function_call" as const,
      call_id: call.call_id,
      name: call.name,
      arguments: call.arguments,
    })),
  );

  for (const call of toolCalls) {
    logger.info("<flow>: tool call", { userId, tool: call.name, arguments: call.arguments }); // log every tool invocation
    const result = await executeMyTool(call.name, call.arguments); // arguments is a JSON string
    input.push({ type: "function_call_output", call_id: call.call_id, output: result });
  }
}
```

Cap the loop (`MAX_TOOL_ROUNDTRIPS`, e.g. 6) to avoid runaway tool-call loops.
Accumulate `response.usage` across every iteration of the loop, not just the
final call, when tracking token usage/rate limits. Log every tool call
(tool name + raw arguments) so tool usage is visible/debuggable in prod logs.

## Tool executor conventions

- Tool functions return a `string` (JSON.stringify'd) — the Responses API expects `output` to be text (or the file/image content list type).
- When dumping a repo object as raw JSON for the model (e.g. a `Command` instance), strip functions first: `JSON.stringify(obj, (k, v) => (typeof v === "function" ? undefined : v))` — `Command` instances have a non-serializable `run` function property.
- Wrap each tool's logic in try/catch and return `JSON.stringify({ error: "..." })` on failure instead of throwing, so one bad tool call doesn't kill the whole conversation.
- Prefer reusing existing pure data-lookup functions over recomputing logic in a tool executor (e.g. `selectItem`/`calcItemValue`/`getObtainingData` for items — see the `economy-items` skill). Only write new matching/filtering logic when nothing suitable already exists.
- Current categories: `commands.ts` (`list_commands`, `get_command_info`), `items.ts` (`search_items`, `get_item_info`), `achievements.ts` (`list_achievements`). Not every category needs both a "list/search" and a "get info" tool — only split into two when the full data set is too large to return in one call (compare the small, flat `AchievementData` in `achievements.ts`, returned in full via one tool, against the larger `Item`/`Command` objects which get a lightweight search + separate detail tool).

## Downsides of more tool-call round trips

Each round trip is a full extra request to the model, so more tool calls means:

- **Latency** — the user waits on every extra round trip; noticeable in an interactive Discord flow.
- **Cost/tokens** — the entire growing `input` transcript (system prompt + history + all prior tool calls/outputs) is resent as input tokens on every round trip, so cost scales roughly quadratically with the number of tool calls, not linearly. Note `GLOBAL_WEEKLY_TOKEN_LIMIT` in `help-chat.ts` currently only tracks **output** tokens — heavy tool use inflates input-token cost without tripping that budget.
- **Hitting `MAX_TOOL_ROUNDTRIPS`** — if the model keeps calling tools without converging on a final answer, the loop exits with `parsed` still `null`, surfacing as `"empty help ai response"` and no answer for the user.
- Keep tool result payloads reasonably small/targeted (e.g. `search_items` caps results to 25) since every tool output is echoed back into the transcript and paid for again on the next round trip.

## Reducing prompt size

Static reference data that a tool can fetch on demand (full command list, item
data) should **not** be baked into the system prompt — expose it via a tool
instead (`list_commands`, `get_command_info` in `tools/commands.ts`;
`search_items`, `get_item_info` in `tools/items.ts`) and mention the tools in
the prompt text file under `data/prompts/` instead of dumping the raw data
there.

See the `economy-items` skill for the existing `selectItem`/`calcItemValue`
helpers to reuse when building item-lookup tools instead of writing new
matching logic.
