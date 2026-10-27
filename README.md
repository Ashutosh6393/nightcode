# Nightcode

Nightcode is a terminal coding assistant. You type in a TUI, a model answers on the server, and file and shell tools run on your machine in the directory you launched from.

The repo is a Bun workspace:

| Package | What it is |
| --- | --- |
| `packages/cli` | Terminal UI (`@opentui/react`) |
| `packages/server` | Hono API on port 3000 |
| `packages/database` | Prisma client and Postgres schema |
| `packages/shared` | Models, modes, and tool input schemas |

How a prompt, a tool call, and a credit charge move between those packages is in [architecture.md](architecture.md).

## Requirements

- [Bun](https://bun.sh)
- Postgres
- A Clerk OAuth application (the CLI signs in through the browser)
- A Polar product and credits meter
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` for the models you actually select

## Setup

Copy the root `.env` and fill it in. Bun loads that file when you start commands from the repo root. The database client also reads it explicitly.

```
API_URL=http://localhost:3000
DATABASE_URL=postgresql://...

ANTHROPIC_API_KEY=
OPENAI_API_KEY=

CLERK_FRONTEND_API=
CLERK_OAUTH_CLIENT_ID=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

POLAR_ACCESS_TOKEN=
POLAR_PRODUCT_ID=
POLAR_CREDITS_METER_ID=
POLAR_SERVER=sandbox
```

`API_URL`, `CLERK_FRONTEND_API`, and `CLERK_OAUTH_CLIENT_ID` are read by the CLI. The rest are read by the server, except `POLAR_SERVER`, which defaults to `sandbox`.

Push the schema and generate the client. There is no migrations directory yet, so `db push` is the way to create the `Session` table.

```bash
bun run --cwd packages/database db:generate
bunx --cwd packages/database prisma db push
```

## Run

From the repo root, in two terminals:

```bash
bun --hot packages/server/src/index.ts
bun run dev:cli
```

Inside the TUI, `/login` opens a browser. The access token is written to `~/.nightcode/auth.json` (directory `0700`, file `0600`). Creating a session or sending a message returns 401 until that file exists, and 402 when the Polar credits balance is zero. `/upgrade` opens checkout. `/usage` opens the customer portal.

## Commands

Type `/` in the input bar.

| Command | Effect |
| --- | --- |
| `/new` | Back to the home screen |
| `/agents` | Switch `BUILD` and `PLAN` |
| `/models` | Pick a chat model |
| `/sessions` | Open a past session |
| `/theme` | Change the color theme |
| `/login` | Browser sign-in |
| `/logout` | Delete the local token |
| `/upgrade` | Buy credits |
| `/usage` | Billing portal |
| `/exit` | Quit |

`BUILD` can read, write, edit, and run shell commands. `PLAN` can only read, list, glob, and grep. The model is told that, and the CLI refuses the write tools again if a `PLAN` turn still asks for them.

Default model is `claude-opus-4-6`. The list lives in `packages/shared/src/models.ts`.
