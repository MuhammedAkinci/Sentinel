/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
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
