# PlanckOff In-App Chatbot — Design Document

> **Scope:** This document covers the full design for an embedded AI assistant inside PlanckOff. The assistant is project-aware, app-bounded, and — in Phase 2 — capable of executing basic edits via user confirmation.

---

## 1. What We Are Building

A floating chat panel accessible from any page in the app. The assistant:

- Reads the current project's data (costs, assemblies, markups, labour, materials) and answers questions about it
- Is hard-bounded to the application domain — refuses anything outside drywall estimating / PlanckOff
- Knows which screen the user is on (Labour tab, Markups tab, etc.) and tailors answers to the visible context
- **Phase 2:** Can propose and execute specific edits (material overrides, markup percentages, project info fields) with a confirm/cancel step before anything changes

---

## 2. Architecture Overview

```
User types a message
      │
      ▼
ChatPanel.tsx   ←── reads current screen context from useChatContext()
      │
      │  POST /api/chat  { messages[], context: ChatContext }
      ▼
/api/chat/route.ts  (withAuth)
      │
      │  builds system prompt from ChatContext
      │  calls Claude API (claude-haiku-4-5)  ← streaming
      ▼
      │  Phase 1: plain text stream back to UI
      │  Phase 2: may return a tool call (proposed edit)
      ▼
ChatPanel.tsx renders streamed response
      │
      │  (Phase 2 only) if tool call received → EditConfirmation.tsx
      │      confirm → calls existing API (updateOverride / etc.)
      │      cancel  → sends "user cancelled" to continue conversation
      ▼
User reads answer / sees edit applied
```

**What the chatbot does NOT do:**
- It does not scrape the DOM or take screenshots
- It receives structured data from React context — the same data the tabs already have
- It does not access data outside the current project or the user's session

---

## 3. New Files

```
src/
├── app/api/chat/
│   └── route.ts                        ← streaming chat API endpoint
│
├── components/features/chat/
│   ├── ChatPanel.tsx                   ← floating panel (open/close, history, input)
│   ├── ChatMessage.tsx                 ← renders one message (user / assistant / error)
│   ├── ChatInput.tsx                   ← textarea + send button
│   └── EditConfirmation.tsx            ← Phase 2: confirm/cancel proposed edit
│
├── hooks/
│   └── useChatContext.ts               ← builds ChatContext from current page state
│
├── lib/utils/
│   └── chatContextSerializer.ts        ← pure function: ChatContext → system prompt string
│
└── types/
    └── chat.ts                         ← ChatMessage, ChatContext, ChatTool types
```

No new database tables are needed for Phase 1. Phase 2 may require one (see Section 8).

---

## 4. Type Definitions — `src/types/chat.ts`

```ts
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// What the frontend sends to /api/chat on every request
export interface ChatRequest {
  messages: ChatMessage[];
  context: ChatContext;
}

// Serialized snapshot of what the user is currently looking at
export interface ChatContext {
  projectId: string;
  projectName: string;
  activePage: 'reports' | 'project' | 'materials-db' | 'labour-db' | 'other';
  activeTab?: 'labour' | 'materials' | 'matlab' | 'markups' | 'summary';
  costs: {
    totalMaterial: number;
    totalLabor: number;
    netDirectCost: number;
    byTrade: Record<string, { material: number; labor: number }>;
  };
  lineItemCount: number;
  // A readable summary of line items for the active tab (capped at ~60 rows)
  visibleLineItems: string;
  // Phase 2: markup config snapshot (for answering markup questions)
  markups?: {
    escalationPct: number;
    taxPct: number;
    laborBurdenPct: number;
    overheadPct: number;
    profitPct: number;
    gcTotal: number;
    finalTotal: number;
  };
}

// Phase 2 — tool call returned by Claude
export interface ChatToolCall {
  name: 'update_material_override' | 'update_markup_percentage' | 'update_project_info';
  input: Record<string, unknown>;
}
```

---

## 5. Context Serializer — `src/lib/utils/chatContextSerializer.ts`

This pure function converts `ChatContext` into the text block injected into Claude's system prompt. It is the only place that shapes what the AI "sees."

```ts
export function buildSystemPrompt(ctx: ChatContext): string {
  return `
You are an AI assistant embedded in PlanckOff, a professional drywall estimation application.

