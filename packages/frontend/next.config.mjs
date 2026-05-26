/** @type {import('next').NextConfig} */
const config = {
  // React Strict Mode double-mounts every effect in dev, which races
  // the bootstrap fetcher in useContractEvents against its own cleanup
  // and leaves the live stream empty until a refresh after every
  // navigation. Disabled in dev so the demo recording flows cleanly.
  // Production builds do not double-mount, so behaviour is identical
  // on Vercel either way.
  reactStrictMode: false,
  transpilePackages: ["@sentinel/shared"],
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "ogl"],
  },
  webpack(cfg) {
    cfg.experiments = { ...cfg.experiments, asyncWebAssembly: true };
    // The MetaMask SDK pulls in `@react-native-async-storage/async-storage`
    // at module load. It is only used on React Native and we do not ship
    // for that target — short-circuit the import.
    cfg.resolve.fallback = {
      ...cfg.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
      pino: false,
    };
    return cfg;
  },
};

export default config;
