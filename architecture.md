# Architecture

Nightcode is four Bun packages. The CLI is the only process that touches the user's files. The server talks to the model, Postgres, Clerk, and Polar. `packages/shared` is the contract both sides import so a tool name and its input schema cannot drift.

```
packages/cli        terminal UI, OAuth, local tool execution
packages/server     Hono API, model streaming, billing
packages/database   Prisma + Postgres
packages/shared     modes, model list, tool schemas
```

## CLI

`packages/cli/src/index.tsx` starts an OpenTUI renderer and a React memory router. There is no browser history. Routes:

| Path | Screen |
| --- | --- |
| `/` | Home. Header and the input bar. |
| `/sessions/new` | Creates a session, then leaves. |
| `/sessions/:id` | The transcript and the input bar. |

`RootLayout` wraps every screen with theme, toast, keyboard layer, dialog, and prompt config. Prompt config is the current mode (`BUILD` or `PLAN`) and model id. It lives in React state for the process, not on the server. Each user message copies the current values into message metadata so a later turn still knows what was selected.

Home submit navigates to `/sessions/new` with `{ message, mode, model }` in router state. `NewSession` posts that title to `POST /sessions`. The title is the first 100 characters of the prompt. On success it replaces the route with `/sessions/:id` and passes the new session plus the original prompt. `Session` mounts `useChat` and, once, sends that prompt.

`useChat` is the AI SDK chat hook with a custom transport. The transport URL is the typed Hono client (`hc<AppType>`), so the CLI's request shapes come from the server's route types. `prepareSendMessagesRequest` does not send the whole transcript. It sends the latest user message, or the previous user message plus the assistant message when the assistant is waiting on tool results. The server merges those onto the transcript it already stored.

The Hono client attaches `Authorization: Bearer <token>` from `~/.nightcode/auth.json`. A 401 clears that file.

### Sign-in

`/login` runs `performLogin` in `packages/cli/src/lib/oauth.ts`.

1. The CLI binds `127.0.0.1` on a random port and opens the Clerk authorize URL. PKCE (`S256`) is used. The OAuth `state` is base64url JSON of `{ nonce, port }`.
2. Clerk redirects to `{API_URL}/auth/callback`.
3. The server reads `port` out of `state` and redirects to `http://localhost:<port>/callback` with the code. It does not exchange the code and it does not store a session.
4. The CLI checks the nonce, posts the code and verifier to `{CLERK_FRONTEND_API}/oauth/token`, and saves `access_token`.
5. Later API calls send that token. `authenticateOAuthRequest` in `packages/server/src/lib/auth.ts` asks Clerk to accept an `oauth_token` and returns `userId`. Every session query includes that `userId`, so one user cannot read another's row by guessing an id.

Login times out after five minutes.

## Server

`packages/server/src/index.ts` is a Hono app on port 3000. `idleTimeout` is 255 seconds so a long model stream is not cut off by Bun's default idle limit.

| Route | Auth | Credits check |
| --- | --- | --- |
| `GET /auth/callback` | no | no |
| `POST /billing/checkout` | yes | no |
| `POST /billing/portal` | yes | no |
| `GET /billing/success` | no | no |
| `GET /sessions` | yes | no |
| `GET /sessions/:id` | yes | no |
| `POST /sessions` | yes | yes |
| `POST /chat` | yes | yes |

Errors from `HTTPException` are returned as `{ error }` with that status. Anything else is logged and returned as 500.

### Sessions

One Postgres table, `Session`: `id`, `userId`, `title`, timestamps, and `messages` (JSON, default `[]`). Messages are AI SDK UI messages, not a separate row per turn. The server writes the array only after a model turn that has no tool call still waiting for output. A crash mid-tool leaves the previous saved transcript in place. The client still has the in-memory messages for the current process.

`GET /sessions` returns id, title, and `createdAt` for the signed-in user, newest first. `GET /sessions/:id` returns the full row, including messages, which `Session` uses as the initial chat state.

### Chat

`POST /chat` body:

```
{ id, messages, mode, model }
```

`id` is the session id. `mode` is `BUILD` or `PLAN`. `model` has to be in `SUPPORTED_CHAT_MODELS`.

