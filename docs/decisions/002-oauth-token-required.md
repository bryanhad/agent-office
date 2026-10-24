# 002: Require `CLAUDE_CODE_OAUTH_TOKEN`, strip competing credentials

**Decision:** The backend runs on my Claude subscription through `CLAUDE_CODE_OAUTH_TOKEN` and exits if it is missing. Before any SDK call it removes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX` and `CLAUDE_CODE_USE_FOUNDRY` from the environment, warning by name (never by value).

**Why:**
- Claude Code picks credentials in this order: cloud provider (`CLAUDE_CODE_USE_*`), `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `apiKeyHelper`, then `CLAUDE_CODE_OAUTH_TOKEN`. Anything above the token would silently switch billing away from the subscription.
- `apiKeyHelper` is a settings entry, not a variable. It can't load because the session reads only project settings ([decision 009](009-streaming-input-session.md)).

**Verified in the spike** ([sdk-events-sample.md](../notes/sdk-events-sample.md)):
- A garbage token fails with `401 Invalid bearer token` on every turn. The SDK does not fall back to the Mac's stored Claude Code login.
- A real run emits `rate_limit_event` with `five_hour` / `seven_day` utilization, which are subscription limits.
- The init message's `apiKeySource` is `none` for the OAuth token, so it can't tell the token apart from a stored login. Don't use it as proof.

**Subscription use:** The SDK docs say Anthropic doesn't allow third-party developers to offer claude.ai login or subscription rate limits in their products. This is a personal tool running on my machine with my own `claude setup-token` token, so nothing is offered to anyone else. If the app is ever shared, that rule applies and this decision must be revisited.

**Alternatives considered:**
- Falling back to other credentials when the token is missing (rejected: no fallback).
- Stripping only the two API-key variables (rejected: the provider variables also outrank the token).

Details: [vision.md, Authentication](../vision.md#5-authentication-required).
