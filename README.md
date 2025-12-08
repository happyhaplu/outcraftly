# Next.js SaaS Starter Kit

A comprehensive, production-ready SaaS starter kit built with Next.js 15, PostgreSQL, Stripe, and modern web technologies. This project provides a complete foundation for building scalable Software-as-a-Service applications with authentication, payments, team management, and a beautiful UI component library.

## 🚀 Project Overview

This SaaS starter kit is designed to accelerate your development process by providing:

- **Complete Authentication System** - JWT-based auth with secure session management
- **Multi-tenant Architecture** - Team-based organization with role-based access control
- **Stripe Integration** - Subscription billing, customer portal, and webhooks
- **Modern UI Components** - Radix UI primitives with Tailwind CSS styling
- **Type-safe Database** - Drizzle ORM with PostgreSQL and migrations
- **Production Ready** - Middleware, error handling, and security best practices

## 🛠️ Tech Stack

### Core Framework
- **Next.js 15** - React framework with App Router (using canary build)
- **React 19** - Latest React with concurrent features
- **TypeScript** - Full type safety throughout the application
- **Tailwind CSS 4.1.7** - Utility-first CSS framework with latest features

### Database & ORM
- **PostgreSQL** - Robust relational database
- **Drizzle ORM** - Type-safe SQL ORM with migrations
- **Drizzle Kit** - Database introspection and migration tools

### Authentication & Security
- **JWT (jose)** - JSON Web Tokens for session management
- **bcryptjs** - Password hashing with salt rounds
- **Custom Middleware** - Route protection and session refresh
- **Zod** - Runtime type validation for forms and APIs

### Payments & Billing
- **Stripe** - Complete payment processing and subscription management
- **Webhooks** - Real-time subscription status updates
- **Customer Portal** - Self-service billing management

### UI & Components
- **Radix UI** - Unstyled, accessible UI primitives
- **Lucide React** - Beautiful icon library
- **Class Variance Authority** - Component variant management
- **SWR** - Data fetching with caching and revalidation

### Development Tools
- **Docker Compose** - Containerized development environment
- **ESLint & Prettier** - Code linting and formatting
- **PostCSS** - CSS processing and optimization

## 📁 Project Structure

```
├── app/                          # Next.js App Router
│   ├── (dashboard)/             # Protected dashboard routes
│   │   ├── layout.tsx           # Dashboard layout with navigation
│   │   ├── page.tsx            # Main dashboard page
│   │   ├── terminal.tsx        # Terminal component (placeholder)
│   │   ├── dashboard/          # Dashboard sub-routes
│   │   │   ├── activity/       # User activity logs
│   │   │   ├── general/        # General settings
│   │   │   └── security/       # Security settings
│   │   └── pricing/            # Subscription pricing page
│   ├── (login)/                # Authentication routes
│   │   ├── actions.ts          # Server actions for auth
│   │   ├── login.tsx           # Login form component
│   │   ├── sign-in/           # Sign-in page
│   │   └── sign-up/           # Sign-up page
│   ├── api/                    # API routes
│   │   ├── stripe/            # Stripe webhook handlers
│   │   ├── team/              # Team management API
│   │   └── user/              # User management API
│   ├── globals.css            # Global styles
│   ├── layout.tsx             # Root layout with SWR config
│   └── not-found.tsx          # 404 page
│
├── components/                  # Reusable UI components
│   └── ui/                     # Base UI components (Radix + Tailwind)
│       ├── avatar.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       └── radio-group.tsx
│
├── design/                     # Design system and UI vision
│   ├── src/components/        # Complete component library
│   │   ├── contacts/          # Contact management components
│   │   ├── layout/           # Layout and navigation components
│   │   └── ui/               # Comprehensive UI component set
│   └── pages/                # Example pages and features
│       ├── Analytics.tsx     # Analytics dashboard
│       ├── Contacts.tsx      # Contact management
│       ├── Dashboard.tsx     # Main dashboard
│       ├── Sequences.tsx     # Email sequences
│       └── Settings.tsx      # Application settings
│
├── lib/                        # Core application logic
│   ├── auth/                  # Authentication utilities
│   │   ├── middleware.ts      # Auth middleware helpers
│   │   └── session.ts         # JWT session management
│   ├── db/                    # Database configuration
│   │   ├── drizzle.ts        # Database connection
│   │   ├── schema.ts         # Database schema definitions
│   │   ├── queries.ts        # Common database queries
│   │   ├── seed.ts           # Database seeding
│   │   ├── setup.ts          # Database initialization
│   │   └── migrations/       # SQL migration files
│   ├── payments/             # Payment processing
│   │   ├── actions.ts        # Payment server actions
│   │   └── stripe.ts         # Stripe integration
│   └── utils.ts              # Utility functions
│
├── middleware.ts              # Next.js middleware for route protection
├── drizzle.config.ts         # Drizzle ORM configuration
├── next.config.ts            # Next.js configuration
├── docker-compose.yml        # Development environment setup
└── package.json              # Dependencies and scripts
```