## YOUR SCOPE — HARD LIMITS
You ONLY answer questions about:
  • The current project's cost data shown in the "Current Project Data" section below
  • Drywall estimation concepts (quantities, waste factors, labour costs, markups, CSI codes)
  • How to use PlanckOff features (tabs, overrides, pipeline, reports)
If the user asks anything outside this scope, politely decline and redirect them to estimation topics.

## CURRENT PROJECT DATA
Project: ${ctx.projectName} (ID: ${ctx.projectId})
Active view: ${ctx.activePage}${ctx.activeTab ? ` → ${ctx.activeTab} tab` : ''}

### Cost Summary
- Total Material Cost: $${ctx.costs.totalMaterial.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
- Total Labour Cost:   $${ctx.costs.totalLabor.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
- Net Direct Cost:     $${ctx.costs.netDirectCost.toLocaleString('en-CA', { minimumFractionDigits: 2 })}

### Cost by Trade
${Object.entries(ctx.costs.byTrade)
  .map(([trade, v]) =>
    `  ${trade}: Material $${v.material.toLocaleString('en-CA', { maximumFractionDigits: 0 })} | Labour $${v.labor.toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
  )
  .join('\n')}

${ctx.markups ? `
### Markup Chain
  GC / General Requirements total: $${ctx.markups.gcTotal.toLocaleString('en-CA', { maximumFractionDigits: 0 })}
  Escalation: ${ctx.markups.escalationPct}%
  Material Tax: ${ctx.markups.taxPct}%
  Labour Burden: ${ctx.markups.laborBurdenPct}%
  Overhead: ${ctx.markups.overheadPct}%
  Profit: ${ctx.markups.profitPct}%
  → Final Total: $${ctx.markups.finalTotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
` : ''}

### Line Items (${ctx.lineItemCount} total — showing active view)
${ctx.visibleLineItems}

## RESPONSE STYLE
- Be concise. One paragraph max unless a breakdown is explicitly requested.
- When quoting dollar values always use the exact numbers from the data above.
- Never make up numbers — if data is not in the snapshot above, say so.
- Never suggest the user go outside PlanckOff to solve an estimation problem.
`.trim();
}
```

**Line item cap:** The serializer limits `visibleLineItems` to 60 rows to stay well under Claude's context limit. For Labour tab it filters to labour items; for Materials tab it filters to material items; for the overview it shows the top 30 by total cost.

---

## 6. The `useChatContext` Hook — `src/hooks/useChatContext.ts`

Reads from existing contexts and returns a `ChatContext` ready to send.

```ts
'use client';

import { useMemo } from 'react';
import { useProjectDataContext } from '@/context/ProjectDataContext';
import { useReportFilters } from '@/hooks/useReportFilters';
import type { ChatContext } from '@/types/chat';

export function useChatContext(
  activePage: ChatContext['activePage'],
  activeTab?: ChatContext['activeTab'],
  markups?: ChatContext['markups'],
): ChatContext {
  const { projectId, projectCosts } = useProjectDataContext();

  return useMemo(() => {
    const { lineItems, totalMaterial, totalLabor, netDirectCost, byTrade } = projectCosts;

    // Pick items relevant to the current tab for the visible summary
    const tabItems = (() => {
      if (activeTab === 'labour')    return lineItems.filter(i => i.isLabor);
      if (activeTab === 'materials') return lineItems.filter(i => !i.isLabor);
      return [...lineItems].sort((a, b) => b.totalCost - a.totalCost).slice(0, 30);
    })();

    const visibleLineItems = tabItems
      .slice(0, 60)
      .map(i =>
        `  [${i.code}] ${i.description} | qty: ${i.quantity} ${i.unit} | unit: $${i.unitCost.toFixed(2)} | total: $${i.totalCost.toFixed(2)} | ${i.isLabor ? 'LABOUR' : 'MATERIAL'} | trade: ${i.trade} | area: ${i.area}`
      )
      .join('\n');

    return {
      projectId,
      projectName: '',   // filled by the parent page from project metadata
      activePage,
      activeTab,
      costs: { totalMaterial, totalLabor, netDirectCost, byTrade },
      lineItemCount: lineItems.length,
      visibleLineItems,
      markups,
    };
  }, [projectId, projectCosts, activePage, activeTab, markups]);
}
```

The hook is called inside the component that knows the active tab (e.g. `Reports.tsx`), so it always gets the correct slice of data.

---

## 7. API Route — `src/app/api/chat/route.ts`

```ts
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth } from '@/lib/auth/api-helpers';
import { failure } from '@/lib/api/response';
import { buildSystemPrompt } from '@/lib/utils/chatContextSerializer';
import type { ChatRequest } from '@/types/chat';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const POST = withAuth(async (request: NextRequest) => {
  const body: ChatRequest = await request.json().catch(() => null);
  if (!body?.messages || !body?.context) return failure('messages and context are required', 400);

  // Hard cap on history to prevent prompt blowout
  const recentMessages = body.messages.slice(-20);

  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildSystemPrompt(body.context),
    messages: recentMessages,
    // Phase 2: tools array added here (see Section 9)
  });

  // Return a ReadableStream — browser reads chunks as they arrive
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
          // Phase 2: handle tool_use delta here
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
});
```

**Model choice:** `claude-haiku-4-5-20251001` — fastest and cheapest. Sufficient for Q&A over structured project data. Upgrade to `claude-sonnet-4-6` only if answer quality is insufficient after testing.

**Token budget:** ~800 tokens for system prompt + context, 1024 max output. Well within Haiku limits.

---

## 8. UI Component — `src/components/features/chat/ChatPanel.tsx`

### Visual design

```
┌──────────────────────────────────────┐
│  PlanckOff Assistant          [×]    │  ← header, close button
├──────────────────────────────────────┤
│                                      │
│  [Assistant]  The total labour cost  │  ← scrollable message history
│  for Interior Walls is $47,320…      │
│                                      │
│  [You]  What's the highest cost      │
│  assembly?                           │
│                                      │
│  [Assistant]  ▌ (streaming...)       │
│                                      │
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐  │
│  │ Ask about this project...      │  │  ← ChatInput.tsx
│  └────────────────────────────────┘  │
│                           [Send ↵]   │
└──────────────────────────────────────┘

[💬]  ← floating trigger button (bottom-right of screen)
```

### Key behavior rules

- **Chat history is in-memory** — clears on page refresh. No DB persistence needed in Phase 1.
- **One request at a time** — Send button disables while response is streaming.
- **Context auto-updates** — Each new message sends a fresh `ChatContext` snapshot. The assistant always sees the current state of the project, even if overrides changed mid-conversation.
- **Panel position** — `fixed bottom-6 right-6`, slides in from the right, `z-50`. Does not block any existing modals (which use `z-50`+). Use `z-40` for the panel, `z-50` for modals.
- **Width** — `w-96` (384px). Does not resize.
- **Message history scrolls** — `flex-1 overflow-y-auto` area.

### State inside ChatPanel

```ts
const [isOpen, setIsOpen] = useState(false);
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [input, setInput] = useState('');
const [isStreaming, setIsStreaming] = useState(false);
const [pendingEdit, setPendingEdit] = useState<ChatToolCall | null>(null); // Phase 2
```

### Sending a message (simplified)

```ts
async function handleSend() {
  const userMsg: ChatMessage = { role: 'user', content: input.trim() };
  const newHistory = [...messages, userMsg];
  setMessages(newHistory);
  setInput('');
  setIsStreaming(true);

  const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
  setMessages([...newHistory, assistantMsg]);

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: newHistory, context: chatContext }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', content: accumulated };
      return updated;
    });
  }

  setIsStreaming(false);
}
```

### Where ChatPanel mounts

Mount it once in the project layout or in `Reports.tsx` — wherever `ProjectDataContext` is available. It does NOT mount on public or auth pages.

```tsx
// src/app/(protected)/(app)/project/[id]/layout.tsx  (or page.tsx)
<ProjectDataProvider ...>
  {children}
  <ChatPanel activePage="reports" activeTab={activeTab} />
