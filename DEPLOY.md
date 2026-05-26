# Deployment

Deploy the Sentinel frontend (`packages/frontend`) to Vercel from the
GitHub repository so the submission has a public link.

## One-time setup on Vercel

1. Open <https://vercel.com/new> and click **Add New** → **Project**.
2. Pick the GitHub repository `MuhammedAkinci/Sentinel`.
3. In the **Configure Project** form set:
   - **Root Directory**: `packages/frontend`
   - **Framework Preset**: `Next.js` (auto-detected)
   - **Build / Install commands**: leave defaults - the committed
     `packages/frontend/vercel.json` takes over and runs the workspace
     install + build from the repo root.
4. Open **Environment Variables** and paste the entries from
   [`packages/frontend/.env.local.example`](packages/frontend/.env.local.example).
   The values below match the current Shannon deployment; rotate them
   whenever a new Coordinator ships.

```
NEXT_PUBLIC_SITE_URL=https://<your-vercel-domain>
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_DEPLOYER_ADDRESS=0x9221b59a01372e0c55Fe72cCd5e7F3982ae2Fd9c
NEXT_PUBLIC_SENTINEL_WETH=0x7d37e2Eca6AbE57d683dfF4c75F503A42d3dA8e2
NEXT_PUBLIC_SENTINEL_USDC=0x36d208fF8F7A55d966aE02F3Fcd829A46F3ADf67
NEXT_PUBLIC_SENTINEL_PRICE_ORACLE_ADAPTER=0x6ac0acd7beD3eF43C38a31d40e7cC279C63E2437
NEXT_PUBLIC_SENTINEL_LENDING_POOL=0x8d63881b34ed9c2C55862DBbc563555c32F4fF7e
NEXT_PUBLIC_SENTINEL_AGENT_REGISTRY=0xb2Cd2a2d058364dC16f5604aB6171E9D6e88d62d
NEXT_PUBLIC_SENTINEL_REPUTATION=0x81c6796d66aA5a0F6810DBF8Aa4a52E48d42aF56
NEXT_PUBLIC_SENTINEL_SPLITTER=0x8C426852cdF01120222421013Cc5325d4d24446a
NEXT_PUBLIC_SENTINEL_COORDINATOR=0x414B08B04e38F2460e3Fb29078fCdD87d8CbAf80
NEXT_PUBLIC_SENTINEL_AUTO_PROTECTION_VAULT=0xD3fF0Af1F7A806a68fC95711D4D6E85799d4C530
```

After the first deploy succeeds, copy the production URL into
`NEXT_PUBLIC_SITE_URL` so the OpenGraph metadata points back at the
canonical origin, then redeploy.

5. Click **Deploy**. The first build takes ~2 minutes.

## Routes that ship with the deployment

| Route          | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `/`            | Landing - hero, metrics, three-step pipeline, architecture |
| `/dashboard`   | Live event stream, positions, agent debate, case console   |
| `/docs`        | Long-form reference - architecture, wire format, FAQ       |
| `/pitch`       | Six-slide submission deck with keyboard navigation         |

## Subsequent deploys

Every push to the `main` branch triggers an automatic redeploy.
Preview deploys land for every PR. No manual step required.

## Build pipeline (what Vercel runs)

`packages/frontend/vercel.json` overrides the install and build
commands so npm workspaces resolve correctly from inside Vercel's
sub-directory build:

```jsonc
{
  "installCommand": "cd ../.. && npm install",
  "buildCommand":  "cd ../.. && npm run build -w @sentinel/frontend"
}
```

Both commands hop up to the repository root, then npm picks up the
workspace topology and links `@sentinel/shared` into the frontend's
`node_modules` before running `next build`.