## 🔥 Features

### Authentication & User Management
- **JWT Session Management** - Secure token-based authentication
- **Password Security** - bcrypt hashing with salt rounds
- **Route Protection** - Middleware-based access control
- **Session Refresh** - Automatic token renewal on valid requests
- **User Registration** - Email validation and secure account creation
- **Login/Logout** - Complete authentication flow

**Implementation:**
- Session tokens stored in HTTP-only cookies
- Automatic session refresh on page navigation
- Protected routes redirect to sign-in
- Password validation with minimum length requirements

### Team & Multi-tenancy
- **Team Creation** - Automatic team creation on user registration
- **Team Membership** - Role-based access (owner, admin, member)
- **Invitations** - Email-based team member invitations
- **Activity Logging** - Comprehensive audit trail
- **Team Settings** - Configurable team preferences

**Database Schema:**
- `users` - User accounts and authentication
- `teams` - Team/organization data
- `team_members` - Many-to-many relationship with roles
- `invitations` - Pending team invitations
- `activity_logs` - User and team activity tracking

### Stripe Payment Integration
- **Subscription Billing** - Recurring payment processing
- **Customer Portal** - Self-service billing management
- **Trial Periods** - 14-day free trial for new subscriptions
- **Webhook Handling** - Real-time subscription status updates
- **Multiple Plans** - Support for different pricing tiers
- **Proration** - Automatic billing adjustments for plan changes

**Features:**
- Checkout session creation with trial periods
- Customer portal for subscription management
- Webhook validation and processing
- Subscription status synchronization
- Price and product management

### Database & ORM
- **Type-safe Schema** - Drizzle ORM with TypeScript
- **Migrations** - Version-controlled database changes
- **Relations** - Properly defined foreign key relationships
- **Queries** - Optimized database access patterns
- **Seeding** - Development data setup

**Schema Design:**
```typescript
// Core entities with relationships
users -> team_members <- teams
teams -> activity_logs
teams -> invitations
users -> invitations (invited_by)
```

### UI Component System
- **Radix UI Primitives** - Accessible, unstyled components
- **Tailwind Styling** - Utility-first CSS approach
- **Component Variants** - CVA for consistent styling
- **Design Tokens** - Centralized color and spacing system
- **Responsive Design** - Mobile-first responsive layouts

**Available Components:**
- Form elements (input, button, label, radio-group)
- Layout components (card, avatar)
- Navigation (dropdown-menu)
- Data display (tables, lists, avatars)
- Feedback (alerts, toasts, loading states)

### API Architecture
- **RESTful Endpoints** - Standard HTTP methods and status codes
- **Server Actions** - Next.js server-side form handling
- **Type Validation** - Zod schemas for request validation
- **Error Handling** - Consistent error responses
- **Middleware Integration** - Authentication and authorization

**API Routes:**
- `/api/user` - User profile management
- `/api/team` - Team operations and member management
- `/api/stripe/checkout` - Payment processing
- `/api/stripe/webhook` - Stripe event handling

### Design System Vision
The `design/` folder contains a comprehensive UI vision including:

- **Analytics Dashboard** - Charts, metrics, and KPI displays
- **Contact Management** - CRM-style contact organization
- **Email Sequences** - Marketing automation interfaces
- **Settings Pages** - User and team configuration
- **Advanced Components** - Tables, forms, modals, charts

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Stripe account (for payments)
- pnpm package manager

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd saas-starter
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Environment Setup**
Create a `.env.local` file with the following variables:
```env
# Database
POSTGRES_URL="postgresql://username:password@localhost:5432/database"

# Authentication
AUTH_SECRET="your-32-character-secret-key"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Application
BASE_URL="http://localhost:3000"
```

4. **Database Setup**
```bash
# Initialize database
pnpm db:setup

# Run migrations
pnpm db:migrate

# Seed with sample data (optional)
pnpm db:seed

# Open Drizzle Studio (optional)
pnpm db:studio
```

5. **Start Development Server**
```bash
pnpm dev
```

The application will be available at `http://localhost:3000`.

### Docker Development (Alternative)

1. **Start PostgreSQL with Docker**
```bash
docker-compose up -d
```

2. **Run database setup**
```bash
pnpm db:setup
pnpm db:migrate
```

3. **Start development server**
```bash
pnpm dev
```

## 🧪 Testing & Validation

