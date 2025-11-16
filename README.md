# Next.js SaaS Starter

This is a starter template for building a SaaS application using **Next.js** with support for authentication, Stripe integration for payments, and a dashboard for logged-in users.

**Demo: [https://next-saas-start.vercel.app/](https://next-saas-start.vercel.app/)**

## Features

- Marketing landing page (`/`) with animated Terminal element
- Pricing page (`/pricing`) which connects to Stripe Checkout
- Dashboard pages with CRUD operations on users/teams
- Basic RBAC with Owner and Member roles
- Subscription management with Stripe Customer Portal
- Email/password authentication with JWTs stored to cookies
- Global middleware to protect logged-in routes
- Local middleware to protect Server Actions or validate Zod schemas
- Activity logging system for any user events

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/)
- **Database**: [Postgres](https://www.postgresql.org/)
- **ORM**: [Drizzle](https://orm.drizzle.team/)
- **Payments**: [Stripe](https://stripe.com/)
- **UI Library**: [shadcn/ui](https://ui.shadcn.com/)

## Getting Started

```bash
git clone https://github.com/nextjs/saas-starter
cd saas-starter
pnpm install
```

## Running Locally

[Install](https://docs.stripe.com/stripe-cli) and log in to your Stripe account:

```bash
stripe login
```

Use the included setup script to create your `.env` file:

```bash
pnpm db:setup
```

Run the database migrations and seed the database with a default user and team:

```bash
pnpm db:migrate
pnpm db:seed
```

This will create the following user and team:

- User: `test@test.com`
- Password: `admin123`

You can also create new users through the `/sign-up` route.

Finally, run the Next.js development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the app in action.

You can listen for Stripe webhooks locally through their CLI to handle subscription change events:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### Sequence worker

Set the `SEQUENCE_WORKER_SECRET` environment variable to a strong random string. This value is required to authenticate scheduled runs of the sequence delivery worker.

- Run the worker manually with `pnpm worker:run [--limit <count>] [--team <teamId>]` during development.
- Configure a cron job (e.g. Vercel Cron) to call `GET /api/internal/cron/sequence-worker?token=<SEQUENCE_WORKER_SECRET>` on a cadence that fits your sending limits. Optional query parameters:
	- `limit`: Maximum deliveries to process in a single run (defaults to 25)
	- `teamId`: Restrict a run to one workspace

The endpoint returns a JSON payload with the worker metrics so you can monitor executions from your scheduler.

### Trial expiry automation

- Run the trial clean-up manually with `pnpm trial:expire`. The script deactivates every account whose trial window lapsed and logs the affected user emails.
- Schedule the command in your hosting provider (e.g. Vercel Cron, GitHub Actions, or a traditional cron job) to execute once per day so newly expired trials are blocked automatically.
- Set the `BASE_URL` and database environment variables in the scheduled job so the script can connect to Postgres. The command exits cleanly after closing the pooled connection.

### Sequence lifecycle statuses

- Newly created sequences now start in a **Draft** state. Launch them via the dashboard when you are ready to begin sending.
- Draft sequences cannot accept enrollments until they are launched (the UI will prompt you to resume/launch first).
- Apply the migrations `lib/db/migrations/0019_add_sequence_draft_status.sql` and `lib/db/migrations/0020_add_sequence_launch_at.sql` after pulling these changes. If you are using Drizzle Kit, run:

```bash
pnpm db:migrate
```

If you manage migrations manually, execute the SQL file against your database before deploying.

## Testing Payments

To test Stripe payments, use the following test card details:

- Card Number: `4242 4242 4242 4242`
- Expiration: Any future date
- CVC: Any 3-digit number

## Going to Production

When you're ready to deploy your SaaS application to production, follow these steps:

### Set up a production Stripe webhook

1. Go to the Stripe Dashboard and create a new webhook for your production environment.
2. Set the endpoint URL to your production API route (e.g., `https://yourdomain.com/api/stripe/webhook`).
3. Select the events you want to listen for (e.g., `checkout.session.completed`, `customer.subscription.updated`).

### Deploy to Vercel

1. Push your code to a GitHub repository.
2. Connect your repository to [Vercel](https://vercel.com/) and deploy it.
3. Follow the Vercel deployment process, which will guide you through setting up your project.

### Add environment variables

In your Vercel project settings (or during deployment), add all the necessary environment variables. Make sure to update the values for the production environment, including:

1. `BASE_URL`: Set this to your production domain.
2. `STRIPE_SECRET_KEY`: Use your Stripe secret key for the production environment.
3. `STRIPE_WEBHOOK_SECRET`: Use the webhook secret from the production webhook you created in step 1.
4. `POSTGRES_URL`: Set this to your production database URL.
5. `AUTH_SECRET`: Set this to a random string. `openssl rand -base64 32` will generate one.

## Production Variables Matrix

| Variable | Purpose | Required | Example |
| --- | --- | --- | --- |
| `POSTGRES_URL` | Connection string for the Postgres database | Yes | `postgresql://postgres:postgres@localhost:54322/postgres` |
| `STRIPE_SECRET_KEY` | Stripe API key for billing operations | Yes | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook signatures | Yes | `whsec_...` |
| `BASE_URL` | Public site URL used in links and callbacks | Yes | `https://yourdomain.com` |
| `AUTH_SECRET` | JWT signing key for user sessions (32+ bytes) | Yes | Output of `openssl rand -base64 32` |
| `SENDER_CREDENTIALS_KEY` | Encryption key for stored SMTP credentials | Yes | `your-32-character-secret-must-be-long` |
| `SEQUENCE_EVENTS_SECRET` | Authenticates webhook events from sequence tracker | Yes | `random-sequence-events-secret` |
| `SEQUENCE_WORKER_SECRET` | Protects `/api/internal/cron/sequence-worker` endpoint | Yes | `random-sequence-worker-token` |
| `REPLY_WORKER_SECRET` | Protects `/api/internal/cron/reply-worker` endpoint | Yes | `random-reply-worker-token` |
| `MIN_SEND_INTERVAL_MINUTES` | Overrides default pacing interval between sends | No (defaults to `5`) | `5` |
| `DEBUG_INBOUND` | Enables verbose inbound mail logging | No (defaults to `false`) | `false` |

### Generating Strong Secrets

Create secure values for `AUTH_SECRET` and `SENDER_CREDENTIALS_KEY` before deploying:

```bash
openssl rand -base64 32
```

Store the generated strings in your production environment provider.

## Deployment Checklist

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Apply database migrations and seed baseline data**

   ```bash
   pnpm db:migrate && pnpm db:seed
   ```

3. **Build and smoke-test the production bundle**

   ```bash
   pnpm build && pnpm start
   ```

4. **Configure workers**
   - Set `SEQUENCE_WORKER_SECRET` and `REPLY_WORKER_SECRET` in your hosting provider.
   - Schedule the sequence worker: `curl "$BASE_URL/api/internal/cron/sequence-worker?token=$SEQUENCE_WORKER_SECRET"`.
   - Schedule the reply worker: `curl "$BASE_URL/api/internal/cron/reply-worker?token=$REPLY_WORKER_SECRET"`.

5. **Stripe webhook setup**
   - Create or update a Stripe webhook pointing to `$BASE_URL/api/stripe/webhook`.
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

6. **Cron job examples**

   Example GitHub Actions snippet to invoke the workers nightly:

   ```yaml
   name: Worker Cron
   on:
     schedule:
       - cron: '0 * * * *'
   jobs:
     sequence-worker:
       runs-on: ubuntu-latest
       steps:
         - name: Trigger sequence worker
           run: |
             curl "$BASE_URL/api/internal/cron/sequence-worker?token=$SEQUENCE_WORKER_SECRET"
           env:
             BASE_URL: ${{ secrets.BASE_URL }}
             SEQUENCE_WORKER_SECRET: ${{ secrets.SEQUENCE_WORKER_SECRET }}
     reply-worker:
       runs-on: ubuntu-latest
       steps:
         - name: Trigger reply worker
           run: |
             curl "$BASE_URL/api/internal/cron/reply-worker?token=$REPLY_WORKER_SECRET"
           env:
             BASE_URL: ${{ secrets.BASE_URL }}
             REPLY_WORKER_SECRET: ${{ secrets.REPLY_WORKER_SECRET }}
   ```

   Or configure Render Cron with a JSON payload:

   ```json
   {
     "tasks": [
       {
         "name": "sequence-worker",
         "schedule": "*/15 * * * *",
         "command": "curl \"$BASE_URL/api/internal/cron/sequence-worker?token=$SEQUENCE_WORKER_SECRET\""
       },
       {
         "name": "reply-worker",
         "schedule": "0 * * * *",
         "command": "curl \"$BASE_URL/api/internal/cron/reply-worker?token=$REPLY_WORKER_SECRET\""
       }
     ]
   }
   ```

  ## Workers and Cron Jobs

  Use the following authenticated curl calls from your scheduler to invoke the workers:

  ```bash
  curl "$BASE_URL/api/internal/cron/sequence-worker?token=$SEQUENCE_WORKER_SECRET"
  curl "$BASE_URL/api/internal/cron/reply-worker?token=$REPLY_WORKER_SECRET"
  ```

  - Sequence worker: run every 5–15 minutes to keep enrollments flowing smoothly without overrunning your provider limits.
  - Reply worker: run every 15–30 minutes so inbound responses are processed promptly.
  - Required environment variables: `BASE_URL`, `SEQUENCE_WORKER_SECRET`, and `REPLY_WORKER_SECRET` must be present in the scheduler context.

  Example Render Cron configuration:

  ```json
  {
    "tasks": [
      {
        "name": "sequence-worker",
        "schedule": "*/10 * * * *",
        "command": "curl \"$BASE_URL/api/internal/cron/sequence-worker?token=$SEQUENCE_WORKER_SECRET\""
      },
      {
        "name": "reply-worker",
        "schedule": "*/30 * * * *",
        "command": "curl \"$BASE_URL/api/internal/cron/reply-worker?token=$REPLY_WORKER_SECRET\""
      }
    ]
  }
  ```

  Example GitHub Actions workflow if you prefer to schedule via Actions:

  ```yaml
  name: Worker Cron
  on:
    schedule:
      - cron: '*/10 * * * *'
  jobs:
    sequence-worker:
      runs-on: ubuntu-latest
      steps:
        - name: Trigger sequence worker
          run: |
            curl "$BASE_URL/api/internal/cron/sequence-worker?token=$SEQUENCE_WORKER_SECRET"
          env:
            BASE_URL: ${{ secrets.BASE_URL }}
            SEQUENCE_WORKER_SECRET: ${{ secrets.SEQUENCE_WORKER_SECRET }}
    reply-worker:
      runs-on: ubuntu-latest
      steps:
        - name: Trigger reply worker
          run: |
            curl "$BASE_URL/api/internal/cron/reply-worker?token=$REPLY_WORKER_SECRET"
          env:
            BASE_URL: ${{ secrets.BASE_URL }}
            REPLY_WORKER_SECRET: ${{ secrets.REPLY_WORKER_SECRET }}
  ```