</ProjectDataProvider>
```

---

## 9. Phase 2 — Edit Capabilities

### What can be edited via chat

Only actions that map to **existing, tested API endpoints** are exposed as chat tools in Phase 1 of Phase 2:

| Action | Tool name | Underlying API |
|--------|-----------|---------------|
| Override a material's unit cost | `update_material_override` | `PATCH /api/projects/:id/material-overrides` |
| Override a material's quantity | `update_material_override` | `PATCH /api/projects/:id/material-overrides` |

**Why only these two?** Markup percentages, staffing rows, GC rows, and project info are currently **local `useState` in `Markups.tsx`** and are not persisted. Editing them via chatbot would only work for the current session and would be lost on refresh. Before exposing those to the chatbot, they need their own persistence layer (see Section 10).

### Tool definition (added to `/api/chat/route.ts`)

```ts
const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_material_override',
    description:
      'Override the unit cost or quantity for a specific material in the current project. ' +
      'Only call this when the user explicitly asks to change a cost or quantity. ' +
      'Always confirm the material code and new value before calling.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'The material code (e.g. "GB12", "STUD25")',
        },
        field: {
          type: 'string',
          enum: ['unit_cost', 'quantity'],
          description: 'Which field to override',
        },
        value: {
          type: 'number',
          description: 'The new value. Must be a positive number.',
        },
        reason: {
          type: 'string',
          description: 'One-sentence summary of why this change is being made (shown to user in confirmation)',
        },
      },
      required: ['code', 'field', 'value', 'reason'],
    },
  },
];
```

### How the API route handles tool calls

When Claude returns a `tool_use` block instead of streaming text, the route sends back a structured JSON response (not a stream):

```ts
// In the stream loop:
if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
  // Collect the full tool call (it arrives in delta chunks)
  // Then return it as JSON for the frontend to handle:
  return NextResponse.json({
    type: 'tool_call',
    tool: {
      name: chunk.content_block.name,
      id: chunk.content_block.id,
      input: {},  // filled as input_json_delta arrives
    },
  });
}
```

### `EditConfirmation.tsx` — the confirm/cancel UI

When `ChatPanel` receives a `tool_call` response, it renders `EditConfirmation` instead of appending a text message:

```
┌──────────────────────────────────────┐
│  Assistant wants to make a change:   │
│                                      │
│  Material: GB12 (½" Drywall Board)   │
│  Field: unit cost                    │
│  Current: $0.85 / SF                 │
│  New value: $0.92 / SF               │
│                                      │
│  Reason: User requested updated      │
│  supplier pricing for Q3             │
│                                      │
│  [Cancel]              [Apply ✓]     │
└──────────────────────────────────────┘
```

On **Apply**: call `updateOverride(code, field, value)` from `ProjectDataContext`. This already hits the API and recomputes `projectCosts` — zero new code needed.

On **Cancel**: send a follow-up message `{ role: 'user', content: 'User cancelled the proposed change.' }` back to Claude so it can acknowledge and continue.

### System prompt additions for Phase 2

Add this block to `buildSystemPrompt()` when tools are active:

```
## EDIT RULES
You have one tool available: update_material_override.
Only call it when the user EXPLICITLY asks to change a cost or quantity.
Before calling the tool, state what you are about to change and ask the user to confirm.
Never call the tool speculatively or as part of analysis — only on direct user instruction.
```

---

## 10. Prerequisites for Expanding Phase 2 Edit Scope

To allow the chatbot to edit markup percentages, staffing, GC rows, and project info, those values must first be persisted. Currently they are local state in `Markups.tsx`. The required work before exposing them to the chatbot:

### 10.1 New DB table: `project_markups`

```sql
create table project_markups (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  escalation_pct     numeric not null default 0,
  tax_pct            numeric not null default 0,
  labor_burden_pct   numeric not null default 0,
  overhead_pct       numeric not null default 0,
  profit_pct         numeric not null default 0,
  staffing_rows      jsonb,
  gc_rows            jsonb,
  travel_config      jsonb,
  admin_rows         jsonb,
  inflation_config   jsonb,
  project_info       jsonb,
  updated_at   timestamptz default now(),
  unique(project_id)
);
```

### 10.2 New API routes

- `GET  /api/projects/[id]/markups` — load saved markup state
- `PUT  /api/projects/[id]/markups` — save full markup snapshot

### 10.3 Lift markup state to `ProjectDataContext`

Move `useState` for staffing, GC rows, markup config, and project info from `Markups.tsx` into `ProjectDataContext` (or a new `MarkupsContext`). `Markups.tsx` becomes fully controlled.

### 10.4 New chat tools

Once persisted, add:
```
update_markup_percentage  → PUT /api/projects/:id/markups
update_staffing_row       → PUT /api/projects/:id/markups
update_project_info       → PUT /api/projects/:id/markups
```

---

## 11. Security

| Concern | Mitigation |
|---------|-----------|
| Unauthenticated access | `withAuth` on `/api/chat` — same as all other routes |
| User sees another project's data | `ChatContext.projectId` is built from the authenticated session's current project — the user already has access to this data through the UI |
| Prompt injection via project data | Line items are serialized as structured text, not injected into instructions. The system prompt's instruction block is hardcoded, never from user input or DB values |
| Runaway edits | Every tool call requires an explicit confirm step in the UI. Claude cannot apply changes silently |
| API key exposure | `ANTHROPIC_API_KEY` is server-only, never in `NEXT_PUBLIC_` env vars |
| Token cost abuse | History capped at 20 messages. Context capped at ~60 line items. Rate limiting via existing session auth (one session = one user) |

---

## 12. Environment Variables

Add to `.env.local` (and to Vercel / deployment environment):

```
ANTHROPIC_API_KEY=sk-ant-...
```

The project already uses Anthropic indirectly (via OpenRouter). Check if `ANTHROPIC_API_KEY` is already set; if OpenRouter is the intermediary, create a direct key for the chat route to avoid OpenRouter overhead on conversational queries.

---

## 13. Implementation Order

### Phase 1 — Read-only chatbot (estimated: 2–3 days)

1. **`src/types/chat.ts`** — define `ChatMessage`, `ChatContext`, `ChatRequest`
2. **`src/lib/utils/chatContextSerializer.ts`** — `buildSystemPrompt(ctx)`
3. **`src/app/api/chat/route.ts`** — streaming endpoint, no tools yet
4. **`src/hooks/useChatContext.ts`** — reads `ProjectDataContext`, builds `ChatContext`
5. **`src/components/features/chat/ChatMessage.tsx`** — user/assistant bubble rendering
6. **`src/components/features/chat/ChatInput.tsx`** — textarea + send
7. **`src/components/features/chat/ChatPanel.tsx`** — assembles the panel, handles streaming
8. Wire `ChatPanel` into the project layout / `Reports.tsx`
9. Test: ask questions about labour totals, trade breakdowns, highest cost assembly

### Phase 2 — Edit capability (estimated: 1–2 days, after Phase 1 is stable)

1. Add `CHAT_TOOLS` to the API route
2. Change API route to detect and return `tool_call` JSON (non-streaming path)
3. **`src/components/features/chat/EditConfirmation.tsx`** — confirm/cancel UI
4. Update `ChatPanel` to handle `tool_call` response type and render `EditConfirmation`
5. Wire "Apply" button to `updateOverride()` from `ProjectDataContext`
6. Wire "Cancel" to append a cancellation message and re-prompt Claude
7. Test: "Change the unit cost of GB12 to $0.95" → confirmation dialog → apply → costs update live

### Phase 3 — Expanded edit scope (future, after markup persistence is built)

1. Build `project_markups` table + repository + API routes (Section 10)
2. Lift markup state to context
3. Add `update_markup_percentage`, `update_project_info` tools

---

## 14. Testing Checklist

### Phase 1
- [ ] Bot answers "What is the total labour cost?" with the correct number from `projectCosts`
- [ ] Bot answers "Break down costs by trade" with the `byTrade` data
- [ ] Bot answers "What is the most expensive assembly?" by reading `lineItems`
- [ ] Bot refuses "Who won the 2024 election?" with a polite redirect
- [ ] Bot refuses "Write me a Python script" with a polite redirect
- [ ] Switching tabs updates the context — bot on Labour tab sees only labour items
- [ ] 20-message history cap works — older messages drop off cleanly
- [ ] Streaming renders token by token without flicker
- [ ] Panel opens/closes without disrupting any existing modals

### Phase 2
- [ ] "Change GB12 unit cost to $0.95" → tool call fires → confirmation dialog appears
- [ ] Cancel → assistant says "OK, no change made"
- [ ] Confirm → `updateOverride` called → totals in Markups and Labour tabs update immediately
- [ ] Bot does NOT call the tool without explicit user instruction
- [ ] Bot handles "I want to change a cost" (vague) by asking for the material code first

---

## 15. Out of Scope (Explicitly)

- **Chat history persistence across sessions** — in-memory only for now
- **Multi-project awareness** — bot is scoped to the currently open project
- **Voice input / output** — text only
- **Export of chat transcript** — not needed
- **Admin ability to customize bot behavior** — the system prompt is hardcoded for consistency
- **The bot editing assemblies** — assembly data is complex (formula evaluator, wall types, layers) and requires a dedicated design if ever needed
