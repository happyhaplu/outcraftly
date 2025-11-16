const config = {
  dynamic: 'force-dynamic',
  revalidate: 0,
  fetchCache: 'force-no-store' as const,
  runtime: 'nodejs' as const
};

export default config;
