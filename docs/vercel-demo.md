# Hosted Job Winner connection

This fork's production Vercel build sends GraphQL requests to its same-origin `/api/graphql` function. That function forwards to the local Job Winner backend through a dedicated Cloudflare Tunnel. The backend stays bound to `127.0.0.1:8080` on the Hermes host and uses the file-backed H2 database in `/opt/data/job-winner/data/`.

Vercel Authentication protects **all deployments**, including production and previews. Cloudflare Access protects the tunnel hostname with a dedicated service-token policy. The service-token ID and secret are Vercel encrypted environment variables; neither belongs in frontend JavaScript or this repository. Set `JOB_WINNER_UPSTREAM_URL`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` in the Vercel project before deploying. The production build requires `VITE_MOCK_API=false`. If the tunnel or local backend is unavailable, the UI must show an API error rather than silently using sample data.

The public URL is functional only while the local backend and tunnel connector are running. Verify the full integration by creating a test application in the authenticated UI, reloading, reading it back from GraphQL, and then deleting that exact fixture.
