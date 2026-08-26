# Domain docs

Alaga uses a single-context domain-document layout.

## Before exploring

Read `CONTEXT.md` at the repository root when it exists. Read relevant decisions under `docs/adr/` before changing the affected area.

Missing context files are expected. Proceed silently. The domain-modeling workflow creates them only when terminology or a durable architectural decision is actually resolved.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

`CONTEXT.md` is a glossary of domain concepts, not an implementation specification. Use its canonical vocabulary in issues, tests, hypotheses, and code.

Surface conflicts with existing ADRs explicitly instead of silently overriding them.