### Database Testing
- **Schema Validation** - Drizzle validates types at compile time
- **Migration Testing** - Test migrations with `pnpm db:migrate`
- **Query Testing** - Use Drizzle Studio to inspect data

### Authentication Testing
1. **User Registration** - Test sign-up flow with email validation
2. **Login/Logout** - Verify session creation and destruction
3. **Route Protection** - Test middleware redirection
4. **Session Refresh** - Verify automatic token renewal

### Payment Testing
1. **Stripe Test Mode** - Use Stripe test cards for checkout
2. **Webhook Testing** - Use Stripe CLI for local webhook testing
3. **Subscription Flow** - Test complete billing cycle

### API Testing
- **Form Validation** - Test Zod schema validation
- **Error Handling** - Verify proper error responses
- **Authorization** - Test protected endpoint access

## 📋 Available Scripts

```bash
# Development
pnpm dev                 # Start development server with Turbopack
pnpm build              # Build for production
pnpm start              # Start production server

# Database
pnpm db:setup           # Initialize database
pnpm db:generate        # Generate migration files
pnpm db:migrate         # Run pending migrations
pnpm db:seed           # Seed database with sample data
pnpm db:studio         # Open Drizzle Studio
```

## 🔧 Configuration

### Next.js Configuration
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    ppr: true,                  // Partial Pre-rendering
    clientSegmentCache: true,   // Client-side caching
    nodeMiddleware: true        // Node.js middleware support
  }
};
```

### Database Configuration
```typescript
// drizzle.config.ts
export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
} satisfies Config;
```

### Tailwind Configuration
- Custom color palette for brand consistency
- Component-specific styling patterns
- Responsive breakpoint system
- Dark mode support ready

## 🔐 Security Features

### Authentication Security
- JWT tokens with expiration
- HTTP-only secure cookies
- CSRF protection via SameSite cookies
- Password hashing with bcrypt
- Session invalidation on logout

### Route Protection
- Middleware-based access control
- Automatic redirects for unauthenticated users
- Role-based authorization
- Protected API endpoints

### Data Security
- SQL injection prevention via Drizzle ORM
- Input validation with Zod schemas
- Environment variable protection
- Database connection encryption

## 🚀 Deployment

### Environment Variables
Ensure all production environment variables are set:
- `POSTGRES_URL` - Production database connection
- `AUTH_SECRET` - Cryptographically secure secret
- `STRIPE_SECRET_KEY` - Production Stripe key
- `BASE_URL` - Production domain URL

### Database Migration
```bash
pnpm db:migrate  # Run in production environment
```

### Build Process
```bash
pnpm build      # Optimized production build
pnpm start      # Start production server
```

## 🤝 Contributing

### Development Workflow
1. Create feature branch from main
2. Implement changes with proper types
3. Test authentication and payment flows
4. Update documentation if needed
5. Submit pull request with detailed description

### Code Standards
- TypeScript strict mode enabled
- ESLint configuration for consistency
- Proper error handling patterns
- Component composition over inheritance
- Server actions for form handling

### Database Changes
1. Update schema in `lib/db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Test migration: `pnpm db:migrate`
4. Update queries if needed

## 🗺️ Roadmap

### Immediate Features (Based on Design Folder)
- **Analytics Dashboard** - Revenue, user growth, and engagement metrics
- **Contact Management** - CRM functionality with import/export
- **Email Sequences** - Marketing automation workflows
- **Advanced Settings** - User preferences and team configuration
- **Billing History** - Invoice management and payment history

### Planned Enhancements
- **API Documentation** - OpenAPI/Swagger integration
- **Email Services** - Transactional email with templates
- **File Uploads** - S3/CloudFlare R2 integration
- **Search Functionality** - Full-text search across entities
- **Audit Logging** - Enhanced activity tracking
- **Webhooks** - Custom webhook system for integrations

### UI/UX Improvements
- **Charts & Graphs** - Data visualization components
- **Advanced Tables** - Sorting, filtering, pagination
- **Modal System** - Consistent modal management
- **Toast Notifications** - User feedback system
- **Loading States** - Skeleton screens and spinners

### Performance Optimizations
- **Database Indexing** - Query optimization
- **Caching Strategy** - Redis integration
- **Image Optimization** - Next.js Image component
- **Bundle Analysis** - Code splitting optimization
- **CDN Integration** - Static asset delivery

## 📚 Additional Resources

### Documentation
- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Guide](https://orm.drizzle.team/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

### Community
- Join discussions about SaaS development
- Share your implementations and improvements
- Report issues and feature requests
- Contribute to the growing ecosystem

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using Next.js, PostgreSQL, and Stripe**

For questions, issues, or contributions, please refer to the project's GitHub repository.