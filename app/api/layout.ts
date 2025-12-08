// Force all API routes to be dynamic (not statically pre-rendered during build)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
