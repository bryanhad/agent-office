# 002: Require `CLAUDE_CODE_OAUTH_TOKEN`, strip API-key variables

**Decision:** The backend runs on my Claude subscription through `CLAUDE_CODE_OAUTH_TOKEN` and exits if it is missing. Before any SDK call it removes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the environment.

**Why:** `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` take precedence over the OAuth token and would silently switch to pay-per-token billing.

**Alternatives considered:**
- Falling back to other credentials when the token is missing (rejected: no fallback).

Details: [vision.md, Authentication](../vision.md#5-authentication-required).
