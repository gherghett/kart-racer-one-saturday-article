# Kart Racer: One Saturday

**[Read the article](https://gherghett.github.io/kart-racer-one-saturday-article/)**

An interactive article documenting building a browser-based 3D kart racing game from scratch in a single Saturday (Feb 14, 2026) using Claude Code.

## How this was made

Claude Code saves full chat history locally in `~/.claude/` as JSONL files — every message, tool call, and file edit. I had a [report template](https://github.com/gherghett/report-template) I'd made for presenting project work with interactive sidebars for browsing files and chat logs.

So I wondered: what if I just gave Claude Code two timestamps and said "make a report of what I did between these times"? It turns out the chat history has everything — timestamps, which projects were worked on, what files were created and modified, what was discussed. Claude scanned `~/.claude/history.jsonl` to find the sessions in the time range, extracted the conversations, reconstructed code snapshots by replaying 607 Write/Edit operations from the JSONL files, and wrote the narrative.

The screenshots were taken manually by running the reconstructed snapshots at each milestone.

## What's in here

- `index.html` — the report, open it in a browser
- `*.jsonl` — cleaned chat session logs (metadata stripped, text only)
- `snapshots/` — full project source code at 5 milestones through the day, reconstructed from chat history
- `report/` — the report viewer engine (JS/CSS)
- `*.png` — screenshots from the kart game at various stages
