import 'next/server';

type AppRouteParams = Record<string, string | string[] | undefined>;

declare module 'next/server' {
  export type RouteContext = {
    params: Promise<AppRouteParams>;
  };
}