The handler loads the session, copies stored messages, and upserts the incoming ones by message id. Incoming messages get `metadata.mode` and `metadata.model` stamped on them. `validateUIMessages` checks the merged list against the tool contracts for that mode. `convertToModelMessages` turns them into provider messages.

`streamText` uses the resolved provider model, `buildSystemPrompt({ mode })`, and the same tool contracts. Those contracts are schemas and descriptions only. There is no `execute` function on the server. The model can ask for `readFile` or `bash`. It cannot run them in the API process.

`resolveChatModel` maps an id to an AI SDK model. Anthropic and OpenAI are wired. Opus, Sonnet, and `gpt-5.4` also get provider thinking options. API keys are the usual `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` environment variables.

The response is a UI message stream. Metadata on the assistant message records mode and model at start, then `durationMs` and token usage at finish.

`onFinish` of that stream:

- Aborted streams are ignored.
- If the assistant message still has a tool part that is not `output-available` or `output-error`, the handler returns without writing the session and without billing. The CLI still has to run the tool and post the result.
- Otherwise the full `event.messages` array is saved on the session.
- Token usage is converted to credits and sent to Polar. A Polar failure is logged. The chat reply is already done.

## Tool loop

This is the part that crosses the process boundary twice per tool call.

```
CLI                          Server                         Model
 |  POST /chat (user text)     |                              |
 | --------------------------> | streamText(tools = schemas)  |
 |                             | -------------------------->  |
 |  UI stream, tool call       | <--------------------------  |
 | <-------------------------- |  (no DB write, no charge)    |
 |  executeLocalTool(cwd)      |                              |
 |  POST /chat (tool output)   |                              |
 | --------------------------> | streamText again             |
 |  assistant text             |                              |
 | <-------------------------- |  save messages, ingest usage |
```

`useChat` sets `sendAutomaticallyWhen` to `lastAssistantMessageIsCompleteWithToolCalls`, so the second POST is automatic. `onToolCall` calls `executeLocalTool` in `packages/cli/src/lib/local-tools.ts`.

File tools resolve the path against `process.cwd()` and reject anything that escapes it. `listDirectory` skips dot entries and `node_modules`. `readFile` caps at 10,000 characters. `glob` caps at 200 files. `grep` shells out to `grep -rn` and caps at 50 matches. `bash` runs `bash -c` in the cwd with a 30 second default timeout and truncates stdout and stderr at 20,000 characters. `editFile` replaces `oldString` only when it occurs once.

`getToolContracts` in shared sends the model the read-only set in `PLAN` and the full set in `BUILD`. `executeLocalTool` checks the mode again and throws if `PLAN` asks for `writeFile`, `editFile`, or `bash`.

## Credits

Polar is the customer and the meter. The Clerk user id is the Polar external customer id.

`requireCreditsBalance` runs before `POST /sessions` and `POST /chat`. It reads the meter balance and rejects with 402 when the balance is 0 or below. A missing Polar customer (404) is treated as balance 0. If Polar cannot be reached, the response is 503.

The check does not reserve the cost of the request. A balance of one credit can still finish a turn that costs more. That is intentional for now. The comment in `require-credits-balance.ts` says so.

After a finished assistant message, `calculateCreditsForUsage` prices input and output tokens from the model's `pricing` in `packages/shared/src/models.ts`. One credit is $0.01. Any non-zero cost rounds up to at least one credit. The server ingests a `nightcode_usage` event whose id is `chat-message:<assistant message id>`, with `{ credits }` in metadata. Zero-credit usage is not ingested.

`/upgrade` calls `POST /billing/checkout` and opens the Polar checkout URL. `/usage` does the same with `POST /billing/portal`. Checkout success lands on `GET /billing/success`, which only tells the user to close the tab.

## What runs where

| Work | Process |
| --- | --- |
| Rendering, keyboard, theme, dialogs | CLI |
| OAuth code exchange | CLI, against Clerk |
| Token check, `userId` | Server, against Clerk |
| Transcript | Postgres, written by the server |
| Model call and tool schema | Server |
| File and shell tools | CLI, in the launch directory |
| Credit balance and usage events | Polar, called by the server |
